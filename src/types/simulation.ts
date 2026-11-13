import * as THREE from 'three';

/**
 * Tüm simülasyon modülleri tarafından paylaşılan Galatasaray Olimpik Yüzme Kompleksi ve fizik sabitleri.
 * Dünya koordinat sistemi: X [-4.0, +4.0], Z [-8.0, +8.0], taban Y = -2.60, durgun su Y = 0.0.
 */
export const HAVUZ_SABITLERI = {
  GENISLIK_X: 8.0,
  UZUNLUK_Z: 16.0,
  MIN_X: -4.0,
  MAK_X: 4.0,
  MIN_Z: -8.0,
  MAK_Z: 8.0,
  SU_SEVIYESI_Y: 0.0,
  TABAN_Y: -2.60,
  DUVAR_UST_Y: 0.18,
  KULVAR_SAYISI: 6,
  TRAMPLEN_YUKSEKLIK_Y: 10.0,
  TRAMPLEN_UC_Z: 7.25,
  TRAMPLEN_KULVAR_INDEKSI: 3,
  CIKIS_BLOK_Z: -8.35,
  CIKIS_BLOK_UST_Y: 0.58,
  KOSTIK_PROJEKSIYON_YARI_BOYUT: 4.8,
  KOSTIK_PROJEKSIYON_YARI_BOYUT_X: 4.8,
  KOSTIK_PROJEKSIYON_YARI_BOYUT_Z: 8.8,
  SU_YOGUNLUGU: 1000.0,
  YERCEKIMI: 9.81,
  GPGPU_COZUNURLUK: 256,
  GPGPU_COZUNURLUK_X: 256,
  GPGPU_COZUNURLUK_Z: 512,
  KOSTIK_COZUNURLUK: 512,
  KOSTIK_COZUNURLUK_X: 512,
  KOSTIK_COZUNURLUK_Z: 1024,
  GOLGE_COZUNURLUK: 1024,
  GOLGE_KAMERA_YARI_BOYUT: 10.2,
  MAKSIMUM_DARBE_SAYISI: 24,
  MAKSIMUM_ALT_KURE: 8,
} as const;

/** Galatasaray Yüzme Takımı ve Spor Kompleksi kurumsal renk paleti */
export const GALATASARAY_RENKLERI = {
  KIRMIZI_ANA: '#A90432',
  KIRMIZI_VURGU: '#C8102E',
  SARI_ANA: '#FDB912',
  SARI_ALTIN: '#FFC72C',
  KARBON_ANTRASIT: '#111827',
  HEX_KIRMIZI_ANA: 0xa90432,
  HEX_KIRMIZI_VURGU: 0xc8102e,
  HEX_SARI_ANA: 0xfdb912,
  HEX_SARI_ALTIN: 0xffc72c,
  HEX_KARBON_ANTRASIT: 0x111827,
} as const;

/**
 * Verilen kulvar indeksinin (0 tabanlı: 0..KULVAR_SAYISI-1) X eksenindeki merkez koordinatını döndürür.
 */
export function kulvarMerkeziXGetir(kulvarIndeksi: number): number {
  const sinirliIndeks = Math.max(
    0,
    Math.min(HAVUZ_SABITLERI.KULVAR_SAYISI - 1, Math.round(kulvarIndeksi)),
  );
  const kulvarGenisligi = HAVUZ_SABITLERI.GENISLIK_X / HAVUZ_SABITLERI.KULVAR_SAYISI;
  return HAVUZ_SABITLERI.MIN_X + (sinirliIndeks + 0.5) * kulvarGenisligi;
}

/**
 * Verilen dünya X koordinatına en yakın olimpik kulvarın merkez X koordinatını döndürür.
 */
export function enYakinKulvarMerkeziX(dunyaX: number): number {
  const kulvarGenisligi = HAVUZ_SABITLERI.GENISLIK_X / HAVUZ_SABITLERI.KULVAR_SAYISI;
  const tahminIndeks = Math.floor((dunyaX - HAVUZ_SABITLERI.MIN_X) / kulvarGenisligi);
  return kulvarMerkeziXGetir(tahminIndeks);
}

/**
 * Dünya (x, z) koordinatını GPGPU su dokusu UV koordinatına [0, 1] dönüştürür.
 */
export function dunyaXZdenUVye(x: number, z: number): { u: number; v: number } {
  return {
    u: (x - HAVUZ_SABITLERI.MIN_X) / HAVUZ_SABITLERI.GENISLIK_X,
    v: (z - HAVUZ_SABITLERI.MIN_Z) / HAVUZ_SABITLERI.UZUNLUK_Z,
  };
}

/**
 * GPGPU su dokusu UV koordinatını [0, 1] dünya (x, z) koordinatına dönüştürür.
 */
export function uvDenDunyaXZye(u: number, v: number): { x: number; z: number } {
  return {
    x: u * HAVUZ_SABITLERI.GENISLIK_X + HAVUZ_SABITLERI.MIN_X,
    z: v * HAVUZ_SABITLERI.UZUNLUK_Z + HAVUZ_SABITLERI.MIN_Z,
  };
}

/**
 * Güneş/spot ışığının azimut ve yükseklik açılarına göre kaynaktan sahneye (y < 0)
 * yönelen normalize edilmiş ışık gidiş vektörünü hesaplar.
 */
export function isikYonuHesapla(azimutDerece: number, yukseklikDerece: number): THREE.Vector3 {
  const azimutRad = THREE.MathUtils.degToRad(azimutDerece);
  const yukseklikRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(yukseklikDerece, 15, 89));

  const yatayBilesen = Math.cos(yukseklikRad);
  const kaynagaYon = new THREE.Vector3(
    Math.cos(azimutRad) * yatayBilesen,
    Math.sin(yukseklikRad),
    Math.sin(azimutRad) * yatayBilesen,
  );

  // Işık vektörü sahneye yukarıdan aşağıya inecek şekilde ters çevrilir
  return kaynagaYon.negate().normalize();
}

/** GPGPU yükseklik haritası dokusu (R: yükseklik, G: dikey hız, B: nx, A: nz) */
export type HeightfieldTexture = THREE.Texture;

/** Gerçek zamanlı kırılan ışık odaklarını tutan kostik FBO dokusu */
export type CausticsTexture = THREE.Texture;

/** Sahnedeki etkileşimli cisim tipleri */
export type CisimTipi = 'insan' | 'kure' | 'kutu';

/** Cismin hidrostatik ve davranışsal durum modları */
export type YuzmeDurumModu = 'aktif_yuzme' | 'dengede' | 'batma' | 'serbest';

/** GPU/CPU kaynaklarını bellek sızıntısı olmadan temizleyen ortak arayüz */
export interface KaynakTemizlenebilir {
  temizle(): void;
}

/** Su yüzeyine uygulanacak tekil deplasman darbesi */
export interface SuDarbesiVerisi {
  uvX: number;
  uvZ: number;
  yaricap: number;
  kuvvet: number;
}

/** Su altı gölge ve kostik kesme hesabı için alt küre tanımlayıcısı */
export interface AltKureVerisi {
  merkez: THREE.Vector3;
  yaricap: number;
}

/** Fizik motoru ile GPGPU/Optik modülleri arasındaki ortak cisim sınır sözleşmesi */
export interface ObjectBoundingData {
  aktifTip: CisimTipi;
  merkez: THREE.Vector3;
  sinirlayiciYaricap: number;
  altKutuMin: THREE.Vector3;
  altKutuMak: THREE.Vector3;
  altKureler: AltKureVerisi[];
  aktifAltKureSayisi: number;
  suKesitDarbeleri: SuDarbesiVerisi[];
  yogunluk: number;
  batanHacimOrani: number;
}

/** Türkçe isimlendirme uyumluluğu için ObjectBoundingData takma adı */
export type CisimSinirVerisi = ObjectBoundingData;

/** Arşimet kaldırma kuvveti örneklemesi için yerel hacim noktası */
export interface HacimOrnekNoktasi {
  yerelKonum: THREE.Vector3;
  hacimAgirligi: number;
  propYaricapi: number;
  darbeUretirMi?: boolean;
}

/** Kullanıcı arayüzü tarafından canlı güncellenebilen simülasyon parametreleri */
export interface SimulasyonParametreleri {
  cisimTipi: CisimTipi;
  durumModu: YuzmeDurumModu;
  cisimYogunlugu: number;
  dalgaSonumleme: number;
  kirilmaIndisi: number;
  kostikSiddeti: number;
  isikAzimutAcisi: number;
  isikYukseklikAcisi: number;
  suDurdurulduMu: boolean;
}

/** Kontrol panelinde gösterilen canlı performans ve WebGL2 telemetrisi */
export interface TelemetriVerisi {
  fps: number;
  kareSuresiMs: number;
  aktifGpuPassSayisi: number;
  webgl2AktifMi: boolean;
  floatFboDestegiVarMi: boolean;
}

/** CPU tarafında O(1) sürede dalga yüksekliği sorgulayan fonksiyon tipi */
export type SuYuksekligiSorguFonksiyonu = (dunyaX: number, dunyaZ: number) => number;

/** Alt Ajan A (GPGPU Dalga Simülatörü) sözleşmesi */
export interface GpgpuSimulatorArayuzu extends KaynakTemizlenebilir {
  darbeEkle(uvX: number, uvZ: number, yaricap: number, kuvvet: number): void;
  cokluDarbeEkle(darbeler: readonly SuDarbesiVerisi[]): void;
  adimla(renderer: THREE.WebGLRenderer, sonumleme: number, suDurdurulduMu: boolean): number;
  sifirla(renderer: THREE.WebGLRenderer): void;
  yukseklikDokusuGetir(): HeightfieldTexture;
  suYuksekligiSorgula(dunyaX: number, dunyaZ: number): number;
}

/** Optik işleyicinin her karede ihtiyaç duyduğu sahne girdileri */
export interface OptikGuncellemeGirdisi {
  renderer: THREE.WebGLRenderer;
  sahne: THREE.Scene;
  kamera: THREE.PerspectiveCamera;
  aktifCisimNesnesi: THREE.Object3D;
  yukseklikDokusu: HeightfieldTexture;
  cisimSinirVerisi: ObjectBoundingData;
  parametreler: SimulasyonParametreleri;
  gecenSureSaniye: number;
}

/** Alt Ajan B (Optik, Kırılma ve Kostik İşleyicisi) sözleşmesi */
export interface OptikIsleyiciArayuzu extends KaynakTemizlenebilir {
  guncelleVeIsle(girdi: OptikGuncellemeGirdisi): number;
  kostikDokusuGetir(): CausticsTexture;
  suAltiGolgeDokusuGetir(): THREE.Texture;
  suYuzeyiMeshGetir(): THREE.Mesh;
  havuzMateryaliOlustur(karoDokusu: THREE.Texture): THREE.ShaderMaterial;
  cisimlereSuAltiOptigiBagla(kokNesne: THREE.Object3D): void;
  yenidenBoyutlandir(genislik: number, yukseklik: number): void;
}

/** Alt Ajan D (Kontrol Paneli) olay bildirim sözleşmesi */
export interface KontrolPaneliOlaylari {
  parametreDegisti: (yeniParametreler: SimulasyonParametreleri) => void;
  suyuSifirlaIstegi: () => void;
  cismiYukaridanBirakIstegi: () => void;
  yarisiYenidenBaslatIstegi: () => void;
}

