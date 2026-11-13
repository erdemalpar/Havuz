import * as THREE from 'three';
import {
  HAVUZ_SABITLERI,
  isikYonuHesapla,
  type CausticsTexture,
  type ObjectBoundingData,
  type OptikGuncellemeGirdisi,
  type OptikIsleyiciArayuzu,
} from '../types/simulation';
import {
  CausticsShader,
  type OrtakOptikUniformlari,
} from './CausticsShader';
import { PoolShader } from './PoolShader';
import { UnderwaterObjectShader } from './UnderwaterObjectShader';
import { WaterSurfaceShader } from './WaterSurfaceShader';

const GOLGE_HARITASI_VERTEX_SHADER = /* glsl */ `
  varying float vDunyaY;

  void main() {
    vec4 dunyaKonum = modelMatrix * vec4(position, 1.0);
    vDunyaY = dunyaKonum.y;
    gl_Position = projectionMatrix * viewMatrix * dunyaKonum;
  }
`;

const GOLGE_HARITASI_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGolgeKodlamaModu;
  varying float vDunyaY;

  void main() {
    // UnsignedByteType fallback için [-3.5, 3.5] aralığı [0, 1] aralığına kodlanır
    float yazilacakY = uGolgeKodlamaModu > 0.5
      ? clamp((vDunyaY + 3.5) / 7.0, 0.0, 1.0)
      : vDunyaY;
    gl_FragColor = vec4(yazilacakY, 1.0, 0.0, 1.0);
  }
`;

/**
 * 16m x 32m Olimpik Natatorium havuzu için su yüzeyi, kostik, su altı gölgesi ve
 * kırılma optik geçişlerini yöneten çok geçişli (multi-pass) WebGL2 optik işleyici.
 */
export class OptikIsleyici implements OptikIsleyiciArayuzu {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly suAltiGolgeFBO: THREE.WebGLRenderTarget;
  private readonly causticsFBO: THREE.WebGLRenderTarget;
  private readonly kirilmaFBO: THREE.WebGLRenderTarget;

  private readonly golgeKamerasi: THREE.OrthographicCamera;
  private readonly suAltiGolgeMateryali: THREE.ShaderMaterial;

  private readonly kostikSahnesi: THREE.Scene;
  private readonly kostikKamerasi: THREE.OrthographicCamera;
  private readonly kostikGeometrisi: THREE.PlaneGeometry;
  private readonly kostikMateryali: THREE.ShaderMaterial;

  private readonly suYuzeyiMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly ortakUniformlar: OrtakOptikUniformlari;
  private readonly olusturulanMateryaller = new Set<THREE.ShaderMaterial>();
  private readonly baslangicBosDoku: THREE.DataTexture;

  // Kare başına bellek ayırmayı önlemek için yeniden kullanılan geçici vektörler
  private readonly havuzGolgeOdakMerkezi = new THREE.Vector3(0, -0.9, 0);
  private readonly geciciIsigaDogru = new THREE.Vector3();
  private readonly geciciBoyut = new THREE.Vector2();
  private readonly oncekiTemizlemeRengi = new THREE.Color();

  constructor(renderer: THREE.WebGLRenderer, genislik: number, yukseklik: number) {
    this.renderer = renderer;

    const floatFboDestegi = this.floatFboDestegiKontrolEt(renderer);
    const fboVeriTipi = floatFboDestegi ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const pikselOrani = Math.min(renderer.getPixelRatio(), 2);
    const kirilmaGenislik = Math.max(1, Math.floor(genislik * pikselOrani));
    const kirilmaYukseklik = Math.max(1, Math.floor(yukseklik * pikselOrani));

    this.suAltiGolgeFBO = this.fboOlustur(
      HAVUZ_SABITLERI.GOLGE_COZUNURLUK,
      HAVUZ_SABITLERI.GOLGE_COZUNURLUK,
      fboVeriTipi,
      true,
    );
    this.causticsFBO = this.fboOlustur(
      HAVUZ_SABITLERI.KOSTIK_COZUNURLUK_X,
      HAVUZ_SABITLERI.KOSTIK_COZUNURLUK_Z,
      fboVeriTipi,
      false,
    );
    this.kirilmaFBO = this.fboOlustur(
      kirilmaGenislik,
      kirilmaYukseklik,
      fboVeriTipi,
      true,
    );

    this.baslangicBosDoku = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.baslangicBosDoku.needsUpdate = true;

    this.ortakUniformlar = {
      uYukseklikDokusu: { value: this.baslangicBosDoku },
      uKostikDokusu: { value: this.causticsFBO.texture },
      uSuAltiGolgeDokusu: { value: this.suAltiGolgeFBO.texture },
      uKirilmaDokusu: { value: this.kirilmaFBO.texture },
      uIsikYonu: { value: isikYonuHesapla(45, 62) },
      uIsikGolgeMatrisi: { value: new THREE.Matrix4() },
      uKirilmaIndisi: { value: 1.333 },
      uKostikSiddeti: { value: 1.0 },
      uKostikYariBoyut: {
        value: new THREE.Vector2(
          HAVUZ_SABITLERI.KOSTIK_PROJEKSIYON_YARI_BOYUT_X,
          HAVUZ_SABITLERI.KOSTIK_PROJEKSIYON_YARI_BOYUT_Z,
        ),
      },
      uAltKureMerkezleri: {
        value: Array.from(
          { length: HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE },
          () => new THREE.Vector3(),
        ),
      },
      uAltKureYaricaplari: {
        value: new Float32Array(HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE),
      },
      uAltKureSayisi: { value: 0 },
      uCisimMerkezi: { value: new THREE.Vector3() },
      uCisimYaricapi: { value: 0.5 },
      uEkranBoyutu: { value: new THREE.Vector2(kirilmaGenislik, kirilmaYukseklik) },
      uZaman: { value: 0 },
      uKirilmaPassiMi: { value: 0 },
      uGolgeKodlamaModu: { value: floatFboDestegi ? 0.0 : 1.0 },
    };

    // Pass 1: 16m x 32m Olimpik havuz ve 10m tramplen yüksekliğini kapsayan ışık uzayı ortografik gölge kamerası
    const yariBoyut = HAVUZ_SABITLERI.GOLGE_KAMERA_YARI_BOYUT;
    this.golgeKamerasi = new THREE.OrthographicCamera(
      -yariBoyut,
      yariBoyut,
      yariBoyut,
      -yariBoyut,
      0.1,
      62.0,
    );
    this.suAltiGolgeMateryali = new THREE.ShaderMaterial({
      name: 'SuAltiGolgeMateryali',
      uniforms: {
        uGolgeKodlamaModu: this.ortakUniformlar.uGolgeKodlamaModu,
      },
      vertexShader: GOLGE_HARITASI_VERTEX_SHADER,
      fragmentShader: GOLGE_HARITASI_FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      blending: THREE.NoBlending,
    });

    // Pass 2: Kostik haritası sahnesi ve dikdörtgen ızgara materyali
    this.kostikSahnesi = new THREE.Scene();
    this.kostikKamerasi = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.kostikGeometrisi = CausticsShader.izgaraOlustur();
    this.kostikMateryali = CausticsShader.materyalOlustur(this.ortakUniformlar);
    const kostikMesh = new THREE.Mesh(this.kostikGeometrisi, this.kostikMateryali);
    kostikMesh.name = 'KostikProjeksiyonIzgarasi';
    kostikMesh.frustumCulled = false;
    this.kostikSahnesi.add(kostikMesh);

    // Su yüzeyi mesh'i (Pass 3'te gizlenir, ana render'da kırılma/yansıma uygular)
    this.suYuzeyiMesh = WaterSurfaceShader.suYuzeyiOlustur(this.ortakUniformlar);
  }

  /**
   * Her karede 3 optik GPU geçişini yürütür:
   * 1. Su altı gölge haritası (suAltiGolgeFBO)
   * 2. Kırılan ışık kostik haritası (causticsFBO)
   * 3. Su altı sahne kırılma tamponu (kirilmaFBO)
   */
  public guncelleVeIsle(girdi: OptikGuncellemeGirdisi): number {
    const {
      renderer,
      sahne,
      kamera,
      aktifCisimNesnesi,
      yukseklikDokusu,
      cisimSinirVerisi,
      parametreler,
      gecenSureSaniye,
    } = girdi;

    const isikYonu = isikYonuHesapla(
      parametreler.isikAzimutAcisi,
      parametreler.isikYukseklikAcisi,
    );

    this.ortakUniformlar.uYukseklikDokusu.value = yukseklikDokusu;
    this.ortakUniformlar.uIsikYonu.value.copy(isikYonu);
    this.ortakUniformlar.uKirilmaIndisi.value = parametreler.kirilmaIndisi;
    this.ortakUniformlar.uKostikSiddeti.value = parametreler.kostikSiddeti;
    this.ortakUniformlar.uZaman.value = gecenSureSaniye;
    this.altKureleriGuncelle(cisimSinirVerisi);

    // Drawing buffer boyutu ile kırılma FBO ve uEkranBoyutu değerlerini senkronize tut
    renderer.getDrawingBufferSize(this.geciciBoyut);
    if (this.geciciBoyut.x > 0 && this.geciciBoyut.y > 0) {
      this.ortakUniformlar.uEkranBoyutu.value.copy(this.geciciBoyut);
      if (
        this.kirilmaFBO.width !== this.geciciBoyut.x ||
        this.kirilmaFBO.height !== this.geciciBoyut.y
      ) {
        this.kirilmaFBO.setSize(this.geciciBoyut.x, this.geciciBoyut.y);
      }
    }

    const oncekiRenderTarget = renderer.getRenderTarget();
    renderer.getClearColor(this.oncekiTemizlemeRengi);
    const oncekiTemizlemeAlfa = renderer.getClearAlpha();
    const oncekiAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    try {
      // --- PASS 1: Su Altı Gölge Haritası ---
      this.golgeGecisiniIsle(renderer, sahne, aktifCisimNesnesi, isikYonu);

      // --- PASS 2: Kostik Haritası ---
      renderer.setRenderTarget(this.causticsFBO);
      renderer.setClearColor(0x000000, 0.0);
      renderer.clear(true, false, false);
      renderer.render(this.kostikSahnesi, this.kostikKamerasi);

      // --- PASS 3: Kırılma Haritası ---
      this.kirilmaGecisiniIsle(renderer, sahne, kamera, oncekiTemizlemeAlfa);
    } finally {
      renderer.setRenderTarget(oncekiRenderTarget);
      renderer.setClearColor(this.oncekiTemizlemeRengi, oncekiTemizlemeAlfa);
      renderer.autoClear = oncekiAutoClear;
    }

    return 3;
  }

  public kostikDokusuGetir(): CausticsTexture {
    return this.causticsFBO.texture;
  }

  public suAltiGolgeDokusuGetir(): THREE.Texture {
    return this.suAltiGolgeFBO.texture;
  }

  public suYuzeyiMeshGetir(): THREE.Mesh {
    return this.suYuzeyiMesh;
  }

  public havuzMateryaliOlustur(karoDokusu: THREE.Texture): THREE.ShaderMaterial {
    const materyal = PoolShader.materyalOlustur(karoDokusu, this.ortakUniformlar);
    this.olusturulanMateryaller.add(materyal);
    return materyal;
  }

  public cisimlereSuAltiOptigiBagla(kokNesne: THREE.Object3D): void {
    UnderwaterObjectShader.cisimlereBagla(
      kokNesne,
      this.ortakUniformlar,
      this.olusturulanMateryaller,
    );
  }

  public yenidenBoyutlandir(genislik: number, yukseklik: number): void {
    const pikselOrani = Math.min(this.renderer.getPixelRatio(), 2);
    const hedefGenislik = Math.max(1, Math.floor(genislik * pikselOrani));
    const hedefYukseklik = Math.max(1, Math.floor(yukseklik * pikselOrani));

    this.kirilmaFBO.setSize(hedefGenislik, hedefYukseklik);
    this.ortakUniformlar.uEkranBoyutu.value.set(hedefGenislik, hedefYukseklik);
  }

  public temizle(): void {
    this.suAltiGolgeFBO.dispose();
    this.causticsFBO.dispose();
    this.kirilmaFBO.dispose();

    this.suAltiGolgeMateryali.dispose();
    this.kostikMateryali.dispose();
    this.kostikGeometrisi.dispose();

    this.suYuzeyiMesh.geometry.dispose();
    this.suYuzeyiMesh.material.dispose();
    this.baslangicBosDoku.dispose();

    for (const materyal of this.olusturulanMateryaller) {
      materyal.dispose();
    }
    this.olusturulanMateryaller.clear();
  }

  private golgeGecisiniIsle(
    renderer: THREE.WebGLRenderer,
    sahne: THREE.Scene,
    aktifCisimNesnesi: THREE.Object3D,
    isikYonu: THREE.Vector3,
  ): void {
    // Gölge kamerasını ışığa karşıt noktadan 26.0 m mesafede havuz merkezine yönlendir
    this.geciciIsigaDogru.copy(isikYonu).negate().normalize();
    this.golgeKamerasi.position
      .copy(this.havuzGolgeOdakMerkezi)
      .addScaledVector(this.geciciIsigaDogru, 26.0);

    // Tepe güneş açılarında lookAt gimbal kilidini önle
    if (Math.abs(this.geciciIsigaDogru.y) > 0.99) {
      this.golgeKamerasi.up.set(0, 0, -1);
    } else {
      this.golgeKamerasi.up.set(0, 1, 0);
    }

    this.golgeKamerasi.lookAt(this.havuzGolgeOdakMerkezi);
    this.golgeKamerasi.updateMatrixWorld(true);
    this.golgeKamerasi.updateProjectionMatrix();

    this.ortakUniformlar.uIsikGolgeMatrisi.value.multiplyMatrices(
      this.golgeKamerasi.projectionMatrix,
      this.golgeKamerasi.matrixWorldInverse,
    );

    const oncekiOverride = sahne.overrideMaterial;
    const oncekiArkaPlan = sahne.background;
    const oncekiSis = sahne.fog;
    const gizlenenNesneler = this.sadeceCismiGorunurBirak(sahne, aktifCisimNesnesi);

    try {
      sahne.overrideMaterial = this.suAltiGolgeMateryali;
      sahne.background = null;
      sahne.fog = null;

      renderer.setRenderTarget(this.suAltiGolgeFBO);
      renderer.setClearColor(0x000000, 0.0);
      renderer.clear(true, true, false);

      if (aktifCisimNesnesi && aktifCisimNesnesi.visible) {
        aktifCisimNesnesi.updateMatrixWorld(true);
        renderer.render(sahne, this.golgeKamerasi);
      }
    } finally {
      for (const kayit of gizlenenNesneler) {
        kayit.nesne.visible = kayit.gorunurluk;
      }
      sahne.overrideMaterial = oncekiOverride;
      sahne.background = oncekiArkaPlan;
      sahne.fog = oncekiSis;
    }
  }

  private kirilmaGecisiniIsle(
    renderer: THREE.WebGLRenderer,
    sahne: THREE.Scene,
    kamera: THREE.PerspectiveCamera,
    oncekiTemizlemeAlfa: number,
  ): void {
    const oncekiSuGorunurlugu = this.suYuzeyiMesh.visible;
    this.suYuzeyiMesh.visible = false;
    this.ortakUniformlar.uKirilmaPassiMi.value = 1.0;

    try {
      renderer.setRenderTarget(this.kirilmaFBO);
      renderer.setClearColor(this.oncekiTemizlemeRengi, oncekiTemizlemeAlfa);
      renderer.clear(true, true, true);
      renderer.render(sahne, kamera);
    } finally {
      this.ortakUniformlar.uKirilmaPassiMi.value = 0.0;
      this.suYuzeyiMesh.visible = oncekiSuGorunurlugu;
    }
  }

  private sadeceCismiGorunurBirak(
    sahne: THREE.Scene,
    aktifCisimNesnesi: THREE.Object3D,
  ): Array<{ nesne: THREE.Object3D; gorunurluk: boolean }> {
    const korunanNesneler = new Set<THREE.Object3D>();
    const atalar = new Set<THREE.Object3D>();

    // Aktif cismin kendisini ve 7 yüzücü dahil tüm alt gruplarını/torun meshlerini koru
    if (aktifCisimNesnesi) {
      aktifCisimNesnesi.traverse((altDugum) => {
        korunanNesneler.add(altDugum);
      });
    }

    let gezgin: THREE.Object3D | null = aktifCisimNesnesi;
    while (gezgin) {
      atalar.add(gezgin);
      gezgin = gezgin.parent;
    }

    const gizlenenler: Array<{ nesne: THREE.Object3D; gorunurluk: boolean }> = [];
    const yigin: THREE.Object3D[] = [...sahne.children];

    while (yigin.length > 0) {
      const dugum = yigin.pop();
      if (!dugum) {
        continue;
      }

      if (korunanNesneler.has(dugum)) {
        continue;
      }

      if (atalar.has(dugum)) {
        for (const cocuk of dugum.children) {
          yigin.push(cocuk);
        }
        continue;
      }

      if (!(dugum instanceof THREE.Light) && dugum.visible) {
        gizlenenler.push({ nesne: dugum, gorunurluk: true });
        dugum.visible = false;
      }
    }

    return gizlenenler;
  }

  private altKureleriGuncelle(cisimSinirVerisi: ObjectBoundingData): void {
    const maksSayi = HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE;
    const aktifSayi = Math.min(
      cisimSinirVerisi.aktifAltKureSayisi,
      cisimSinirVerisi.altKureler.length,
      maksSayi,
    );

    this.ortakUniformlar.uAltKureSayisi.value = aktifSayi;
    const merkezDizisi = this.ortakUniformlar.uAltKureMerkezleri.value;
    const yaricapDizisi = this.ortakUniformlar.uAltKureYaricaplari.value;

    for (let i = 0; i < maksSayi; i++) {
      if (i < aktifSayi) {
        const kure = cisimSinirVerisi.altKureler[i];
        merkezDizisi[i].copy(kure.merkez);
        yaricapDizisi[i] = kure.yaricap;
      } else {
        merkezDizisi[i].set(0, 0, 0);
        yaricapDizisi[i] = 0;
      }
    }

    this.ortakUniformlar.uCisimMerkezi.value.copy(cisimSinirVerisi.merkez);
    this.ortakUniformlar.uCisimYaricapi.value = cisimSinirVerisi.sinirlayiciYaricap;
  }

  private floatFboDestegiKontrolEt(renderer: THREE.WebGLRenderer): boolean {
    if (!renderer.capabilities.isWebGL2) {
      return false;
    }

    const gl = renderer.getContext();
    const colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    const colorBufferHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
    return Boolean(colorBufferFloat || colorBufferHalfFloat);
  }

  private fboOlustur(
    genislik: number,
    yukseklik: number,
    tip: THREE.TextureDataType,
    derinlikTamponu: boolean,
  ): THREE.WebGLRenderTarget {
    const fbo = new THREE.WebGLRenderTarget(genislik, yukseklik, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: tip,
      depthBuffer: derinlikTamponu,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    });
    fbo.texture.wrapS = THREE.ClampToEdgeWrapping;
    fbo.texture.wrapT = THREE.ClampToEdgeWrapping;
    return fbo;
  }
}
