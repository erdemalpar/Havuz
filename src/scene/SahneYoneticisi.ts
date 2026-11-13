import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isikYonuHesapla, KaynakTemizlenebilir } from '../types/simulation';

export type YenidenBoyutlandirDinleyici = (genislik: number, yukseklik: number) => void;

const ARKA_PLAN_RENGI = 0x0b1524;
const YARIM_KURE_GOK_RENGI = 0xe6f2ff;
const YARIM_KURE_YER_RENGI = 0x2c3b4c;
const GUNES_ISIGI_MESAFESI = 18;

/**
 * WebGL2 bağlamını, olimpik kapalı spor kompleksi sahnesini, arena
 * aydınlatmasını, kamerayı, OrbitControls etkileşimini ve pencere
 * yeniden boyutlandırmasını yöneten sınıf.
 */
export class SahneYoneticisi implements KaynakTemizlenebilir {
  public readonly kapsayici: HTMLElement;
  public readonly tuval: HTMLCanvasElement;
  public readonly sahne: THREE.Scene;
  public readonly kamera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly kontroller: OrbitControls;
  public readonly yarimKureIsigi: THREE.HemisphereLight;
  public readonly yonIsigi: THREE.DirectionalLight;
  public readonly onDolguIsigi: THREE.DirectionalLight;
  public readonly arkaDolguIsigi: THREE.DirectionalLight;
  public readonly webgl2AktifMi: boolean;
  public readonly floatFboDestegiVarMi: boolean;
  public readonly maksimumAnizotropi: number;

  public yenidenBoyutlandirDinleyici: YenidenBoyutlandirDinleyici | null = null;

  private readonly pencereBoyutOlayIsleyici: () => void;
  private sonGenislik = 0;
  private sonYukseklik = 0;
  private temizlendiMi = false;

  constructor(kapsayici: HTMLElement) {
    this.kapsayici = kapsayici;
    this.tuval = document.createElement('canvas');
    this.tuval.style.display = 'block';
    this.tuval.style.width = '100%';
    this.tuval.style.height = '100%';

    // WebGL2 bağlamını zorunlu parametrelerle başlat
    const glBaglami = this.tuval.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    if (!glBaglami) {
      throw new Error(
        'WebGL2 bağlamı başlatılamadı. Lütfen WebGL2 destekleyen güncel bir tarayıcı veya GPU sürücüsü kullanın.',
      );
    }

    // Float render hedefi uzantısını ve WebGL2 yeteneğini kaydet
    this.floatFboDestegiVarMi = Boolean(glBaglami.getExtension('EXT_color_buffer_float'));

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.tuval,
      context: glBaglami,
      antialias: true,
    });

    this.webgl2AktifMi = this.renderer.capabilities.isWebGL2;
    this.maksimumAnizotropi = this.renderer.capabilities.getMaxAnisotropy();

    const { genislik, yukseklik } = this.kapsayiciOlculeriniAl();
    this.sonGenislik = genislik;
    this.sonYukseklik = yukseklik;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(genislik, yukseklik, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.kapsayici.appendChild(this.tuval);

    // Kapalı spor kompleksi (Natatorium) arka planı
    this.sahne = new THREE.Scene();
    this.sahne.background = new THREE.Color(ARKA_PLAN_RENGI);

    // Arena tavan ve zemin yansıması için dengeli yarım küre ışığı
    this.yarimKureIsigi = new THREE.HemisphereLight(
      YARIM_KURE_GOK_RENGI,
      YARIM_KURE_YER_RENGI,
      1.05,
    );
    this.sahne.add(this.yarimKureIsigi);

    // Ana arena projektör / çatı ışığı (kullanıcı azimut ve yükseklik açısıyla senkronize)
    this.yonIsigi = new THREE.DirectionalLight(0xfff9f0, 1.80);
    this.gunesIsigiYonuGuncelle(42, 66);
    this.sahne.add(this.yonIsigi);

    // Tribünler, çelik makaslar ve paslanmaz ekipmanlar için yumuşak arena dolgu ışıkları
    this.onDolguIsigi = new THREE.DirectionalLight(0xdbeafe, 0.48);
    this.onDolguIsigi.position.set(-10, 8, -12);
    this.sahne.add(this.onDolguIsigi);

    this.arkaDolguIsigi = new THREE.DirectionalLight(0xe0f2fe, 0.38);
    this.arkaDolguIsigi.position.set(11, 7, 12);
    this.sahne.add(this.arkaDolguIsigi);

    // Olimpik arena ve 10m tramplen panoramasını kapsayan geniş perspektif kamera
    this.kamera = new THREE.PerspectiveCamera(45, genislik / yukseklik, 0.1, 150);
    this.kamera.position.set(11.8, 6.8, -13.4);
    this.kamera.lookAt(0, 1.4, 0.5);

    // OrbitControls kurulumu (uzak panorama ve su altı bakışı dahil)
    this.kontroller = new OrbitControls(this.kamera, this.tuval);
    this.kontroller.enableDamping = true;
    this.kontroller.dampingFactor = 0.06;
    this.kontroller.minDistance = 2.2;
    this.kontroller.maxDistance = 34.0;
    this.kontroller.maxPolarAngle = Math.PI * 0.86;
    this.kontroller.target.set(0, 1.4, 0.5);
    this.kontroller.update();

    this.pencereBoyutOlayIsleyici = (): void => {
      this.boyutlandirmayiIsle();
    };
    window.addEventListener('resize', this.pencereBoyutOlayIsleyici);
  }

  /**
   * Kapsayıcı elemanın güncel genişlik ve yükseklik değerlerini güvenli sınırlar içinde okur.
   */
  private kapsayiciOlculeriniAl(): { genislik: number; yukseklik: number } {
    const genislik = Math.max(1, this.kapsayici.clientWidth || window.innerWidth);
    const yukseklik = Math.max(1, this.kapsayici.clientHeight || window.innerHeight);
    return { genislik, yukseklik };
  }

  /**
   * Pencere boyutu değiştiğinde kamera en-boy oranını ve renderer tuvalini günceller,
   * ardından kayıtlı yeniden boyutlandırma dinleyicisini tetikler.
   */
  private boyutlandirmayiIsle(): void {
    if (this.temizlendiMi) {
      return;
    }

    const { genislik, yukseklik } = this.kapsayiciOlculeriniAl();
    if (genislik === this.sonGenislik && yukseklik === this.sonYukseklik) {
      return;
    }

    this.sonGenislik = genislik;
    this.sonYukseklik = yukseklik;

    this.kamera.aspect = genislik / yukseklik;
    this.kamera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(genislik, yukseklik, false);

    if (this.yenidenBoyutlandirDinleyici) {
      this.yenidenBoyutlandirDinleyici(genislik, yukseklik);
    }
  }

  /**
   * Yeniden boyutlandırma olaylarında tetiklenecek geri çağırma fonksiyonunu atar.
   */
  public yenidenBoyutlandirDinleyiciAta(dinleyici: YenidenBoyutlandirDinleyici | null): void {
    this.yenidenBoyutlandirDinleyici = dinleyici;
  }

  /**
   * Azimut ve yükseklik açılarına göre ana arena/güneş ışığının konumunu günceller.
   */
  public gunesIsigiYonuGuncelle(azimutDerece: number, yukseklikDerece: number): void {
    const isikGidisYonu = isikYonuHesapla(azimutDerece, yukseklikDerece);
    this.yonIsigi.position.copy(isikGidisYonu).multiplyScalar(-GUNES_ISIGI_MESAFESI);
  }

  /**
   * OrbitControls sönümleme hareketini kare başına ilerletir.
   */
  public guncelle(): void {
    this.kontroller.update();
  }

  /**
   * Sahneyi aktif kamera üzerinden ekrana işler.
   */
  public isle(): void {
    this.renderer.render(this.sahne, this.kamera);
  }

  /**
   * Sahne yöneticisi tarafından oluşturulan dinleyici, kontrolcü ve GPU kaynaklarını temizler.
   */
  public temizle(): void {
    if (this.temizlendiMi) {
      return;
    }
    this.temizlendiMi = true;

    window.removeEventListener('resize', this.pencereBoyutOlayIsleyici);
    this.yenidenBoyutlandirDinleyici = null;

    this.kontroller.dispose();
    this.renderer.dispose();
    this.tuval.remove();
  }
}
