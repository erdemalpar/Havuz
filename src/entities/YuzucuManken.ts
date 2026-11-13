import * as THREE from 'three';
import {
  dunyaXZdenUVye,
  GALATASARAY_RENKLERI,
  HAVUZ_SABITLERI,
  type AltKureVerisi,
  type CisimTipi,
  type HacimOrnekNoktasi,
  type SuDarbesiVerisi,
  type SuYuksekligiSorguFonksiyonu,
  type YuzmeDurumModu,
} from '../types/simulation';
import { SuCismiTaban } from './SuCismiTaban';

export interface YuzucuYapilandirma {
  ciltRengi?: number;
  boneRengi?: number;
  boneSeritRengi?: number;
  sortAnaRengi?: number;
  sortIkinciRenk?: number;
  gozlukCamRengi?: number;
  tempoCarpani?: number;
}

export type YuzucuAnimasyonFazi =
  | 'otomatik'
  | 'cikis_hazirlik'
  | 'havada_atlayis'
  | 'su_alti_kayma'
  | 'kugu_dalis'
  | 'kirik_pike'
  | 'tam_salto';

interface KolEklemGrubu {
  omuzPivoti: THREE.Group;
  dirsekPivoti: THREE.Group;
  elNoktasi: THREE.Object3D;
}

interface BacakEklemGrubu {
  kalcaPivoti: THREE.Group;
  dizPivoti: THREE.Group;
  ayakNoktasi: THREE.Object3D;
}

interface UzuvSuDurumu {
  sonDunyaKonum: THREE.Vector3;
  oncekiSuFarki: number;
  baslatildi: boolean;
}

/**
 * LatheGeometry profilleri ile inşa edilmiş ~1.70 m boyunda,
 * Galatasaray Yüzme Takımı formalı eklemli anatomik insan yüzücü modeli.
 * Yerel koordinatlar: +Z baş/ileri yüzme yönü, -Z ayaklar, +Y sırt, -Y yüz/göğüs.
 */
export class YuzucuManken extends SuCismiTaban {
  public readonly tip: CisimTipi = 'insan';

  public atanmisKulvarX: number | null = null;
  public maksPozitifZ: number | null = null;
  public aktifAnimasyonFazi: YuzucuAnimasyonFazi = 'otomatik';
  public hizCarpani = 1.0;

  private tempoCarpani: number;
  private readonly iskeletGrubu: THREE.Group;
  private readonly boyunPivoti: THREE.Group;
  private readonly solKol: KolEklemGrubu;
  private readonly sagKol: KolEklemGrubu;
  private readonly solBacak: BacakEklemGrubu;
  private readonly sagBacak: BacakEklemGrubu;

  private readonly basTakipNoktasi: THREE.Object3D;
  private readonly gogusTakipNoktasi: THREE.Object3D;
  private readonly karinTakipNoktasi: THREE.Object3D;
  private readonly pelvisTakipNoktasi: THREE.Object3D;

  private kulacFazi = 0;
  private kelebekFazi = 0;
  private nefesFazi = 0;

  private readonly altKureTamponu: AltKureVerisi[];
  private readonly geciciDunyaKonum = new THREE.Vector3();
  private readonly uzuvTakipDurumlari: UzuvSuDurumu[];
  private readonly boyutVektoru = new THREE.Vector3(0.44, 0.28, 1.70);

  constructor(baslangicYogunlugu = 910, yapilandirma: YuzucuYapilandirma = {}) {
    // 1.70 m atletik vücut oranlarına göre kalibre edilmiş 14 hacim örnekleme noktası (toplam = 1.00)
    const hacimNoktalari: HacimOrnekNoktasi[] = [
      { yerelKonum: new THREE.Vector3(0, 0.015, 0.70), hacimAgirligi: 0.08, propYaricapi: 0.105, darbeUretirMi: true },
      { yerelKonum: new THREE.Vector3(0.19, 0.015, 0.45), hacimAgirligi: 0.07, propYaricapi: 0.085, darbeUretirMi: false },
      { yerelKonum: new THREE.Vector3(-0.19, 0.015, 0.45), hacimAgirligi: 0.07, propYaricapi: 0.085, darbeUretirMi: false },
      { yerelKonum: new THREE.Vector3(0, 0.0, 0.34), hacimAgirligi: 0.16, propYaricapi: 0.125, darbeUretirMi: true },
      { yerelKonum: new THREE.Vector3(0, -0.01, 0.10), hacimAgirligi: 0.14, propYaricapi: 0.115, darbeUretirMi: true },
      { yerelKonum: new THREE.Vector3(0, 0.0, -0.12), hacimAgirligi: 0.14, propYaricapi: 0.11, darbeUretirMi: true },
      { yerelKonum: new THREE.Vector3(0.24, -0.05, 0.28), hacimAgirligi: 0.04, propYaricapi: 0.065, darbeUretirMi: true },
      { yerelKonum: new THREE.Vector3(-0.24, -0.05, 0.28), hacimAgirligi: 0.04, propYaricapi: 0.065, darbeUretirMi: true },
      { yerelKonum: new THREE.Vector3(0.095, 0.0, -0.32), hacimAgirligi: 0.065, propYaricapi: 0.075, darbeUretirMi: false },
      { yerelKonum: new THREE.Vector3(-0.095, 0.0, -0.32), hacimAgirligi: 0.065, propYaricapi: 0.075, darbeUretirMi: false },
      { yerelKonum: new THREE.Vector3(0.095, 0.0, -0.56), hacimAgirligi: 0.045, propYaricapi: 0.06, darbeUretirMi: false },
      { yerelKonum: new THREE.Vector3(-0.095, 0.0, -0.56), hacimAgirligi: 0.045, propYaricapi: 0.06, darbeUretirMi: false },
      { yerelKonum: new THREE.Vector3(0.095, 0.0, -0.78), hacimAgirligi: 0.02, propYaricapi: 0.052, darbeUretirMi: true },
      { yerelKonum: new THREE.Vector3(-0.095, 0.0, -0.78), hacimAgirligi: 0.02, propYaricapi: 0.052, darbeUretirMi: true },
    ];

    super(0.068, baslangicYogunlugu, 0.88, hacimNoktalari);

    this.tempoCarpani = yapilandirma.tempoCarpani ?? 1.0;

    this.iskeletGrubu = new THREE.Group();
    this.kokGrup.add(this.iskeletGrubu);

    // Su altında da dokusuz tam net görünecek renkli MeshStandardMaterial paleti
    const ciltMateryali = new THREE.MeshStandardMaterial({
      color: yapilandirma.ciltRengi ?? 0xdca580,
      roughness: 0.50,
      metalness: 0.04,
    });
    const boneMateryali = new THREE.MeshStandardMaterial({
      color: yapilandirma.boneRengi ?? GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      roughness: 0.28,
      metalness: 0.08,
    });
    const boneSeritMateryali = new THREE.MeshStandardMaterial({
      color: yapilandirma.boneSeritRengi ?? GALATASARAY_RENKLERI.HEX_SARI_ANA,
      roughness: 0.26,
      metalness: 0.10,
    });
    const sortAnaMateryali = new THREE.MeshStandardMaterial({
      color: yapilandirma.sortAnaRengi ?? GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      roughness: 0.48,
      metalness: 0.06,
    });
    const sortIkinciMateryali = new THREE.MeshStandardMaterial({
      color: yapilandirma.sortIkinciRenk ?? GALATASARAY_RENKLERI.HEX_SARI_ANA,
      roughness: 0.44,
      metalness: 0.08,
    });
    const karbonMateryali = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KARBON_ANTRASIT,
      roughness: 0.36,
      metalness: 0.22,
    });
    const gozlukCamMateryali = new THREE.MeshStandardMaterial({
      color: yapilandirma.gozlukCamRengi ?? GALATASARAY_RENKLERI.HEX_SARI_ALTIN,
      roughness: 0.08,
      metalness: 0.90,
    });
    const dudakMateryali = new THREE.MeshStandardMaterial({
      color: 0xb96a60,
      roughness: 0.42,
      metalness: 0.04,
    });
    const kasMateryali = new THREE.MeshStandardMaterial({
      color: 0x2a1b14,
      roughness: 0.72,
      metalness: 0.02,
    });

    this.boyunPivoti = this.govdeVeBasInsaEt(
      ciltMateryali,
      boneMateryali,
      boneSeritMateryali,
      sortAnaMateryali,
      sortIkinciMateryali,
      karbonMateryali,
      gozlukCamMateryali,
      dudakMateryali,
      kasMateryali,
    );

    // Simetrik anatomik kollar ve bacaklar için paylaşımlı geometriler (temizle'de tekil dispose edilir)
    const kolGeometrileri = this.kolGeometrileriOlustur();
    this.solKol = this.kolInsaEt(1, ciltMateryali, kolGeometrileri);
    this.sagKol = this.kolInsaEt(-1, ciltMateryali, kolGeometrileri);

    const bacakGeometrileri = this.bacakGeometrileriOlustur();
    this.solBacak = this.bacakInsaEt(1, ciltMateryali, sortAnaMateryali, sortIkinciMateryali, bacakGeometrileri);
    this.sagBacak = this.bacakInsaEt(-1, ciltMateryali, sortIkinciMateryali, sortAnaMateryali, bacakGeometrileri);

    // Kostik ve su altı gölge kesimi için takip referansları
    this.basTakipNoktasi = this.takipNoktasiOlustur(0, 0.02, 0.70);
    this.gogusTakipNoktasi = this.takipNoktasiOlustur(0, 0.0, 0.34);
    this.karinTakipNoktasi = this.takipNoktasiOlustur(0, -0.01, 0.09);
    this.pelvisTakipNoktasi = this.takipNoktasiOlustur(0, 0.0, -0.14);

    this.altKureTamponu = Array.from({ length: 8 }, () => ({
      merkez: new THREE.Vector3(),
      yaricap: 0.1,
    }));

    this.uzuvTakipDurumlari = Array.from({ length: 4 }, () => ({
      sonDunyaKonum: new THREE.Vector3(),
      oncekiSuFarki: 0,
      baslatildi: false,
    }));

    this.donusumuSenkronizeEt();
  }

  private takipNoktasiOlustur(x: number, y: number, z: number): THREE.Object3D {
    const nokta = new THREE.Object3D();
    nokta.position.set(x, y, z);
    this.iskeletGrubu.add(nokta);
    return nokta;
  }

  private latheProfilOlustur(
    kesitler: Array<[number, number]>,
    radyalSegment = 20,
    phiBaslangic = 0,
    phiUzunluk = Math.PI * 2,
  ): THREE.LatheGeometry {
    const noktalar = kesitler.map(([yaricap, yukseklik]) => new THREE.Vector2(yaricap, yukseklik));
    return new THREE.LatheGeometry(noktalar, radyalSegment, phiBaslangic, phiUzunluk);
  }

  private govdeVeBasInsaEt(
    ciltMat: THREE.Material,
    boneMat: THREE.Material,
    boneSeritMat: THREE.Material,
    sortAnaMat: THREE.Material,
    sortIkinciMat: THREE.Material,
    karbonMat: THREE.Material,
    gozlukCamMat: THREE.Material,
    dudakMat: THREE.Material,
    kasMat: THREE.Material,
  ): THREE.Group {
    // 1. V-formlu yüksek çözünürlüklü kaslı üst gövde & karın profili (+Z ekseni boyunca)
    const govdeGeo = this.latheProfilOlustur(
      [
        [0.01, -0.15],
        [0.105, -0.14],
        [0.102, -0.09],
        [0.100, -0.04],
        [0.096, 0.01],   // İnce bel oyuğu
        [0.098, 0.05],
        [0.108, 0.10],   // Karın üstü
        [0.118, 0.15],   // Alt kaburga
        [0.134, 0.22],   // Geniş göğüs kafesi / latissimus
        [0.142, 0.28],   // Pektoral bölgesi
        [0.143, 0.32],   // Omuz genişliği
        [0.114, 0.365],  // Köprücük/trapez geçişi
        [0.057, 0.40],   // Boyun kökü
        [0.01, 0.405],
      ],
      32,
    );
    govdeGeo.rotateX(Math.PI * 0.5);
    this.govdeAnatomikSekillendir(govdeGeo);
    this.meshOlusturVeEkle(this.iskeletGrubu, govdeGeo, ciltMat, 0, 0, 0.14);

    // 2. Parçalı Galatasaray Jammer Mayosu (pelvis bölgesi: sağ kırmızı, sol sarı)
    const mayoProfil: Array<[number, number]> = [
      [0.01, -0.12],
      [0.098, -0.11],
      [0.116, -0.05],
      [0.118, 0.02],
      [0.104, 0.09],
      [0.01, 0.095],
    ];
    const sagMayoGeo = this.latheProfilOlustur(mayoProfil, 20, 0, Math.PI);
    const solMayoGeo = this.latheProfilOlustur(mayoProfil, 20, Math.PI, Math.PI);
    for (const geo of [sagMayoGeo, solMayoGeo]) {
      geo.rotateX(Math.PI * 0.5);
      this.pelvisAnatomikSekillendir(geo);
    }
    this.meshOlusturVeEkle(this.iskeletGrubu, sagMayoGeo, sortAnaMat, 0, -0.002, -0.06);
    this.meshOlusturVeEkle(this.iskeletGrubu, solMayoGeo, sortIkinciMat, 0, -0.002, -0.06);

    // Mayo bel lastiği ve yan kontrast şeritler
    const belKemeriGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.026, 24);
    belKemeriGeo.rotateX(Math.PI * 0.5);
    belKemeriGeo.scale(1.20, 0.78, 1.0);
    this.meshOlusturVeEkle(this.iskeletGrubu, belKemeriGeo, karbonMat, 0, -0.002, 0.028);

    const yanSeritGeo = new THREE.BoxGeometry(0.016, 0.024, 0.17);
    this.meshOlusturVeEkle(this.iskeletGrubu, yanSeritGeo, sortIkinciMat, -0.132, 0.0, -0.06);
    this.meshOlusturVeEkle(this.iskeletGrubu, yanSeritGeo, sortAnaMat, 0.132, 0.0, -0.06);

    // 3. Boyun pivotu (nefes alma için başı çevirebilir)
    const boyunPivoti = new THREE.Group();
    boyunPivoti.position.set(0, 0.015, 0.53);
    this.iskeletGrubu.add(boyunPivoti);

    const boyunGeo = this.latheProfilOlustur(
      [
        [0.058, 0.0],
        [0.051, 0.04],
        [0.049, 0.08],
        [0.053, 0.12],
      ],
      20,
    );
    boyunGeo.rotateX(Math.PI * 0.5);
    boyunGeo.scale(0.95, 0.92, 1.0);
    this.meshOlusturVeEkle(boyunPivoti, boyunGeo, ciltMat, 0, 0, -0.01);

    // Boyun ön V-kası (sternokleidomastoid) ve gırtlak çıkıntısı
    const boyunKasGeo = new THREE.CapsuleGeometry(0.010, 0.072, 4, 8);
    boyunKasGeo.rotateX(Math.PI * 0.5);
    for (const taraf of [-1, 1] as const) {
      this.meshOlusturVeEkle(
        boyunPivoti,
        boyunKasGeo,
        ciltMat,
        taraf * 0.022,
        -0.036,
        0.042,
        0.08,
        taraf * 0.24,
        0,
      );
    }

    // 4. Anatomik yüz hatlı (burun, kaş, dudak, elmacık, çene) kafa ve GS yarış bonesi + gözlük
    const basMerkeziZ = 0.175;
    const kafaGeo = new THREE.SphereGeometry(0.096, 30, 24);
    kafaGeo.scale(0.86, 0.92, 1.12);
    this.kafaAnatomikSekillendir(kafaGeo);
    this.meshOlusturVeEkle(boyunPivoti, kafaGeo, ciltMat, 0, 0.004, basMerkeziZ);

    // Çene ucu ve alt çene hattı
    const ceneGeo = new THREE.SphereGeometry(0.048, 16, 12);
    ceneGeo.scale(0.90, 0.64, 1.0);
    this.meshOlusturVeEkle(boyunPivoti, ceneGeo, ciltMat, 0, -0.056, basMerkeziZ - 0.044);

    // Yumuşak anatomik burun sırtı, yuvarlak burun ucu ve iki burun kanadı (kutu yerine heykel form)
    const burunSirtiGeo = this.latheProfilOlustur(
      [
        [0.004, 0.0],
        [0.0078, 0.012],
        [0.0098, 0.024],
        [0.0065, 0.030],
        [0.002, 0.032],
      ],
      12,
    );
    burunSirtiGeo.rotateX(-Math.PI * 0.62);
    this.meshOlusturVeEkle(boyunPivoti, burunSirtiGeo, ciltMat, 0, -0.082, basMerkeziZ + 0.024);

    const burunKanatGeo = new THREE.SphereGeometry(0.0068, 10, 8);
    burunKanatGeo.scale(0.95, 0.78, 1.05);
    this.meshOlusturVeEkle(boyunPivoti, burunKanatGeo, ciltMat, -0.0065, -0.092, basMerkeziZ - 0.003);
    this.meshOlusturVeEkle(boyunPivoti, burunKanatGeo, ciltMat, 0.0065, -0.092, basMerkeziZ - 0.003);

    // Üst ve alt dudaklar
    const dudakUstGeo = new THREE.SphereGeometry(0.013, 12, 10);
    dudakUstGeo.scale(1.45, 0.42, 0.42);
    this.meshOlusturVeEkle(boyunPivoti, dudakUstGeo, dudakMat, 0, -0.082, basMerkeziZ - 0.024);

    const dudakAltGeo = new THREE.SphereGeometry(0.0115, 12, 10);
    dudakAltGeo.scale(1.25, 0.40, 0.38);
    this.meshOlusturVeEkle(boyunPivoti, dudakAltGeo, dudakMat, 0, -0.081, basMerkeziZ - 0.032);

    // Kavisli sağ ve sol kaş kemerleri
    const kasGeo = new THREE.CapsuleGeometry(0.0032, 0.020, 4, 8);
    kasGeo.rotateZ(Math.PI * 0.5);
    for (const taraf of [-1, 1] as const) {
      this.meshOlusturVeEkle(
        boyunPivoti,
        kasGeo,
        kasMat,
        taraf * 0.028,
        -0.072,
        basMerkeziZ + 0.048,
        0,
        taraf * 0.14,
        -taraf * 0.16,
      );
    }

    // Kıvrımlı kulaklar
    const kulakGeo = new THREE.SphereGeometry(0.021, 12, 10);
    kulakGeo.scale(0.32, 0.78, 1.05);
    this.meshOlusturVeEkle(boyunPivoti, kulakGeo, ciltMat, 0.080, 0.002, basMerkeziZ - 0.01);
    this.meshOlusturVeEkle(boyunPivoti, kulakGeo, ciltMat, -0.080, 0.002, basMerkeziZ - 0.01);

    // Galatasaray silikon yarış bonesi (kırmızı zemin + orta sarı-kırmızı şeritler + şakak "GS" kontrast detayları)
    const boneKubbeGeo = new THREE.SphereGeometry(0.099, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
    boneKubbeGeo.scale(0.87, 1.13, 0.93);
    this.meshOlusturVeEkle(
      boyunPivoti,
      boneKubbeGeo,
      boneMat,
      0,
      0.008,
      basMerkeziZ + 0.008,
      Math.PI * 0.42,
      0,
      0,
    );

    // Bone üzerinde tepeden enseye uzanan sarı orta yarış şeridi
    const boneOrtaSeritGeo = new THREE.TorusGeometry(0.099, 0.008, 8, 24, Math.PI * 0.95);
    boneOrtaSeritGeo.scale(0.94, 1.13, 0.88);
    this.meshOlusturVeEkle(
      boyunPivoti,
      boneOrtaSeritGeo,
      boneSeritMat,
      0,
      0.008,
      basMerkeziZ + 0.01,
      0.20,
      Math.PI * 0.5,
      0,
    );

    // Yanlarda "GS" altın sarısı kontrast arma barları
    const gsArmasiGeo = new THREE.BoxGeometry(0.008, 0.016, 0.042);
    for (const taraf of [-1, 1] as const) {
      this.meshOlusturVeEkle(
        boyunPivoti,
        gsArmasiGeo,
        boneSeritMat,
        taraf * 0.076,
        0.025,
        basMerkeziZ + 0.036,
        0,
        taraf * 0.16,
        0,
      );
    }

    // Çift elastik kayışlı aynalı altın/kırmızı yarış gözlüğü
    const gozlukKayisiGeo = new THREE.TorusGeometry(0.094, 0.0055, 8, 28);
    gozlukKayisiGeo.scale(0.87, 0.95, 1.0);
    this.meshOlusturVeEkle(boyunPivoti, gozlukKayisiGeo, boneMat, 0, 0.004, basMerkeziZ + 0.016, -0.08, 0, 0);
    this.meshOlusturVeEkle(boyunPivoti, gozlukKayisiGeo, boneSeritMat, 0, 0.008, basMerkeziZ + 0.002, -0.26, 0, 0);

    const lensCerceveGeo = new THREE.CylinderGeometry(0.023, 0.023, 0.015, 16);
    const lensCamGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.018, 16);
    for (const taraf of [-1, 1] as const) {
      this.meshOlusturVeEkle(
        boyunPivoti,
        lensCerceveGeo,
        boneMat,
        taraf * 0.030,
        -0.078,
        basMerkeziZ + 0.026,
        0.16,
        0,
        taraf * 0.16,
      );
      this.meshOlusturVeEkle(
        boyunPivoti,
        lensCamGeo,
        gozlukCamMat,
        taraf * 0.030,
        -0.080,
        basMerkeziZ + 0.026,
        0.16,
        0,
        taraf * 0.16,
      );
    }

    this.meshOlusturVeEkle(
      boyunPivoti,
      new THREE.BoxGeometry(0.024, 0.008, 0.010),
      boneSeritMat,
      0,
      -0.084,
      basMerkeziZ + 0.024,
    );

    return boyunPivoti;
  }

  private kafaAnatomikSekillendir(geometri: THREE.BufferGeometry): void {
    const pos = geometri.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Çene ucu ve alt çene hattı (-Z yönü çeneye doğru daralır, ön yüz -Y tarafında)
      if (z < -0.01 && y < 0.02) {
        const altFaktor = THREE.MathUtils.clamp((-z - 0.01) / 0.09, 0, 1);
        x *= 1.0 - altFaktor * 0.28;
        if (y < -0.02) {
          y -= altFaktor * 0.008 * Math.exp(-Math.pow(x / 0.030, 2));
        }
      }

      // Elmacık kemiği vurgusu ve göz çukuru girintisi (y < -0.04, z > 0)
      if (y < -0.03 && z > -0.01 && z < 0.06) {
        const elmacik =
          Math.exp(-Math.pow((Math.abs(x) - 0.046) / 0.022, 2)) *
          Math.exp(-Math.pow((z - 0.006) / 0.024, 2));
        const gozYuvasi =
          Math.exp(-Math.pow((Math.abs(x) - 0.028) / 0.018, 2)) *
          Math.exp(-Math.pow((z - 0.032) / 0.018, 2));
        y -= elmacik * 0.007;
        y += gozYuvasi * 0.006;
      }

      pos.setXYZ(i, x, y, z);
    }
    geometri.computeVertexNormals();
  }

  private govdeAnatomikSekillendir(geometri: THREE.BufferGeometry): void {
    const pos = geometri.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) * 1.36;
      let y = pos.getY(i) * 0.72;
      const z = pos.getZ(i);

      // Ön cephe (-Y): göğüs (pektoral), köprücük kemiği ve karın kasları (six-pack)
      if (y < 0) {
        // Köprücük kemiği kemeri (z: 0.32 .. 0.37)
        if (z > 0.31 && z < 0.38) {
          const klavikula =
            Math.exp(-Math.pow((z - 0.345) / 0.016, 2)) *
            THREE.MathUtils.clamp(Math.abs(x) / 0.08, 0.15, 1.0);
          y -= klavikula * 0.008;
        }

        // Pektoral kas kabarıklığı ve ortada sternum oyuğu (z: 0.13 .. 0.34)
        if (z > 0.12 && z < 0.34) {
          const gogusBant = Math.sin(((z - 0.12) / 0.22) * Math.PI);
          const lob = Math.exp(-Math.pow((Math.abs(x) - 0.068) / 0.052, 2));
          const sternumOlugu = Math.exp(-Math.pow(x / 0.016, 2));
          y -= gogusBant * lob * 0.021 - gogusBant * sternumOlugu * 0.007;
        }

        // Karın kasları (rectus abdominis 3 blok + dikey orta oluk, z: -0.06 .. 0.13)
        if (z > -0.06 && z < 0.13 && Math.abs(x) < 0.085) {
          const karinBant = Math.sin(((z + 0.06) / 0.19) * Math.PI);
          const dikeyOluk = Math.exp(-Math.pow(x / 0.013, 2));
          const lobX = Math.exp(-Math.pow((Math.abs(x) - 0.032) / 0.022, 2));
          const satir = Math.abs(Math.sin(((z + 0.05) / 0.17) * Math.PI * 3.0));
          y -= karinBant * (lobX * satir * 0.009 - dikeyOluk * 0.005);
        }
      }

      // Sırt tarafı (+Y): omurga oluğu, kürek kemikleri (skapula) ve kanat kası
      if (y > 0.02) {
        const omurgaOlugu = Math.exp(-Math.pow(x / 0.028, 2));
        const skapula =
          z > 0.16 && z < 0.35
            ? Math.sin(((z - 0.16) / 0.19) * Math.PI) *
              Math.exp(-Math.pow((Math.abs(x) - 0.075) / 0.045, 2))
            : 0;
        y += skapula * 0.011 - omurgaOlugu * 0.012;
      }

      pos.setXYZ(i, x, y, z);
    }
    geometri.computeVertexNormals();
  }

  private pelvisAnatomikSekillendir(geometri: THREE.BufferGeometry): void {
    const pos = geometri.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * 1.20;
      let y = pos.getY(i) * 0.78;
      const z = pos.getZ(i);

      // Kalça/gluteal kavis (+Y arka taraf)
      if (y > 0 && z > -0.10 && z < 0.04) {
        const kavis = Math.sin(((z + 0.10) / 0.14) * Math.PI);
        y += kavis * 0.016;
      }

      pos.setXYZ(i, x, y, z);
    }
    geometri.computeVertexNormals();
  }

  private kolGeometrileriOlustur() {
    const deltoidGeo = new THREE.SphereGeometry(0.054, 14, 12);
    deltoidGeo.scale(0.95, 1.15, 0.95);

    // Üst kol (deltoidden biseps/triseps şişkinliğine ve dirseğe daralma, -Y ekseni boyunca)
    const ustKolGeo = this.latheProfilOlustur(
      [
        [0.036, -0.26],
        [0.042, -0.20],
        [0.050, -0.12],
        [0.048, -0.04],
        [0.042, 0.0],
      ],
      18,
    );
    ustKolGeo.scale(0.92, 1.0, 1.06);

    const dirsekGeo = new THREE.SphereGeometry(0.035, 12, 10);

    // Ön kol (dirsekten önkol kasına şişip ince bileğe daralma)
    const onKolGeo = this.latheProfilOlustur(
      [
        [0.023, -0.23],
        [0.029, -0.16],
        [0.040, -0.07],
        [0.037, -0.02],
        [0.034, 0.0],
      ],
      18,
    );
    onKolGeo.scale(1.04, 1.0, 0.86);

    const bilekGeo = new THREE.SphereGeometry(0.024, 10, 8);
    bilekGeo.scale(1.05, 0.75, 0.78);

    // Şekillendirilmiş organik avuç içi (kutu yerine anatomik oval form)
    const avucGeo = new THREE.SphereGeometry(0.036, 14, 12);
    avucGeo.scale(0.95, 1.18, 0.36);

    // Uca doğru incelen eklemli parmak geometrisi (-Y ekseninde)
    const parmakGeo = this.latheProfilOlustur(
      [
        [0.0045, -0.074],
        [0.0062, -0.042],
        [0.0074, -0.015],
        [0.0078, 0.0],
      ],
      8,
    );

    const basParmakGeo = this.latheProfilOlustur(
      [
        [0.0052, -0.048],
        [0.0076, -0.024],
        [0.0092, 0.0],
      ],
      8,
    );

    return {
      deltoidGeo,
      ustKolGeo,
      dirsekGeo,
      onKolGeo,
      bilekGeo,
      avucGeo,
      parmakGeo,
      basParmakGeo,
    };
  }

  private kolInsaEt(
    tarafIsareti: 1 | -1,
    ciltMat: THREE.Material,
    geo: ReturnType<YuzucuManken['kolGeometrileriOlustur']>,
  ): KolEklemGrubu {
    const omuzPivoti = new THREE.Group();
    omuzPivoti.position.set(tarafIsareti * 0.205, 0.015, 0.44);
    this.iskeletGrubu.add(omuzPivoti);

    this.meshOlusturVeEkle(omuzPivoti, geo.deltoidGeo, ciltMat);
    this.meshOlusturVeEkle(omuzPivoti, geo.ustKolGeo, ciltMat);

    const dirsekPivoti = new THREE.Group();
    dirsekPivoti.position.set(0, -0.26, 0);
    omuzPivoti.add(dirsekPivoti);

    this.meshOlusturVeEkle(dirsekPivoti, geo.dirsekGeo, ciltMat);
    this.meshOlusturVeEkle(dirsekPivoti, geo.onKolGeo, ciltMat);

    // Bilek + organik avuç içi + 4 ayrı parmak + başparmak (5 parmaklı el)
    this.meshOlusturVeEkle(dirsekPivoti, geo.bilekGeo, ciltMat, 0, -0.232, 0);
    this.meshOlusturVeEkle(dirsekPivoti, geo.avucGeo, ciltMat, 0, -0.268, 0);

    // İşaret, orta, yüzük ve serçe parmaklar: başparmak tarafı (-tarafIsareti) -> dış (+tarafIsareti)
    const parmakKonfigurasyonlari = [
      { xOfset: -tarafIsareti * 0.023, boyOlcek: 0.94, yayZ: -tarafIsareti * 0.05 },
      { xOfset: -tarafIsareti * 0.008, boyOlcek: 1.04, yayZ: -tarafIsareti * 0.01 },
      { xOfset: tarafIsareti * 0.008, boyOlcek: 0.96, yayZ: tarafIsareti * 0.03 },
      { xOfset: tarafIsareti * 0.022, boyOlcek: 0.78, yayZ: tarafIsareti * 0.07 },
    ];
    for (const p of parmakKonfigurasyonlari) {
      const parmakMesh = this.meshOlusturVeEkle(
        dirsekPivoti,
        geo.parmakGeo,
        ciltMat,
        p.xOfset,
        -0.300,
        0,
        0.08,
        0,
        p.yayZ,
      );
      parmakMesh.scale.set(1.0, p.boyOlcek, 1.0);
    }

    // Doğal dış açılı başparmak
    this.meshOlusturVeEkle(
      dirsekPivoti,
      geo.basParmakGeo,
      ciltMat,
      -tarafIsareti * 0.033,
      -0.254,
      -0.006,
      0.14,
      0,
      -tarafIsareti * 0.44,
    );

    const elNoktasi = new THREE.Object3D();
    elNoktasi.position.set(0, -0.32, 0);
    dirsekPivoti.add(elNoktasi);

    return { omuzPivoti, dirsekPivoti, elNoktasi };
  }

  private bacakGeometrileriOlustur() {
    // Uyluk jammer mayosu üst parçası (-Z ekseni boyunca)
    const uylukMayoGeo = this.latheProfilOlustur(
      [
        [0.056, -0.20],
        [0.063, -0.12],
        [0.070, -0.04],
        [0.072, 0.0],
      ],
      20,
    );
    uylukMayoGeo.rotateX(Math.PI * 0.5);
    uylukMayoGeo.scale(0.98, 1.04, 1.0);

    // Uyluk yan yarış şeridi
    const uylukSeritGeo = new THREE.BoxGeometry(0.012, 0.018, 0.17);

    // Diz üstü kaslı ten kısmı
    const uylukTenGeo = this.latheProfilOlustur(
      [
        [0.047, -0.29],
        [0.052, -0.24],
        [0.055, -0.20],
      ],
      18,
    );
    uylukTenGeo.rotateX(Math.PI * 0.5);

    const dizGeo = new THREE.SphereGeometry(0.046, 14, 12);

    // Baldır: gastroknemius kasından ince aşil/bileğe daralma
    const baldirGeo = this.latheProfilOlustur(
      [
        [0.028, -0.28],
        [0.035, -0.20],
        [0.052, -0.10],
        [0.046, -0.04],
        [0.044, 0.0],
      ],
      20,
    );
    baldirGeo.rotateX(Math.PI * 0.5);
    baldirGeo.scale(0.92, 1.06, 1.0);

    const ayakBilekGeo = new THREE.SphereGeometry(0.031, 12, 10);
    const topukGeo = new THREE.SphereGeometry(0.028, 12, 10);

    // Organik şekillendirilmiş ayak tarağı ve taban kemeri (kutu yerine anatomik heykel)
    const ayakGovdeGeo = new THREE.SphereGeometry(0.038, 16, 12);
    ayakGovdeGeo.scale(0.84, 0.50, 1.65);

    // 5 ayak parmağı için incelen temel parmak geometrisi (-Z yönüne uzanır)
    const ayakParmakGeo = this.latheProfilOlustur(
      [
        [0.0038, -0.034],
        [0.0056, -0.018],
        [0.0066, 0.0],
      ],
      8,
    );
    ayakParmakGeo.rotateX(Math.PI * 0.5);

    return {
      uylukMayoGeo,
      uylukSeritGeo,
      uylukTenGeo,
      dizGeo,
      baldirGeo,
      ayakBilekGeo,
      topukGeo,
      ayakGovdeGeo,
      ayakParmakGeo,
    };
  }

  private bacakInsaEt(
    tarafIsareti: 1 | -1,
    ciltMat: THREE.Material,
    mayoMat: THREE.Material,
    seritMat: THREE.Material,
    geo: ReturnType<YuzucuManken['bacakGeometrileriOlustur']>,
  ): BacakEklemGrubu {
    const kalcaPivoti = new THREE.Group();
    kalcaPivoti.position.set(tarafIsareti * 0.092, -0.005, -0.14);
    this.iskeletGrubu.add(kalcaPivoti);

    this.meshOlusturVeEkle(kalcaPivoti, geo.uylukMayoGeo, mayoMat);
    this.meshOlusturVeEkle(
      kalcaPivoti,
      geo.uylukSeritGeo,
      seritMat,
      tarafIsareti * 0.066,
      0.0,
      -0.105,
    );
    this.meshOlusturVeEkle(kalcaPivoti, geo.uylukTenGeo, ciltMat);

    const dizPivoti = new THREE.Group();
    dizPivoti.position.set(0, 0, -0.29);
    kalcaPivoti.add(dizPivoti);

    this.meshOlusturVeEkle(dizPivoti, geo.dizGeo, ciltMat);
    this.meshOlusturVeEkle(dizPivoti, geo.baldirGeo, ciltMat);

    // Bilek + topuk + anatomik ayak tarağı + 5 parmak (başparmaktan serçeye)
    this.meshOlusturVeEkle(dizPivoti, geo.ayakBilekGeo, ciltMat, 0, 0.0, -0.28);
    this.meshOlusturVeEkle(dizPivoti, geo.topukGeo, ciltMat, 0, 0.015, -0.296);
    this.meshOlusturVeEkle(dizPivoti, geo.ayakGovdeGeo, ciltMat, 0, -0.008, -0.346, 0.24, 0, 0);

    const ayakParmakTanimlari = [
      { xOfset: -tarafIsareti * 0.020, kalinlik: 1.25, uzunluk: 1.08, zOfset: -0.398 },
      { xOfset: -tarafIsareti * 0.009, kalinlik: 0.92, uzunluk: 1.12, zOfset: -0.400 },
      { xOfset: tarafIsareti * 0.002, kalinlik: 0.85, uzunluk: 0.96, zOfset: -0.398 },
      { xOfset: tarafIsareti * 0.012, kalinlik: 0.78, uzunluk: 0.82, zOfset: -0.394 },
      { xOfset: tarafIsareti * 0.021, kalinlik: 0.72, uzunluk: 0.68, zOfset: -0.388 },
    ];
    for (const ap of ayakParmakTanimlari) {
      const parmak = this.meshOlusturVeEkle(
        dizPivoti,
        geo.ayakParmakGeo,
        ciltMat,
        ap.xOfset,
        -0.024,
        ap.zOfset,
        0.26,
        0,
        0,
      );
      parmak.scale.set(ap.kalinlik, ap.kalinlik, ap.uzunluk);
    }

    const ayakNoktasi = new THREE.Object3D();
    ayakNoktasi.position.set(0, -0.02, -0.42);
    dizPivoti.add(ayakNoktasi);

    return { kalcaPivoti, dizPivoti, ayakNoktasi };
  }

  public yerelKutuBoyutlariGetir(): THREE.Vector3 {
    return this.boyutVektoru;
  }

  public tempoCarpaniAyarla(yeniTempo: number): void {
    this.tempoCarpani = THREE.MathUtils.clamp(yeniTempo, 0.72, 1.55);
  }

  public override konumuSifirla(hedefKonum: THREE.Vector3): void {
    super.konumuSifirla(hedefKonum);
    for (const durum of this.uzuvTakipDurumlari) {
      durum.baslatildi = false;
    }
  }

  public animasyonuGuncelle(
    dt: number,
    gecenSure: number,
    durumModu: YuzmeDurumModu,
    batanOran: number,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
  ): SuDarbesiVerisi[] {
    const guvenliDt = Math.max(dt, 0.001);
    const yumusatma = 1 - Math.exp(-9.0 * guvenliDt);
    this.nefesFazi += guvenliDt * 2.1;

    if (this.aktifAnimasyonFazi === 'cikis_hazirlik') {
      this.cikisHazirlikPozuUygula(yumusatma);
    } else if (this.aktifAnimasyonFazi === 'havada_atlayis') {
      this.streamlineOkPozuUygula(yumusatma);
    } else if (this.aktifAnimasyonFazi === 'kugu_dalis') {
      this.kuguDalisPozuUygula(yumusatma);
    } else if (this.aktifAnimasyonFazi === 'kirik_pike') {
      this.kirikPikePozuUygula(yumusatma);
    } else if (this.aktifAnimasyonFazi === 'tam_salto') {
      this.tamSaltoPozuUygula(yumusatma);
    } else if (this.aktifAnimasyonFazi === 'su_alti_kayma') {
      this.kelebekFazi += guvenliDt * 9.5;
      this.suAltiKelebekPozuUygula(yumusatma);
    } else if (
      durumModu === 'aktif_yuzme' &&
      batanOran > 0.25 &&
      !this.tutuluyorMu &&
      this.hizCarpani > 0.05
    ) {
      this.kulacFazi += guvenliDt * 4.8 * this.tempoCarpani * THREE.MathUtils.clamp(this.hizCarpani, 0.65, 1.45);
      this.serbestStilAnimasyonuUygula(yumusatma);
    } else if (durumModu === 'batma') {
      this.batmaPozuUygula(yumusatma);
    } else {
      this.dengedePozuUygula(gecenSure, yumusatma);
    }

    this.kokGrup.updateMatrixWorld(true);
    return this.uzuvSuDarbeleriniUret(guvenliDt, durumModu, suYuksekligiSorgula);
  }

  private kirikPikePozuUygula(yumusatma: number): void {
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.x, -0.35, yumusatma),
      0,
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma),
    );

    // Pike pozu: dizler tam düz, kalçadan 75° katlanmış, eller baldır arkasını kavrar
    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(kol.omuzPivoti.rotation.x, -0.78, yumusatma * 1.6);
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(kol.omuzPivoti.rotation.z, taraf * 0.28, yumusatma * 1.6);
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, -0.18, yumusatma * 1.6);
    }

    for (const bacak of [this.solBacak, this.sagBacak]) {
      bacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(bacak.kalcaPivoti.rotation.x, -1.28, yumusatma * 1.6);
      bacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(bacak.dizPivoti.rotation.x, 0.03, yumusatma * 1.6);
    }
  }

  private tamSaltoPozuUygula(yumusatma: number): void {
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.x, -0.52, yumusatma),
      0,
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma),
    );

    // Tuck (salto) pozu: dizler ve kalça tamamen katlı, kollar kaval kemiklerini tutar
    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(kol.omuzPivoti.rotation.x, -0.45, yumusatma * 1.8);
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(kol.omuzPivoti.rotation.z, taraf * 0.16, yumusatma * 1.8);
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, -1.05, yumusatma * 1.8);
    }

    for (const bacak of [this.solBacak, this.sagBacak]) {
      bacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(bacak.kalcaPivoti.rotation.x, -1.55, yumusatma * 1.8);
      bacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(bacak.dizPivoti.rotation.x, 1.78, yumusatma * 1.8);
    }
  }

  private cikisHazirlikPozuUygula(yumusatma: number): void {
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.x, -0.35, yumusatma),
      0,
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma),
    );

    // Track-start pozisyonu: kollar öndeki bloğu kavrar, dizler ve kalça bükülü
    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(kol.omuzPivoti.rotation.x, -0.25, yumusatma);
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(kol.omuzPivoti.rotation.z, taraf * 0.14, yumusatma);
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, -0.28, yumusatma);
    }

    this.solBacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(this.solBacak.kalcaPivoti.rotation.x, -1.08, yumusatma);
    this.solBacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(this.solBacak.dizPivoti.rotation.x, 1.05, yumusatma);
    this.sagBacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(this.sagBacak.kalcaPivoti.rotation.x, -0.82, yumusatma);
    this.sagBacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(this.sagBacak.dizPivoti.rotation.x, 0.85, yumusatma);
  }

  private streamlineOkPozuUygula(yumusatma: number): void {
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.x, 0, yumusatma),
      0,
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma),
    );

    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(
        kol.omuzPivoti.rotation.x,
        -Math.PI * 0.52,
        yumusatma * 1.4,
      );
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(
        kol.omuzPivoti.rotation.z,
        -taraf * 0.14,
        yumusatma * 1.4,
      );
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(
        kol.dirsekPivoti.rotation.x,
        -0.06,
        yumusatma * 1.4,
      );
    }

    for (const bacak of [this.solBacak, this.sagBacak]) {
      bacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(bacak.kalcaPivoti.rotation.x, 0, yumusatma);
      bacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(bacak.dizPivoti.rotation.x, 0.04, yumusatma);
    }
  }

  private kuguDalisPozuUygula(yumusatma: number): void {
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.x, -0.15, yumusatma),
      0,
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma),
    );

    // 10m tramplenden çıkışta kollar yanlara açık estetik kuğu açılışı
    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(kol.omuzPivoti.rotation.x, -0.30, yumusatma * 1.2);
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(kol.omuzPivoti.rotation.z, taraf * 1.38, yumusatma * 1.2);
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, -0.14, yumusatma);
    }

    for (const bacak of [this.solBacak, this.sagBacak]) {
      bacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(bacak.kalcaPivoti.rotation.x, 0.04, yumusatma);
      bacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(bacak.dizPivoti.rotation.x, 0.06, yumusatma);
    }
  }

  private suAltiKelebekPozuUygula(yumusatma: number): void {
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.x, 0, yumusatma),
      0,
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma),
    );

    // Kollar baş ilerisinde streamline kenetli
    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(kol.omuzPivoti.rotation.x, -Math.PI * 0.52, yumusatma);
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(kol.omuzPivoti.rotation.z, -taraf * 0.14, yumusatma);
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, -0.05, yumusatma);
    }

    // İki bacak eş fazlı sinüzoidal kelebek vuruşu (dolphin kick)
    const kalcaSalinim = Math.sin(this.kelebekFazi) * 0.34;
    const dizSalinim = Math.max(0, -Math.cos(this.kelebekFazi) * 0.42 + 0.14);
    for (const bacak of [this.solBacak, this.sagBacak]) {
      bacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(bacak.kalcaPivoti.rotation.x, kalcaSalinim, yumusatma * 1.4);
      bacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(bacak.dizPivoti.rotation.x, dizSalinim, yumusatma * 1.4);
    }
  }

  private serbestStilAnimasyonuUygula(yumusatma: number): void {
    const solFaz = this.kulacFazi;
    const sagFaz = this.kulacFazi + Math.PI;

    // Gövde omuz yuvarlanması (body roll)
    const hedefGovdeRoll = Math.sin(solFaz) * 0.18;
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(
      this.iskeletGrubu.rotation.z,
      hedefGovdeRoll,
      yumusatma,
    );

    // Her 3 kulaçta (1.5 tam döngü = 3 * PI) boyunPivoti ile yana çevirip nefes alma
    const nefesDongusu = solFaz % (Math.PI * 3);
    const nefesAcisi =
      nefesDongusu > Math.PI * 0.25 && nefesDongusu < Math.PI * 0.95
        ? Math.sin(((nefesDongusu - Math.PI * 0.25) / (Math.PI * 0.70)) * Math.PI)
        : 0;
    this.boyunPivoti.rotation.z = THREE.MathUtils.lerp(
      this.boyunPivoti.rotation.z,
      nefesAcisi * 0.78,
      yumusatma,
    );
    this.boyunPivoti.rotation.x = THREE.MathUtils.lerp(
      this.boyunPivoti.rotation.x,
      nefesAcisi * 0.14,
      yumusatma,
    );

    this.tekKolKulacGuncelle(this.solKol, solFaz, 1, yumusatma);
    this.tekKolKulacGuncelle(this.sagKol, sagFaz, -1, yumusatma);

    const tekmeFazi = this.kulacFazi * 2.5;
    this.tekBacakCirpmaGuncelle(this.solBacak, tekmeFazi, yumusatma);
    this.tekBacakCirpmaGuncelle(this.sagBacak, tekmeFazi + Math.PI, yumusatma);
  }

  private tekKolKulacGuncelle(
    kol: KolEklemGrubu,
    faz: number,
    tarafIsareti: 1 | -1,
    yumusatma: number,
  ): void {
    const normalizeFaz = ((faz % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const omuzX = normalizeFaz - Math.PI / 2;

    const havadaMi = Math.max(0, -Math.sin(normalizeFaz));
    const cekisteMi = Math.max(0, Math.sin(normalizeFaz));
    const hedefDirsekX = -(0.22 + havadaMi * 0.88 + cekisteMi * 0.35);
    const hedefOmuzZ = tarafIsareti * (0.18 + havadaMi * 0.22);

    kol.omuzPivoti.rotation.x = this.aciYumusakGecis(kol.omuzPivoti.rotation.x, omuzX, yumusatma * 1.4);
    kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(kol.omuzPivoti.rotation.z, hedefOmuzZ, yumusatma);
    kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, hedefDirsekX, yumusatma);
  }

  private tekBacakCirpmaGuncelle(bacak: BacakEklemGrubu, faz: number, yumusatma: number): void {
    const salinim = Math.sin(faz);
    const hedefKalcaX = salinim * 0.26;
    const hedefDizX = Math.max(0, Math.cos(faz) * 0.32 + 0.16);

    bacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(bacak.kalcaPivoti.rotation.x, hedefKalcaX, yumusatma);
    bacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(bacak.dizPivoti.rotation.x, hedefDizX, yumusatma);
  }

  private dengedePozuUygula(gecenSure: number, yumusatma: number): void {
    const hafifSalinim = Math.sin(this.nefesFazi + gecenSure * 0.2);

    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.x, 0.08, yumusatma),
      0,
      THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma),
    );

    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(
        kol.omuzPivoti.rotation.x,
        -0.55 + hafifSalinim * 0.08,
        yumusatma,
      );
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(
        kol.omuzPivoti.rotation.z,
        taraf * (0.38 + hafifSalinim * 0.04),
        yumusatma,
      );
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, -0.35, yumusatma);
    }

    this.solBacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(
      this.solBacak.kalcaPivoti.rotation.x,
      -0.06 + hafifSalinim * 0.05,
      yumusatma,
    );
    this.sagBacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(
      this.sagBacak.kalcaPivoti.rotation.x,
      -0.06 - hafifSalinim * 0.05,
      yumusatma,
    );
    this.solBacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(this.solBacak.dizPivoti.rotation.x, 0.14, yumusatma);
    this.sagBacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(this.sagBacak.dizPivoti.rotation.x, 0.14, yumusatma);
  }

  private batmaPozuUygula(yumusatma: number): void {
    const suSuzulmesi = Math.sin(this.nefesFazi * 0.6) * 0.04;
    this.iskeletGrubu.rotation.z = THREE.MathUtils.lerp(this.iskeletGrubu.rotation.z, 0, yumusatma);
    this.boyunPivoti.rotation.set(0, 0, THREE.MathUtils.lerp(this.boyunPivoti.rotation.z, 0, yumusatma));

    for (const [kol, taraf] of [
      [this.solKol, 1],
      [this.sagKol, -1],
    ] as const) {
      kol.omuzPivoti.rotation.x = this.aciYumusakGecis(
        kol.omuzPivoti.rotation.x,
        -Math.PI * 0.68 + suSuzulmesi,
        yumusatma * 0.7,
      );
      kol.omuzPivoti.rotation.z = THREE.MathUtils.lerp(
        kol.omuzPivoti.rotation.z,
        taraf * 0.48,
        yumusatma * 0.7,
      );
      kol.dirsekPivoti.rotation.x = THREE.MathUtils.lerp(kol.dirsekPivoti.rotation.x, -0.25, yumusatma * 0.7);
    }

    for (const bacak of [this.solBacak, this.sagBacak]) {
      bacak.kalcaPivoti.rotation.x = THREE.MathUtils.lerp(bacak.kalcaPivoti.rotation.x, 0.08 + suSuzulmesi, yumusatma * 0.7);
      bacak.dizPivoti.rotation.x = THREE.MathUtils.lerp(bacak.dizPivoti.rotation.x, 0.18, yumusatma * 0.7);
    }
  }

  private aciYumusakGecis(mevcut: number, hedef: number, t: number): number {
    let fark = ((hedef - mevcut + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (fark < -Math.PI) {
      fark += Math.PI * 2;
    }
    return mevcut + fark * t;
  }

  private uzuvSuDarbeleriniUret(
    dt: number,
    durumModu: YuzmeDurumModu,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
  ): SuDarbesiVerisi[] {
    const darbeler: SuDarbesiVerisi[] = [];
    const uzuvNoktalari = [
      this.solKol.elNoktasi,
      this.sagKol.elNoktasi,
      this.solBacak.ayakNoktasi,
      this.sagBacak.ayakNoktasi,
    ];

    for (let i = 0; i < uzuvNoktalari.length; i++) {
      const nokta = uzuvNoktalari[i];
      const durum = this.uzuvTakipDurumlari[i];
      nokta.getWorldPosition(this.geciciDunyaKonum);

      const suY = suYuksekligiSorgula(this.geciciDunyaKonum.x, this.geciciDunyaKonum.z);
      const suFarki = this.geciciDunyaKonum.y - suY;

      if (!durum.baslatildi) {
        durum.sonDunyaKonum.copy(this.geciciDunyaKonum);
        durum.oncekiSuFarki = suFarki;
        durum.baslatildi = true;
        continue;
      }

      const hiz = this.geciciDunyaKonum.distanceTo(durum.sonDunyaKonum) / dt;
      const havuzIcindeMi =
        this.geciciDunyaKonum.x > HAVUZ_SABITLERI.MIN_X + 0.06 &&
        this.geciciDunyaKonum.x < HAVUZ_SABITLERI.MAK_X - 0.06 &&
        this.geciciDunyaKonum.z > HAVUZ_SABITLERI.MIN_Z + 0.06 &&
        this.geciciDunyaKonum.z < HAVUZ_SABITLERI.MAK_Z - 0.06;

      if (havuzIcindeMi && Math.abs(suFarki) < 0.24) {
        const uv = dunyaXZdenUVye(this.geciciDunyaKonum.x, this.geciciDunyaKonum.z);
        const suyaYeniGiris = durum.oncekiSuFarki > 0.02 && suFarki <= 0.02;

        if (suyaYeniGiris && hiz > 0.45) {
          const elMi = i < 2;
          darbeler.push({
            uvX: THREE.MathUtils.clamp(uv.u, 0.02, 0.98),
            uvZ: THREE.MathUtils.clamp(uv.v, 0.02, 0.98),
            yaricap: elMi ? 0.018 : 0.015,
            kuvvet: -THREE.MathUtils.clamp(hiz * 0.022, 0.022, 0.064),
          });
        } else if (hiz > 0.28) {
          const modCarpani = durumModu === 'aktif_yuzme' ? 1.0 : 0.55;
          darbeler.push({
            uvX: THREE.MathUtils.clamp(uv.u, 0.02, 0.98),
            uvZ: THREE.MathUtils.clamp(uv.v, 0.02, 0.98),
            yaricap: 0.013,
            kuvvet: -THREE.MathUtils.clamp(hiz * 0.0075 * modCarpani, 0.004, 0.018),
          });
        }
      }

      durum.sonDunyaKonum.copy(this.geciciDunyaKonum);
      durum.oncekiSuFarki = suFarki;
    }

    return darbeler;
  }

  public altKureleriHesapla(): AltKureVerisi[] {
    this.kokGrup.updateMatrixWorld(true);

    const hedefler: Array<{ nesne: THREE.Object3D; yaricap: number }> = [
      { nesne: this.basTakipNoktasi, yaricap: 0.11 },
      { nesne: this.gogusTakipNoktasi, yaricap: 0.16 },
      { nesne: this.karinTakipNoktasi, yaricap: 0.13 },
      { nesne: this.pelvisTakipNoktasi, yaricap: 0.14 },
      { nesne: this.solKol.elNoktasi, yaricap: 0.085 },
      { nesne: this.sagKol.elNoktasi, yaricap: 0.085 },
      { nesne: this.solBacak.dizPivoti, yaricap: 0.095 },
      { nesne: this.sagBacak.dizPivoti, yaricap: 0.095 },
    ];

    for (let i = 0; i < hedefler.length; i++) {
      hedefler[i].nesne.getWorldPosition(this.altKureTamponu[i].merkez);
      this.altKureTamponu[i].yaricap = hedefler[i].yaricap;
    }

    return this.altKureTamponu;
  }
}
