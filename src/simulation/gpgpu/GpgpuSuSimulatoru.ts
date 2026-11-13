import * as THREE from 'three';
import {
  HAVUZ_SABITLERI,
  dunyaXZdenUVye,
  type GpgpuSimulatorArayuzu,
  type HeightfieldTexture,
  type SuDarbesiVerisi,
} from '../../types/simulation';
import { DropShader } from './DropShader';
import { NormalShader } from './NormalShader';
import { UpdateShader } from './UpdateShader';

const CPU_IZGARA_X = 64;
const CPU_IZGARA_Z = 128;
const DALGA_KUVVET_KATSAYISI = 1.95;
const MIKRO_GERI_CAGIRICI_KATSAYI = 0.9995;
const MAKSIMUM_YUKSEKLIK = 0.42;
const MAKSIMUM_HIZ = 0.25;
const MAKSIMUM_KUYRUK_DARBESI = HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI * 2;

interface DokuFormatSecimi {
  tip: THREE.TextureDataType;
  filtre: typeof THREE.LinearFilter | typeof THREE.NearestFilter;
}

export interface CpuSuVerisi {
  yukseklik: number;
  normal: THREE.Vector3;
}

/**
 * 256x512 kare texel (dx = dz = 0.03125m) ping-pong WebGLRenderTarget çifti üzerinde
 * çalışan GPU sığ su dalga simülatörü ve fizik motoru için senkron 64x128 CPU dalga aynası.
 */
export class GpgpuSuSimulatoru implements GpgpuSimulatorArayuzu {
  private readonly cozunurlukX: number;
  private readonly cozunurlukZ: number;
  private readonly texelBoyutu: THREE.Vector2;
  private readonly dunyaTexelBoyutu: THREE.Vector2;
  private readonly uvOlcek: THREE.Vector2;
  private readonly cpuDunyaTexelX: number;
  private readonly cpuDunyaTexelZ: number;

  private readonly hedefA: THREE.WebGLRenderTarget;
  private readonly hedefB: THREE.WebGLRenderTarget;
  private okuHedefi: THREE.WebGLRenderTarget;
  private yazHedefi: THREE.WebGLRenderTarget;

  private readonly gecisSahnesi: THREE.Scene;
  private readonly ortografikKamera: THREE.OrthographicCamera;
  private readonly dortgenGeometrisi: THREE.PlaneGeometry;
  private readonly dortgenMesh: THREE.Mesh;

  private readonly dropShader: DropShader;
  private readonly updateShader: UpdateShader;
  private readonly normalShader: NormalShader;

  private readonly bekleyenDarbeler: SuDarbesiVerisi[] = [];
  private readonly geciciTemizlemeRengi = new THREE.Color(0x000000);

  private cpuYukseklik: Float32Array;
  private cpuSonrakiYukseklik: Float32Array;
  private readonly cpuHiz: Float32Array;
  private readonly cpuDalgaKatsayisi: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.cozunurlukX = HAVUZ_SABITLERI.GPGPU_COZUNURLUK_X;
    this.cozunurlukZ = HAVUZ_SABITLERI.GPGPU_COZUNURLUK_Z;
    this.texelBoyutu = new THREE.Vector2(1 / this.cozunurlukX, 1 / this.cozunurlukZ);
    this.dunyaTexelBoyutu = new THREE.Vector2(
      HAVUZ_SABITLERI.GENISLIK_X / this.cozunurlukX,
      HAVUZ_SABITLERI.UZUNLUK_Z / this.cozunurlukZ,
    );
    this.uvOlcek = new THREE.Vector2(
      HAVUZ_SABITLERI.GENISLIK_X / 4.0,
      HAVUZ_SABITLERI.UZUNLUK_Z / 4.0,
    );
    this.cpuDunyaTexelX = HAVUZ_SABITLERI.GENISLIK_X / CPU_IZGARA_X;
    this.cpuDunyaTexelZ = HAVUZ_SABITLERI.UZUNLUK_Z / CPU_IZGARA_Z;

    const formatSecimi = this.dokuFormatiniBelirle(renderer);
    this.hedefA = this.fboHedefiOlustur(formatSecimi);
    this.hedefB = this.fboHedefiOlustur(formatSecimi);
    this.okuHedefi = this.hedefA;
    this.yazHedefi = this.hedefB;

    this.gecisSahnesi = new THREE.Scene();
    this.ortografikKamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.dortgenGeometrisi = new THREE.PlaneGeometry(2, 2);

    this.dropShader = new DropShader(this.uvOlcek);
    this.updateShader = new UpdateShader(this.texelBoyutu);
    this.normalShader = new NormalShader(this.texelBoyutu, this.dunyaTexelBoyutu);

    this.dortgenMesh = new THREE.Mesh(
      this.dortgenGeometrisi,
      this.updateShader.materyalGetir(),
    );
    this.dortgenMesh.frustumCulled = false;
    this.gecisSahnesi.add(this.dortgenMesh);

    const toplamHucre = CPU_IZGARA_X * CPU_IZGARA_Z;
    this.cpuYukseklik = new Float32Array(toplamHucre);
    this.cpuSonrakiYukseklik = new Float32Array(toplamHucre);
    this.cpuHiz = new Float32Array(toplamHucre);

    // 64x128 kare hücreli CPU ızgarasında dx = dz değeri 256x512 GPU ızgarasının 4 katıdır;
    // aynı fiziksel dalga hızını korumak için katsayı çözünürlük oranının karesiyle ölçeklenir.
    const cozunurlukOraniX = CPU_IZGARA_X / this.cozunurlukX;
    const cozunurlukOraniZ = CPU_IZGARA_Z / this.cozunurlukZ;
    const ortalamaOran = (cozunurlukOraniX + cozunurlukOraniZ) * 0.5;
    this.cpuDalgaKatsayisi = DALGA_KUVVET_KATSAYISI * ortalamaOran * ortalamaOran;

    this.sifirla(renderer);
  }

  /**
   * Bekleyen darbe kuyruğuna tekil bir su yüzeyi deplasman darbesi ekler.
   */
  public darbeEkle(uvX: number, uvZ: number, yaricap: number, kuvvet: number): void {
    if (!this.darbeGecerliMi(uvX, uvZ, yaricap, kuvvet)) {
      return;
    }

    const darbe: SuDarbesiVerisi = { uvX, uvZ, yaricap, kuvvet };
    if (this.bekleyenDarbeler.length < MAKSIMUM_KUYRUK_DARBESI) {
      this.bekleyenDarbeler.push(darbe);
      return;
    }

    // Kuyruk üst sınırı dolduğunda yalnızca daha güçlü yeni darbe en zayıfın yerini alır.
    let enZayifIndeks = 0;
    let enZayifKuvvet = Math.abs(this.bekleyenDarbeler[0].kuvvet);
    for (let indeks = 1; indeks < this.bekleyenDarbeler.length; indeks++) {
      const adayKuvvet = Math.abs(this.bekleyenDarbeler[indeks].kuvvet);
      if (adayKuvvet < enZayifKuvvet) {
        enZayifKuvvet = adayKuvvet;
        enZayifIndeks = indeks;
      }
    }

    if (Math.abs(kuvvet) >= enZayifKuvvet) {
      this.bekleyenDarbeler[enZayifIndeks] = darbe;
    }
  }

  /**
   * Cisim kesiti veya çoklu etkileşim kaynaklı darbeleri kuyruğa toplu ekler.
   */
  public cokluDarbeEkle(darbeler: readonly SuDarbesiVerisi[]): void {
    for (const darbe of darbeler) {
      this.darbeEkle(darbe.uvX, darbe.uvZ, darbe.yaricap, darbe.kuvvet);
    }
  }

  /**
   * Bekleyen darbeleri ve bir GPGPU dalga + normal adımını çalıştırır;
   * gerçekleştirilen GPU render pass sayısını döndürür.
   */
  public adimla(
    renderer: THREE.WebGLRenderer,
    sonumleme: number,
    suDurdurulduMu: boolean,
  ): number {
    const bekleyenVarMi = this.bekleyenDarbeler.length > 0;
    if (suDurdurulduMu && !bekleyenVarMi) {
      return 0;
    }

    const eskiHedef = renderer.getRenderTarget();
    const eskiOtoTemizleme = renderer.autoClear;
    renderer.autoClear = false;

    let yapilanPassSayisi = 0;

    try {
      if (bekleyenVarMi) {
        yapilanPassSayisi += this.darbeAltGruplariniUygula(renderer);
      }

      if (!suDurdurulduMu) {
        const guvenliSonumleme = THREE.MathUtils.clamp(
          Number.isFinite(sonumleme) ? sonumleme : 0.985,
          0,
          1,
        );

        this.updateShader.uniformlariGuncelle(this.okuHedefi.texture, guvenliSonumleme);
        this.passCalistir(renderer, this.updateShader.materyalGetir());
        yapilanPassSayisi += 1;

        this.normalShader.uniformlariGuncelle(this.okuHedefi.texture);
        this.passCalistir(renderer, this.normalShader.materyalGetir());
        yapilanPassSayisi += 1;

        this.cpuDalgaAdimla(guvenliSonumleme);
      }
    } finally {
      renderer.setRenderTarget(eskiHedef);
      renderer.autoClear = eskiOtoTemizleme;
    }

    return yapilanPassSayisi;
  }

  /**
   * Hem GPU ping-pong hedeflerini hem senkron CPU dalga aynasını durgun su haline sıfırlar.
   */
  public sifirla(renderer: THREE.WebGLRenderer): void {
    this.bekleyenDarbeler.length = 0;
    this.cpuYukseklik.fill(0);
    this.cpuSonrakiYukseklik.fill(0);
    this.cpuHiz.fill(0);

    const eskiHedef = renderer.getRenderTarget();
    const eskiOtoTemizleme = renderer.autoClear;
    renderer.getClearColor(this.geciciTemizlemeRengi);
    const eskiTemizlemeAlfa = renderer.getClearAlpha();

    try {
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);

      // R=0, G=0, B=0 (nx=0), A=0 (nz=0) durumu durgun yüzeyi (n.y = 1.0) temsil eder.
      renderer.setRenderTarget(this.okuHedefi);
      renderer.clear(true, false, false);

      renderer.setRenderTarget(this.yazHedefi);
      renderer.clear(true, false, false);
    } finally {
      renderer.setClearColor(this.geciciTemizlemeRengi, eskiTemizlemeAlfa);
      renderer.setRenderTarget(eskiHedef);
      renderer.autoClear = eskiOtoTemizleme;
    }
  }

  /**
   * En güncel dalga yüksekliği ve normal verisini taşıyan aktif FBO dokusunu döndürür.
   */
  public yukseklikDokusuGetir(): HeightfieldTexture {
    return this.okuHedefi.texture;
  }

  /**
   * 64x128 senkron CPU dalga aynasından verilen UV koordinatında bilinear interpolasyonla
   * dalga yüksekliğini okur.
   */
  public cpuYukseklikOku(u: number, v: number): number {
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return 0;
    }

    const maksX = CPU_IZGARA_X - 1;
    const maksZ = CPU_IZGARA_Z - 1;
    const kesirliX = THREE.MathUtils.clamp(u * CPU_IZGARA_X - 0.5, 0, maksX);
    const kesirliZ = THREE.MathUtils.clamp(v * CPU_IZGARA_Z - 0.5, 0, maksZ);

    const x0 = Math.floor(kesirliX);
    const z0 = Math.floor(kesirliZ);
    const x1 = Math.min(x0 + 1, maksX);
    const z1 = Math.min(z0 + 1, maksZ);

    const oranX = kesirliX - x0;
    const oranZ = kesirliZ - z0;

    const satir0 = z0 * CPU_IZGARA_X;
    const satir1 = z1 * CPU_IZGARA_X;

    const h00 = this.cpuYukseklik[satir0 + x0];
    const h10 = this.cpuYukseklik[satir0 + x1];
    const h01 = this.cpuYukseklik[satir1 + x0];
    const h11 = this.cpuYukseklik[satir1 + x1];

    const altKenar = h00 + (h10 - h00) * oranX;
    const ustKenar = h01 + (h11 - h01) * oranX;

    return altKenar + (ustKenar - altKenar) * oranZ;
  }

  /**
   * 64x128 senkron CPU dalga aynasından verilen UV koordinatında dünya ölçeğine göre
   * merkezi sonlu farklarla su yüzeyi normalini hesaplar.
   */
  public cpuNormalOku(
    u: number,
    v: number,
    hedefNormal: THREE.Vector3 = new THREE.Vector3(),
  ): THREE.Vector3 {
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return hedefNormal.set(0, 1, 0);
    }

    const adimU = 1 / CPU_IZGARA_X;
    const adimV = 1 / CPU_IZGARA_Z;

    const hSol = this.cpuYukseklikOku(u - adimU, v);
    const hSag = this.cpuYukseklikOku(u + adimU, v);
    const hAlt = this.cpuYukseklikOku(u, v - adimV);
    const hUst = this.cpuYukseklikOku(u, v + adimV);

    const dhx = (hSag - hSol) / (2 * this.cpuDunyaTexelX);
    const dhz = (hUst - hAlt) / (2 * this.cpuDunyaTexelZ);

    return hedefNormal.set(-dhx, 1, -dhz).normalize();
  }

  /**
   * Verilen dünya (x, z) noktasındaki yerel dalga yüksekliği ve yüzey normalini döndürür.
   */
  public dunyaKonumundaSuVerisiAl(
    dunyaX: number,
    dunyaZ: number,
    hedefNormal: THREE.Vector3 = new THREE.Vector3(),
  ): CpuSuVerisi {
    if (!Number.isFinite(dunyaX) || !Number.isFinite(dunyaZ)) {
      return {
        yukseklik: 0,
        normal: hedefNormal.set(0, 1, 0),
      };
    }

    const { u, v } = dunyaXZdenUVye(dunyaX, dunyaZ);
    return {
      yukseklik: this.cpuYukseklikOku(u, v),
      normal: this.cpuNormalOku(u, v, hedefNormal),
    };
  }

  /**
   * GPU'dan okuma yapmadan 64x128 senkron CPU dalga aynasından bilinear interpolasyonla
   * verilen dünya (x, z) noktasındaki yerel dalga yüksekliğini döndürür.
   */
  public suYuksekligiSorgula(dunyaX: number, dunyaZ: number): number {
    if (!Number.isFinite(dunyaX) || !Number.isFinite(dunyaZ)) {
      return 0;
    }

    const { u, v } = dunyaXZdenUVye(dunyaX, dunyaZ);
    return this.cpuYukseklikOku(u, v);
  }

  /**
   * Tüm FBO hedeflerini, shader materyallerini ve tam ekran geometrisini serbest bırakır.
   */
  public temizle(): void {
    this.bekleyenDarbeler.length = 0;
    this.hedefA.dispose();
    this.hedefB.dispose();
    this.dropShader.temizle();
    this.updateShader.temizle();
    this.normalShader.temizle();
    this.dortgenGeometrisi.dispose();
  }

  private dokuFormatiniBelirle(renderer: THREE.WebGLRenderer): DokuFormatSecimi {
    const webgl2AktifMi = renderer.capabilities.isWebGL2;
    const colorBufferFloatVarMi = renderer.extensions.has('EXT_color_buffer_float');
    const colorBufferHalfFloatVarMi = renderer.extensions.has('EXT_color_buffer_half_float');
    const floatLineerVarMi = renderer.extensions.has('OES_texture_float_linear');
    const halfFloatLineerVarMi = renderer.extensions.has('OES_texture_half_float_linear');

    // WebGL2 ortamında HalfFloatType renk tamponu desteğiyle yerel LinearFilter sunar.
    if (webgl2AktifMi && (colorBufferFloatVarMi || colorBufferHalfFloatVarMi)) {
      return {
        tip: THREE.HalfFloatType,
        filtre: THREE.LinearFilter,
      };
    }

    if (
      !webgl2AktifMi &&
      renderer.extensions.has('OES_texture_half_float') &&
      colorBufferHalfFloatVarMi
    ) {
      return {
        tip: THREE.HalfFloatType,
        filtre: halfFloatLineerVarMi ? THREE.LinearFilter : THREE.NearestFilter,
      };
    }

    const floatFboDestekliMi = webgl2AktifMi
      ? colorBufferFloatVarMi
      : renderer.extensions.has('OES_texture_float') &&
        (colorBufferFloatVarMi || renderer.extensions.has('WEBGL_color_buffer_float'));

    if (floatFboDestekliMi) {
      return {
        tip: THREE.FloatType,
        filtre: floatLineerVarMi ? THREE.LinearFilter : THREE.NearestFilter,
      };
    }

    return {
      tip: THREE.UnsignedByteType,
      filtre: THREE.LinearFilter,
    };
  }

  private fboHedefiOlustur(formatSecimi: DokuFormatSecimi): THREE.WebGLRenderTarget {
    const hedef = new THREE.WebGLRenderTarget(this.cozunurlukX, this.cozunurlukZ, {
      minFilter: formatSecimi.filtre,
      magFilter: formatSecimi.filtre,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      type: formatSecimi.tip,
      depthBuffer: false,
      stencilBuffer: false,
    });

    hedef.texture.generateMipmaps = false;
    return hedef;
  }

  private takasEt(): void {
    const gecici = this.okuHedefi;
    this.okuHedefi = this.yazHedefi;
    this.yazHedefi = gecici;
  }

  private passCalistir(
    renderer: THREE.WebGLRenderer,
    materyal: THREE.ShaderMaterial,
  ): void {
    this.dortgenMesh.material = materyal;
    renderer.setRenderTarget(this.yazHedefi);
    renderer.render(this.gecisSahnesi, this.ortografikKamera);
    this.takasEt();
  }

  private darbeGecerliMi(
    uvX: number,
    uvZ: number,
    yaricap: number,
    kuvvet: number,
  ): boolean {
    if (
      !Number.isFinite(uvX) ||
      !Number.isFinite(uvZ) ||
      !Number.isFinite(yaricap) ||
      !Number.isFinite(kuvvet)
    ) {
      return false;
    }

    if (yaricap <= 0 || Math.abs(kuvvet) <= 1e-6) {
      return false;
    }

    const uvYaricapX = yaricap / this.uvOlcek.x;
    const uvYaricapZ = yaricap / this.uvOlcek.y;

    // Havuz UV [0, 1] sınırlarının tamamen dışında kalan darbeler elenir.
    if (
      uvX < -uvYaricapX ||
      uvX > 1 + uvYaricapX ||
      uvZ < -uvYaricapZ ||
      uvZ > 1 + uvYaricapZ
    ) {
      return false;
    }

    return true;
  }

  private darbeAltGruplariniUygula(renderer: THREE.WebGLRenderer): number {
    const toplamDarbe = this.bekleyenDarbeler.length;
    const maksGrupBoyutu = HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI;
    let passSayisi = 0;

    for (
      let baslangicIndeksi = 0;
      baslangicIndeksi < toplamDarbe;
      baslangicIndeksi += maksGrupBoyutu
    ) {
      const grupBoyutu = Math.min(maksGrupBoyutu, toplamDarbe - baslangicIndeksi);

      this.dropShader.uniformlariGuncelle(
        this.okuHedefi.texture,
        this.bekleyenDarbeler,
        baslangicIndeksi,
        grupBoyutu,
      );
      this.passCalistir(renderer, this.dropShader.materyalGetir());
      passSayisi += 1;

      for (let ofset = 0; ofset < grupBoyutu; ofset++) {
        this.cpuDarbeUygula(this.bekleyenDarbeler[baslangicIndeksi + ofset]);
      }
    }

    this.bekleyenDarbeler.length = 0;
    return passSayisi;
  }

  private cpuDarbeUygula(darbe: SuDarbesiVerisi): void {
    const guvenliYaricap = Math.max(darbe.yaricap, 0.001);
    const uvYaricapX = guvenliYaricap / this.uvOlcek.x;
    const uvYaricapZ = guvenliYaricap / this.uvOlcek.y;

    const hucreYaricapX = uvYaricapX * CPU_IZGARA_X;
    const hucreYaricapZ = uvYaricapZ * CPU_IZGARA_Z;

    const merkezX = darbe.uvX * CPU_IZGARA_X - 0.5;
    const merkezZ = darbe.uvZ * CPU_IZGARA_Z - 0.5;

    const minX = Math.max(0, Math.floor(merkezX - hucreYaricapX));
    const makX = Math.min(CPU_IZGARA_X - 1, Math.ceil(merkezX + hucreYaricapX));
    const minZ = Math.max(0, Math.floor(merkezZ - hucreYaricapZ));
    const makZ = Math.min(CPU_IZGARA_Z - 1, Math.ceil(merkezZ + hucreYaricapZ));

    for (let iz = minZ; iz <= makZ; iz++) {
      const v = (iz + 0.5) / CPU_IZGARA_Z;
      const farkZ = (v - darbe.uvZ) * this.uvOlcek.y;
      const satirBaslangici = iz * CPU_IZGARA_X;

      for (let ix = minX; ix <= makX; ix++) {
        const u = (ix + 0.5) / CPU_IZGARA_X;
        const farkX = (u - darbe.uvX) * this.uvOlcek.x;
        const mesafe = Math.hypot(farkX, farkZ);

        if (mesafe >= guvenliYaricap) {
          continue;
        }

        let etki = Math.max(0, 1 - mesafe / guvenliYaricap);
        etki = 0.5 - Math.cos(etki * Math.PI) * 0.5;

        const hucreIndeksi = satirBaslangici + ix;
        const yeniYukseklik = this.cpuYukseklik[hucreIndeksi] + etki * darbe.kuvvet;
        this.cpuYukseklik[hucreIndeksi] = THREE.MathUtils.clamp(
          yeniYukseklik,
          -MAKSIMUM_YUKSEKLIK,
          MAKSIMUM_YUKSEKLIK,
        );
      }
    }
  }

  private cpuDalgaAdimla(sonumleme: number): void {
    const maksX = CPU_IZGARA_X - 1;
    const maksZ = CPU_IZGARA_Z - 1;

    for (let iz = 0; iz < CPU_IZGARA_Z; iz++) {
      const satirBaslangici = iz * CPU_IZGARA_X;
      const altSatir = Math.max(0, iz - 1) * CPU_IZGARA_X;
      const ustSatir = Math.min(maksZ, iz + 1) * CPU_IZGARA_X;

      for (let ix = 0; ix < CPU_IZGARA_X; ix++) {
        const indeks = satirBaslangici + ix;
        const mevcutYukseklik = this.cpuYukseklik[indeks];

        const sol = this.cpuYukseklik[satirBaslangici + Math.max(0, ix - 1)];
        const sag = this.cpuYukseklik[satirBaslangici + Math.min(maksX, ix + 1)];
        const alt = this.cpuYukseklik[altSatir + ix];
        const ust = this.cpuYukseklik[ustSatir + ix];

        const ortalama = (sol + sag + alt + ust) * 0.25;
        let hiz = this.cpuHiz[indeks] + (ortalama - mevcutYukseklik) * this.cpuDalgaKatsayisi;
        hiz *= sonumleme;
        hiz = THREE.MathUtils.clamp(hiz, -MAKSIMUM_HIZ, MAKSIMUM_HIZ);

        let sonrakiYukseklik = (mevcutYukseklik + hiz) * MIKRO_GERI_CAGIRICI_KATSAYI;
        sonrakiYukseklik = THREE.MathUtils.clamp(
          sonrakiYukseklik,
          -MAKSIMUM_YUKSEKLIK,
          MAKSIMUM_YUKSEKLIK,
        );

        this.cpuHiz[indeks] = hiz;
        this.cpuSonrakiYukseklik[indeks] = sonrakiYukseklik;
      }
    }

    const gecici = this.cpuYukseklik;
    this.cpuYukseklik = this.cpuSonrakiYukseklik;
    this.cpuSonrakiYukseklik = gecici;
  }
}
