import * as THREE from 'three';
import {
  enYakinKulvarMerkeziX,
  GALATASARAY_RENKLERI,
  HAVUZ_SABITLERI,
  kulvarMerkeziXGetir,
  type AktifBransModu,
  type AltKureVerisi,
  type CisimTipi,
  type KaynakTemizlenebilir,
  type ObjectBoundingData,
  type SimulasyonParametreleri,
  type SuDarbesiVerisi,
  type SuYuksekligiSorguFonksiyonu,
  type TramplenAkrobasiTipi,
  type TramplenSkorboardVerisi,
  type YuzmeDurumModu,
  type YuzmeKulvarSkorSatiri,
  type YuzmeSkorboardVerisi,
} from '../types/simulation';
import { ArsimetFizikMotoru } from '../physics/ArsimetFizikMotoru';
import { KureCismi } from './KureCismi';
import { KutuCismi } from './KutuCismi';
import type { SuCismiTaban } from './SuCismiTaban';
import { YuzucuManken } from './YuzucuManken';

type KulvarYuzucuFazi = 'hazirlik' | 'havada' | 'su_alti_kayma' | 'yuzme' | 'bitti';
type TramplenAtlayiciFazi =
  | 'tramplen_hazirlik'
  | 'tramplen_ucus'
  | 'tramplen_kugu'
  | 'tramplen_ok'
  | 'tramplen_su_alti'
  | 'tramplen_yuzey';

interface KulvarSporcuDurumu {
  manken: YuzucuManken;
  kulvarIndeksi: number;
  varsayilanAd: string;
  cikisGecikmesi: number;
  gecenFazSuresi: number;
  temelHizCarpani: number;
  dalgaFrekansi: number;
  dalgaFazi: number;
  bitisSuresi: number | null;
  faz: KulvarYuzucuFazi;
}

interface TramplenSporcuDurumu {
  manken: YuzucuManken;
  gecenFazSuresi: number;
  faz: TramplenAtlayiciFazi;
  secilenAkrobasiler: TramplenAkrobasiTipi[];
  aktifAkrobasi: TramplenAkrobasiTipi;
  sicramaGucu: number;
  girisKilitlendiMi: boolean;
  suyaGirisYakalamaZamani: number;
  toplamDonusRadyan: number;
  hedefTaklaRadyan: number;
  otomatikModMu: boolean;
  puanUretildiMi: boolean;
}

const SPORCU_CILT_TONLARI = [
  0xdca580,
  0xe3b28e,
  0xcf936e,
  0xe0aa84,
  0xd69b75,
  0xe6b996,
] as const;

const GS_KULVAR_ADLARI = [
  'E. Demir',
  'K. Kaya',
  'A. Yilmaz',
  'D. Arslan',
  'M. Ozkan',
  'B. Celik',
] as const;

const SIRA_PUANLARI = [100, 82, 68, 56, 46, 38] as const;

const AKROBASI_BILGILERI: Record<
  TramplenAkrobasiTipi,
  { ad: string; zorluk: number; hedefTakla: number }
> = {
  kugu: { ad: '201B Kugu Dalis', zorluk: 2.4, hedefTakla: Math.PI * 0.96 },
  kirik_pike: { ad: '403B Kirik Pike', zorluk: 3.0, hedefTakla: Math.PI * 2.94 },
  tam_salto: { ad: '5235D Cift Salto', zorluk: 3.5, hedefTakla: Math.PI * 4.94 },
};

const YARIS_BASLANGIC_Z = HAVUZ_SABITLERI.CIKIS_BLOK_Z;
const YARIS_BITIS_Z = HAVUZ_SABITLERI.MAK_Z - 1.05;
const YARIS_TOPLAM_MESAFE = YARIS_BITIS_Z - YARIS_BASLANGIC_Z;

/**
 * 6 Galatasaraylı kulvar yüzücüsü, 1 adet 10m tramplen atlayıcısı,
 * küre ve kutu cisimlerinin branş bazlı ayrı yaşam döngüsünü ve fizik adımlarını yönetir.
 */
export class CisimYoneticisi implements KaynakTemizlenebilir {
  private readonly sahne: THREE.Scene;
  private readonly fizikMotoru: ArsimetFizikMotoru;

  private readonly insanGrubu: THREE.Group;
  private readonly kulvarSporculari: KulvarSporcuDurumu[];
  private readonly tramplenSporcusu: TramplenSporcuDurumu;
  private readonly tumSporcular: YuzucuManken[];

  private readonly kureCismi: KureCismi;
  private readonly kutuCismi: KutuCismi;

  private aktifTip: CisimTipi = 'insan';
  private durumModu: YuzmeDurumModu = 'aktif_yuzme';
  private aktifBransModu: AktifBransModu = 'bekleme';

  private yarisSuresi = 0;
  private yarisBitisSirasiSayaci = 0;
  private oyuncuKulvariIndeksi: number | null = 3;
  private oyuncuKontroluAktifMi = false;
  private oyuncuCikisiYapildiMi = false;
  private oyuncuAnlikHizDestegi = 0;

  private atlayisSayaci = 0;
  private sonTramplenSonucu: TramplenSkorboardVerisi | null = null;
  private tramplenSonucTazeMi = false;

  private readonly geciciKutu = new THREE.Box3();
  private readonly geciciSporcuKutusu = new THREE.Box3();
  private readonly geciciHedefKonum = new THREE.Vector3();
  private readonly geciciHedefYonelim = new THREE.Quaternion();
  private readonly geciciRotasyonMatrisi = new THREE.Matrix4();
  private readonly geciciEksenX = new THREE.Vector3();
  private readonly geciciEksenY = new THREE.Vector3();
  private readonly geciciEksenZ = new THREE.Vector3();
  private readonly geciciEkAciYonelim = new THREE.Quaternion();
  private readonly dunyaSagX = new THREE.Vector3(1, 0, 0);

  private readonly sinirVerisiOnbellegi: ObjectBoundingData;

  constructor(sahne: THREE.Scene) {
    this.sahne = sahne;
    this.fizikMotoru = new ArsimetFizikMotoru();

    this.insanGrubu = new THREE.Group();
    this.insanGrubu.name = 'galatasarayYuzmeTakimi';

    // 1. 6 Kulvar Yüzücüsü (Galatasaray Sarı-Kırmızı forma varyasyonlarıyla)
    this.kulvarSporculari = [];
    for (let k = 0; k < HAVUZ_SABITLERI.KULVAR_SAYISI; k++) {
      const ciftKulvarMi = k % 2 === 0;
      const manken = new YuzucuManken(910, {
        ciltRengi: SPORCU_CILT_TONLARI[k],
        boneRengi: ciftKulvarMi
          ? GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA
          : GALATASARAY_RENKLERI.HEX_SARI_ANA,
        boneSeritRengi: ciftKulvarMi
          ? GALATASARAY_RENKLERI.HEX_SARI_ANA
          : GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
        sortAnaRengi: GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
        sortIkinciRenk: GALATASARAY_RENKLERI.HEX_SARI_ANA,
        gozlukCamRengi: GALATASARAY_RENKLERI.HEX_SARI_ALTIN,
        tempoCarpani: 1.0,
      });

      manken.atanmisKulvarX = kulvarMerkeziXGetir(k);
      manken.maksPozitifZ = null;

      this.insanGrubu.add(manken.kokGrup);
      this.kulvarSporculari.push({
        manken,
        kulvarIndeksi: k,
        varsayilanAd: GS_KULVAR_ADLARI[k],
        cikisGecikmesi: 0.55,
        gecenFazSuresi: 0,
        temelHizCarpani: 1.0,
        dalgaFrekansi: 1.5,
        dalgaFazi: k * 0.9,
        bitisSuresi: null,
        faz: 'hazirlik',
      });
    }

    // 2. 10m Tramplen Atlayıcısı
    const tramplenManken = new YuzucuManken(910, {
      ciltRengi: 0xdca580,
      boneRengi: GALATASARAY_RENKLERI.HEX_KIRMIZI_VURGU,
      boneSeritRengi: GALATASARAY_RENKLERI.HEX_SARI_ALTIN,
      sortAnaRengi: GALATASARAY_RENKLERI.HEX_SARI_ANA,
      sortIkinciRenk: GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      gozlukCamRengi: GALATASARAY_RENKLERI.HEX_SARI_ALTIN,
      tempoCarpani: 1.0,
    });
    tramplenManken.atanmisKulvarX = kulvarMerkeziXGetir(
      HAVUZ_SABITLERI.TRAMPLEN_KULVAR_INDEKSI,
    );
    tramplenManken.maksPozitifZ = null;
    this.insanGrubu.add(tramplenManken.kokGrup);

    this.tramplenSporcusu = {
      manken: tramplenManken,
      gecenFazSuresi: 0,
      faz: 'tramplen_hazirlik',
      secilenAkrobasiler: ['kugu'],
      aktifAkrobasi: 'kugu',
      sicramaGucu: 0.75,
      girisKilitlendiMi: false,
      suyaGirisYakalamaZamani: 0,
      toplamDonusRadyan: 0,
      hedefTaklaRadyan: Math.PI * 0.96,
      otomatikModMu: true,
      puanUretildiMi: false,
    };

    this.tumSporcular = [
      ...this.kulvarSporculari.map((s) => s.manken),
      this.tramplenSporcusu.manken,
    ];

    // 3. Küre ve Kutu cisimleri
    this.kureCismi = new KureCismi();
    this.kureCismi.konumuSifirla(
      new THREE.Vector3(kulvarMerkeziXGetir(3), 0.15, 0),
    );

    this.kutuCismi = new KutuCismi();
    this.kutuCismi.konumuSifirla(
      new THREE.Vector3(kulvarMerkeziXGetir(3), 0.15, 0),
    );

    // Başlangıçta yüzme ve tramplen aynı anda otomatik başlamaz; kullanıcı seçimine kadar bekler
    this.beklemeModunaGec();
    this.sahne.add(this.insanGrubu);

    const bosAltKureler: AltKureVerisi[] = Array.from(
      { length: HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE },
      () => ({
        merkez: new THREE.Vector3(),
        yaricap: 0,
      }),
    );

    this.sinirVerisiOnbellegi = {
      aktifTip: this.aktifTip,
      merkez: new THREE.Vector3(),
      sinirlayiciYaricap: 0.88,
      altKutuMin: new THREE.Vector3(),
      altKutuMak: new THREE.Vector3(),
      altKureler: bosAltKureler,
      aktifAltKureSayisi: 0,
      suKesitDarbeleri: [],
      yogunluk: 910,
      batanHacimOrani: 0,
    };

    this.sinirVerisiGuncelle([]);
  }

  private tramplenDikDurusYonelimiOlustur(oneEgilmeRadyan = 0): THREE.Quaternion {
    this.geciciEksenX.set(-1, 0, 0);
    this.geciciEksenY.set(0, 0, 1);
    this.geciciEksenZ.set(0, 1, 0);
    this.geciciRotasyonMatrisi.makeBasis(
      this.geciciEksenX,
      this.geciciEksenY,
      this.geciciEksenZ,
    );
    const sonuc = new THREE.Quaternion().setFromRotationMatrix(
      this.geciciRotasyonMatrisi,
    );

    if (Math.abs(oneEgilmeRadyan) > 1e-5) {
      this.geciciEkAciYonelim.setFromAxisAngle(this.dunyaSagX, -oneEgilmeRadyan);
      sonuc.premultiply(this.geciciEkAciYonelim).normalize();
    }

    return sonuc;
  }

  private kulvarSporcusunuBlokaKoy(durum: KulvarSporcuDurumu): void {
    const kulvarX = kulvarMerkeziXGetir(durum.kulvarIndeksi);
    this.geciciHedefKonum.set(
      kulvarX,
      HAVUZ_SABITLERI.CIKIS_BLOK_UST_Y + 0.36,
      HAVUZ_SABITLERI.CIKIS_BLOK_Z,
    );
    durum.manken.konumuSifirla(this.geciciHedefKonum);
    durum.manken.yonelim.setFromEuler(new THREE.Euler(0.32, 0, 0));
    durum.manken.fizikKilitliMi = true;
    durum.manken.aktifAnimasyonFazi = 'cikis_hazirlik';
    durum.manken.atanmisKulvarX = kulvarX;
    durum.manken.maksPozitifZ = null;
    durum.manken.hizCarpani = 1.0;
    durum.manken.tempoCarpaniAyarla(1.0);
    durum.manken.donusumuSenkronizeEt();

    durum.gecenFazSuresi = 0;
    durum.bitisSuresi = null;
    durum.faz = 'hazirlik';
  }

  private tramplenSporcusunuKuleyeKoy(): void {
    const tramplenX = kulvarMerkeziXGetir(HAVUZ_SABITLERI.TRAMPLEN_KULVAR_INDEKSI);
    this.geciciHedefKonum.set(
      tramplenX,
      HAVUZ_SABITLERI.TRAMPLEN_YUKSEKLIK_Y + 0.86,
      HAVUZ_SABITLERI.TRAMPLEN_UC_Z + 0.15,
    );
    const manken = this.tramplenSporcusu.manken;
    manken.konumuSifirla(this.geciciHedefKonum);
    manken.yonelim.copy(this.tramplenDikDurusYonelimiOlustur(0));
    manken.fizikKilitliMi = true;
    manken.aktifAnimasyonFazi = 'otomatik';
    manken.atanmisKulvarX = tramplenX;
    manken.maksPozitifZ = null;
    manken.hizCarpani = 1.0;
    manken.donusumuSenkronizeEt();

    this.tramplenSporcusu.gecenFazSuresi = 0;
    this.tramplenSporcusu.faz = 'tramplen_hazirlik';
    this.tramplenSporcusu.secilenAkrobasiler = ['kugu'];
    this.tramplenSporcusu.aktifAkrobasi = 'kugu';
    this.tramplenSporcusu.girisKilitlendiMi = false;
    this.tramplenSporcusu.suyaGirisYakalamaZamani = 0;
    this.tramplenSporcusu.toplamDonusRadyan = 0;
    this.tramplenSporcusu.hedefTaklaRadyan = AKROBASI_BILGILERI.kugu.hedefTakla;
    this.tramplenSporcusu.puanUretildiMi = false;
  }

  /**
   * Sahneyi açılış veya mod değişimi için sakin bekleme durumuna alır.
   * Yüzücüler çıkış bloklarında hareketsiz bekler, 10m tramplen sporcusu gizlenir.
   */
  public beklemeModunaGec(): void {
    this.aktifBransModu = 'bekleme';
    this.yarisSuresi = 0;
    this.yarisBitisSirasiSayaci = 0;
    this.oyuncuKontroluAktifMi = false;

    for (const sporcu of this.kulvarSporculari) {
      sporcu.manken.kokGrup.visible = true;
      this.kulvarSporcusunuBlokaKoy(sporcu);
    }
    this.tramplenSporcusunuKuleyeKoy();
    this.tramplenSporcusu.manken.kokGrup.visible = false;
    this.sinirVerisiGuncelle([]);
  }

  /**
   * 6 kulvar yüzücüsünü izole yarış modunda başlatır (tramplen atlayıcısı gizlenir).
   * Her yarış başında her kulvara taze rastgele reaksiyon ve hız profili atanır.
   */
  public yuzmeYarisiniBaslat(oyuncuKulvari: number | null = null, otomatikBaslat = true): void {
    this.insanTipiniZorla();
    this.aktifBransModu = 'yuzme_yarisi';
    this.durumModu = 'aktif_yuzme';
    this.yarisSuresi = 0;
    this.yarisBitisSirasiSayaci = 0;
    this.tramplenSporcusu.manken.kokGrup.visible = false;
    this.tramplenSporcusunuKuleyeKoy();

    this.oyuncuKulvariIndeksi =
      oyuncuKulvari !== null
        ? THREE.MathUtils.clamp(oyuncuKulvari, 0, HAVUZ_SABITLERI.KULVAR_SAYISI - 1)
        : null;
    this.oyuncuKontroluAktifMi = !otomatikBaslat && this.oyuncuKulvariIndeksi !== null;
    this.oyuncuCikisiYapildiMi = false;
    this.oyuncuAnlikHizDestegi = 0.72;

    for (const sporcu of this.kulvarSporculari) {
      sporcu.manken.kokGrup.visible = true;
      this.kulvarSporcusunuBlokaKoy(sporcu);

      const oyuncuMu =
        this.oyuncuKontroluAktifMi && sporcu.kulvarIndeksi === this.oyuncuKulvariIndeksi;

      sporcu.cikisGecikmesi = oyuncuMu ? 999 : 0.36 + Math.random() * 0.42;
      sporcu.temelHizCarpani = oyuncuMu ? 0.78 : 0.86 + Math.random() * 0.34;
      sporcu.dalgaFrekansi = 1.1 + Math.random() * 1.4;
      sporcu.dalgaFazi = Math.random() * Math.PI * 2;
      sporcu.manken.hizCarpani = sporcu.temelHizCarpani;
      sporcu.manken.tempoCarpaniAyarla(sporcu.temelHizCarpani);
    }

    this.sinirVerisiGuncelle([]);
  }

  /**
   * Oyun modunda oyuncunun kulvar çıkış bloğundan suya fırlamasını tetikler.
   */
  public oyuncuCikisTetikle(): { basariliMi: boolean; reaksiyonMs: number } {
    if (
      this.aktifBransModu !== 'yuzme_yarisi' ||
      !this.oyuncuKontroluAktifMi ||
      this.oyuncuKulvariIndeksi === null ||
      this.oyuncuCikisiYapildiMi
    ) {
      return { basariliMi: false, reaksiyonMs: 0 };
    }

    const oyuncu = this.kulvarSporculari[this.oyuncuKulvariIndeksi];
    if (!oyuncu || oyuncu.faz !== 'hazirlik') {
      return { basariliMi: false, reaksiyonMs: 0 };
    }

    this.oyuncuCikisiYapildiMi = true;
    const reaksiyonFarki = Math.abs(this.yarisSuresi - 0.35);
    const cikisKalitesi = THREE.MathUtils.clamp(1.0 - reaksiyonFarki * 0.7, 0.72, 1.18);

    oyuncu.manken.fizikKilitliMi = false;
    oyuncu.manken.hiz.set(0, 2.05 * cikisKalitesi, 4.95 * cikisKalitesi);
    oyuncu.manken.yonelim.setFromEuler(new THREE.Euler(0.24, 0, 0));
    oyuncu.manken.aktifAnimasyonFazi = 'havada_atlayis';
    oyuncu.faz = 'havada';
    oyuncu.gecenFazSuresi = 0;
    this.oyuncuAnlikHizDestegi = 0.96 * cikisKalitesi;

    return {
      basariliMi: true,
      reaksiyonMs: Math.round(this.yarisSuresi * 1000),
    };
  }

  /**
   * Yüzme yarışı oyununda ritim çubuğuna göre oyuncunun kulaç itişini güçlendirir.
   */
  public oyuncuKulacVur(kalite: number): void {
    if (
      this.aktifBransModu !== 'yuzme_yarisi' ||
      !this.oyuncuKontroluAktifMi ||
      this.oyuncuKulvariIndeksi === null
    ) {
      return;
    }

    const temizKalite = THREE.MathUtils.clamp(kalite, 0.15, 1.0);
    this.oyuncuAnlikHizDestegi = THREE.MathUtils.clamp(
      this.oyuncuAnlikHizDestegi * 0.45 + (0.62 + temizKalite * 0.82),
      0.55,
      1.48,
    );
  }

  /**
   * 10m tramplen modunu hazırlar (6 kulvar yüzücüsü gizlenir, tramplen sporcusu kulede bekler).
   */
  public tramplenAtlayisiniHazirla(otomatikBaslat = false): void {
    this.insanTipiniZorla();
    this.aktifBransModu = 'tramplen_atlayisi';
    this.durumModu = 'aktif_yuzme';

    for (const sporcu of this.kulvarSporculari) {
      sporcu.manken.kokGrup.visible = false;
      this.kulvarSporcusunuBlokaKoy(sporcu);
    }

    this.tramplenSporcusunuKuleyeKoy();
    this.tramplenSporcusu.manken.kokGrup.visible = true;
    this.tramplenSporcusu.otomatikModMu = otomatikBaslat;

    if (otomatikBaslat) {
      const akrobasiSecenekleri: TramplenAkrobasiTipi[] = ['kugu', 'kirik_pike', 'tam_salto'];
      const secilen =
        akrobasiSecenekleri[Math.floor(Math.random() * akrobasiSecenekleri.length)];
      this.tramplenSporcusu.secilenAkrobasiler = [secilen];
      this.tramplenSporcusu.aktifAkrobasi = secilen;
      this.tramplenSporcusu.hedefTaklaRadyan = AKROBASI_BILGILERI[secilen].hedefTakla;
      this.tramplenSporcusu.sicramaGucu = 0.55 + Math.random() * 0.42;
      this.tramplenSporcusu.girisKilitlendiMi = Math.random() > 0.25;
    }

    this.sinirVerisiGuncelle([]);
  }

  /**
   * Oyun veya sağ panel tarafından 10m tramplen sıçramasını başlatır.
   */
  public tramplenSicramaBaslat(gucOrani: number, akrobasi: TramplenAkrobasiTipi = 'kugu'): boolean {
    if (
      this.aktifBransModu !== 'tramplen_atlayisi' ||
      this.tramplenSporcusu.faz !== 'tramplen_hazirlik'
    ) {
      return false;
    }

    const temizGuc = THREE.MathUtils.clamp(gucOrani, 0.2, 1.0);
    const durum = this.tramplenSporcusu;
    const manken = durum.manken;

    durum.otomatikModMu = false;
    durum.sicramaGucu = temizGuc;
    durum.aktifAkrobasi = akrobasi;
    durum.secilenAkrobasiler = [akrobasi];
    durum.hedefTaklaRadyan = AKROBASI_BILGILERI[akrobasi].hedefTakla;
    durum.girisKilitlendiMi = false;
    durum.toplamDonusRadyan = 0;
    durum.puanUretildiMi = false;

    manken.konum.y = HAVUZ_SABITLERI.TRAMPLEN_YUKSEKLIK_Y + 0.86;
    manken.fizikKilitliMi = false;
    manken.hiz.set(0, 2.3 + temizGuc * 1.65, -1.65 - temizGuc * 0.45);
    manken.aktifAnimasyonFazi =
      akrobasi === 'kirik_pike'
        ? 'kirik_pike'
        : akrobasi === 'tam_salto'
          ? 'tam_salto'
          : 'kugu_dalis';
    durum.faz = 'tramplen_ucus';
    durum.gecenFazSuresi = 0;

    return true;
  }

  /**
   * 10m atlayıcı havadayken akrobasi figürünü değiştirir ve zorluk puanını yükseltir.
   */
  public tramplenAkrobasiSec(akrobasi: TramplenAkrobasiTipi): boolean {
    const durum = this.tramplenSporcusu;
    if (
      this.aktifBransModu !== 'tramplen_atlayisi' ||
      (durum.faz !== 'tramplen_ucus' && durum.faz !== 'tramplen_kugu')
    ) {
      return false;
    }

    durum.aktifAkrobasi = akrobasi;
    if (!durum.secilenAkrobasiler.includes(akrobasi)) {
      durum.secilenAkrobasiler.push(akrobasi);
    }
    durum.hedefTaklaRadyan = Math.max(
      durum.hedefTaklaRadyan,
      AKROBASI_BILGILERI[akrobasi].hedefTakla,
    );

    durum.manken.aktifAnimasyonFazi =
      akrobasi === 'kirik_pike'
        ? 'kirik_pike'
        : akrobasi === 'tam_salto'
          ? 'tam_salto'
          : 'kugu_dalis';
    return true;
  }

  /**
   * Suya yaklaşırken sporcuyu dikey ok (streamline) pozuna kilitler ve yüksek giriş puanı kazandırır.
   */
  public tramplenGirisKilitle(): boolean {
    const durum = this.tramplenSporcusu;
    if (
      this.aktifBransModu !== 'tramplen_atlayisi' ||
      (durum.faz !== 'tramplen_ucus' &&
        durum.faz !== 'tramplen_kugu' &&
        durum.faz !== 'tramplen_ok')
    ) {
      return false;
    }

    durum.girisKilitlendiMi = true;
    durum.suyaGirisYakalamaZamani = durum.manken.konum.y;
    durum.manken.aktifAnimasyonFazi = 'havada_atlayis';
    durum.faz = 'tramplen_ok';
    return true;
  }

  /**
   * Serbest fizik sandbox moduna geçer (su fiziği deneyleri için).
   */
  public serbestHavuzModunaGec(): void {
    this.aktifBransModu = 'serbest_havuz';
    this.oyuncuKontroluAktifMi = false;
    this.tramplenSporcusu.manken.kokGrup.visible = false;

    for (const sporcu of this.kulvarSporculari) {
      sporcu.manken.kokGrup.visible = true;
      sporcu.manken.fizikKilitliMi = false;
      sporcu.manken.aktifAnimasyonFazi = 'otomatik';
      sporcu.manken.hizCarpani = 0.85;
      sporcu.faz = 'yuzme';
      this.geciciHedefKonum.set(
        kulvarMerkeziXGetir(sporcu.kulvarIndeksi),
        0.05,
        -6.0 + sporcu.kulvarIndeksi * 2.4,
      );
      sporcu.manken.konumuSifirla(this.geciciHedefKonum);
    }

    this.sinirVerisiGuncelle([]);
  }

  public aktifBransGetir(): AktifBransModu {
    return this.aktifBransModu;
  }

  public tramplenFaziGetir(): TramplenAtlayiciFazi {
    return this.tramplenSporcusu.faz;
  }

  public tramplenMankenYGetir(): number {
    return this.tramplenSporcusu.manken.konum.y;
  }

  /**
   * Yeni bir tramplen atlayışı suya girdiğinde üretilen 5 hakemlik taze sonucu bir kez döndürür.
   */
  public yeniTramplenSonucunuAl(): TramplenSkorboardVerisi | null {
    if (!this.tramplenSonucTazeMi || !this.sonTramplenSonucu) {
      return null;
    }
    this.tramplenSonucTazeMi = false;
    return this.sonTramplenSonucu;
  }

  /**
   * Anlık yüzme yarışı sıralamasını, derece sürelerini ve puanlarını döndürür.
   */
  public yuzmeSkorboardVerisiUret(): YuzmeSkorboardVerisi {
    const hamSatirlar = this.kulvarSporculari.map((s) => {
      const mesafeOrani = THREE.MathUtils.clamp(
        (s.manken.konum.z - YARIS_BASLANGIC_Z) / YARIS_TOPLAM_MESAFE,
        0,
        1,
      );
      const oyuncuMu =
        this.oyuncuKontroluAktifMi && s.kulvarIndeksi === this.oyuncuKulvariIndeksi;
      const ad = oyuncuMu ? `SEN (K${s.kulvarIndeksi + 1})` : s.varsayilanAd;

      return {
        kulvarNo: s.kulvarIndeksi + 1,
        sporcuAdi: ad,
        oyuncuMu,
        dereceSaniye: s.bitisSuresi,
        anlikMesafeOrani: s.bitisSuresi !== null ? 1 : mesafeOrani,
        sira: 0,
        puan: 0,
        bitirdiMi: s.bitisSuresi !== null,
      };
    });

    hamSatirlar.sort((a, b) => {
      if (a.bitirdiMi && b.bitirdiMi) {
        return (a.dereceSaniye ?? 999) - (b.dereceSaniye ?? 999);
      }
      if (a.bitirdiMi) return -1;
      if (b.bitirdiMi) return 1;
      return b.anlikMesafeOrani - a.anlikMesafeOrani;
    });

    const satirlar: YuzmeKulvarSkorSatiri[] = hamSatirlar.map((satir, idx) => {
      const siraPuani = SIRA_PUANLARI[idx] ?? 30;
      const sureBonusu =
        satir.dereceSaniye !== null
          ? Math.round(Math.max(0, 26 - satir.dereceSaniye) * 2.5)
          : Math.round(satir.anlikMesafeOrani * 18);

      return {
        ...satir,
        sira: idx + 1,
        puan: siraPuani + sureBonusu,
      };
    });

    const bitirenSayisi = satirlar.filter((s) => s.bitirdiMi).length;
    const tumuBittiMi = bitirenSayisi === HAVUZ_SABITLERI.KULVAR_SAYISI;

    return {
      baslik: 'GALATASARAY OLIMPIK YUZME',
      altBaslik: '32m SERBEST STIL FINAL',
      kronometreSaniye: this.yarisSuresi,
      durumMetni: tumuBittiMi
        ? 'YARIS TAMAMLANDI'
        : this.oyuncuKontroluAktifMi && !this.oyuncuCikisiYapildiMi
          ? 'CIKIS ICIN SPACE / BUTON'
          : `CANLI YARIS (${bitirenSayisi}/6 BITIS)`,
      satirlar,
    };
  }

  /**
   * Aktif cismi değiştirir; eski nesneyi dispose etmeden sahneden kaldırıp yeni nesne grubunu döndürür.
   */
  public cisimTipiAyarla(tip: CisimTipi): THREE.Object3D {
    if (this.aktifTip === tip) {
      return this.aktifNesneGetir();
    }

    const oncekiNesne = this.aktifNesneGetir();
    this.sahne.remove(oncekiNesne);

    if (this.aktifTip !== 'insan') {
      const eskiCisim = this.aktifTip === 'kure' ? this.kureCismi : this.kutuCismi;
      eskiCisim.tutuluyorMu = false;
      this.geciciHedefKonum.set(
        enYakinKulvarMerkeziX(eskiCisim.konum.x),
        Math.max(eskiCisim.konum.y, -0.1),
        THREE.MathUtils.clamp(
          eskiCisim.konum.z,
          HAVUZ_SABITLERI.MIN_Z + 0.9,
          HAVUZ_SABITLERI.MAK_Z - 0.9,
        ),
      );
    } else {
      this.geciciHedefKonum.set(kulvarMerkeziXGetir(3), 0.12, 0);
    }

    this.aktifTip = tip;

    if (tip === 'kure') {
      this.kureCismi.konumuSifirla(this.geciciHedefKonum);
    } else if (tip === 'kutu') {
      this.kutuCismi.konumuSifirla(this.geciciHedefKonum);
    } else {
      for (const sporcu of this.tumSporcular) {
        sporcu.tutuluyorMu = false;
      }
    }

    const yeniNesne = this.aktifNesneGetir();
    this.sahne.add(yeniNesne);
    this.sinirVerisiGuncelle([]);
    return yeniNesne;
  }

  private insanTipiniZorla(): void {
    if (this.aktifTip !== 'insan') {
      this.cisimTipiAyarla('insan');
    }
  }

  /**
   * Kullanıcı arayüzünden gelen yoğunluk ve davranış modunu aktif cisim veya tüm takıma uygular.
   */
  public parametreleriUygula(parametreler: SimulasyonParametreleri): void {
    this.durumModu = parametreler.durumModu;

    if (this.aktifTip === 'insan') {
      for (const sporcu of this.tumSporcular) {
        sporcu.yogunluk = parametreler.cisimYogunlugu;
      }
    } else if (this.aktifTip === 'kure') {
      this.kureCismi.yogunluk = parametreler.cisimYogunlugu;
    } else {
      this.kutuCismi.yogunluk = parametreler.cisimYogunlugu;
    }

    this.sinirVerisiOnbellegi.yogunluk = parametreler.cisimYogunlugu;
  }

  /**
   * Aktif görünür cismi veya aktif branştaki sporcuları su üstünden serbest bırakır.
   */
  public yukaridanBirak(): void {
    if (this.aktifTip === 'insan') {
      if (this.aktifBransModu === 'tramplen_atlayisi') {
        const tramplenX = kulvarMerkeziXGetir(HAVUZ_SABITLERI.TRAMPLEN_KULVAR_INDEKSI);
        this.geciciHedefKonum.set(tramplenX, 10.85, HAVUZ_SABITLERI.TRAMPLEN_UC_Z - 0.35);
        this.tramplenSporcusu.manken.konumuSifirla(this.geciciHedefKonum);
        this.tramplenSporcusu.manken.yonelim.copy(
          this.tramplenDikDurusYonelimiOlustur(Math.PI * 0.94),
        );
        this.tramplenSporcusu.manken.hiz.set(0, -0.5, -1.25);
        this.tramplenSporcusu.manken.fizikKilitliMi = false;
        this.tramplenSporcusu.manken.aktifAnimasyonFazi = 'havada_atlayis';
        this.tramplenSporcusu.manken.donusumuSenkronizeEt();
        this.tramplenSporcusu.faz = 'tramplen_ok';
        this.tramplenSporcusu.gecenFazSuresi = 0;
        this.tramplenSporcusu.puanUretildiMi = false;
      } else {
        for (const sporcu of this.kulvarSporculari) {
          if (!sporcu.manken.kokGrup.visible) continue;
          const kulvarX = kulvarMerkeziXGetir(sporcu.kulvarIndeksi);
          const guvenliZ = THREE.MathUtils.clamp(
            sporcu.manken.konum.z,
            HAVUZ_SABITLERI.MIN_Z + 1.2,
            HAVUZ_SABITLERI.MAK_Z - 1.2,
          );
          this.geciciHedefKonum.set(kulvarX, 1.45, guvenliZ);
          sporcu.manken.konumuSifirla(this.geciciHedefKonum);
          sporcu.manken.fizikKilitliMi = false;
          sporcu.manken.aktifAnimasyonFazi = 'otomatik';
          sporcu.faz = 'yuzme';
          sporcu.gecenFazSuresi = 0;
        }
      }
    } else {
      const hedefCisim = this.aktifCisimGetir();
      const kulvarX = enYakinKulvarMerkeziX(hedefCisim.konum.x);
      const guvenliZ = THREE.MathUtils.clamp(
        hedefCisim.konum.z,
        HAVUZ_SABITLERI.MIN_Z + 0.9,
        HAVUZ_SABITLERI.MAK_Z - 0.9,
      );
      this.geciciHedefKonum.set(kulvarX, 1.45, guvenliZ);
      hedefCisim.konumuSifirla(this.geciciHedefKonum);
    }

    this.sinirVerisiGuncelle([]);
  }

  /**
   * Raycaster ile sahnedeki görünür aktif sporculardan veya cisimden kameraya en yakın olanı döndürür.
   */
  public kesisenCismiBul(raycaster: THREE.Raycaster): SuCismiTaban | null {
    if (this.aktifTip !== 'insan') {
      const tekCisim = this.aktifCisimGetir();
      const kesisimler = raycaster.intersectObject(tekCisim.kokGrup, true);
      return kesisimler.length > 0 ? tekCisim : null;
    }

    let enYakinSporcu: SuCismiTaban | null = null;
    let enKisaMesafe = Number.POSITIVE_INFINITY;

    for (const sporcu of this.tumSporcular) {
      if (!sporcu.kokGrup.visible) continue;
      const kesisimler = raycaster.intersectObject(sporcu.kokGrup, true);
      if (kesisimler.length > 0 && kesisimler[0].distance < enKisaMesafe) {
        enKisaMesafe = kesisimler[0].distance;
        enYakinSporcu = sporcu;
      }
    }

    return enYakinSporcu;
  }

  /**
   * Tüm görünür aktif cisimlerin fizik ve animasyonlarını günceller, önceliklendirilmiş su darbelerini döndürür.
   */
  public guncelle(
    dt: number,
    gecenSure: number,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
  ): SuDarbesiVerisi[] {
    const tumDarbeler: SuDarbesiVerisi[] = [];

    if (this.aktifTip === 'insan') {
      const sinirliDt = Math.min(Math.max(dt, 0), 0.033);

      if (this.aktifBransModu === 'yuzme_yarisi') {
        this.yarisSuresi += sinirliDt;
        for (const sporcu of this.kulvarSporculari) {
          this.kulvarSporcuDurumunuGuncelle(sporcu, sinirliDt, gecenSure);
        }
      } else if (this.aktifBransModu === 'tramplen_atlayisi') {
        this.tramplenSporcuDurumunuGuncelle(sinirliDt);
      }

      for (const sporcu of this.tumSporcular) {
        if (!sporcu.kokGrup.visible) continue;

        const fizikDarbeleri = this.fizikMotoru.adimla(
          sporcu,
          dt,
          suYuksekligiSorgula,
          this.durumModu,
        );
        sporcu.donusumuSenkronizeEt();

        const animasyonDarbeleri = sporcu.animasyonuGuncelle(
          dt,
          gecenSure,
          this.durumModu,
          sporcu.batanHacimOrani,
          suYuksekligiSorgula,
        );

        for (const darbe of fizikDarbeleri) {
          tumDarbeler.push(darbe);
        }
        for (const darbe of animasyonDarbeleri) {
          tumDarbeler.push(darbe);
        }
      }
    } else {
      const hedefCisim = this.aktifCisimGetir();
      const fizikDarbeleri = this.fizikMotoru.adimla(
        hedefCisim,
        dt,
        suYuksekligiSorgula,
        this.durumModu,
      );
      hedefCisim.donusumuSenkronizeEt();

      const animasyonDarbeleri = hedefCisim.animasyonuGuncelle(
        dt,
        gecenSure,
        this.durumModu,
        hedefCisim.batanHacimOrani,
        suYuksekligiSorgula,
      );

      for (const darbe of fizikDarbeleri) {
        tumDarbeler.push(darbe);
      }
      for (const darbe of animasyonDarbeleri) {
        tumDarbeler.push(darbe);
      }
    }

    if (tumDarbeler.length > HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI) {
      tumDarbeler.sort((a, b) => Math.abs(b.kuvvet) - Math.abs(a.kuvvet));
      tumDarbeler.length = HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI;
    }

    this.sinirVerisiGuncelle(tumDarbeler);
    return tumDarbeler;
  }

  private kulvarSporcuDurumunuGuncelle(
    durum: KulvarSporcuDurumu,
    dt: number,
    gecenSure: number,
  ): void {
    const manken = durum.manken;

    if (manken.tutuluyorMu) {
      manken.fizikKilitliMi = false;
      manken.aktifAnimasyonFazi = 'otomatik';
      durum.faz = 'yuzme';
      return;
    }

    durum.gecenFazSuresi += dt;

    if (durum.faz === 'hazirlik') {
      const oyuncuMu =
        this.oyuncuKontroluAktifMi && durum.kulvarIndeksi === this.oyuncuKulvariIndeksi;

      if (oyuncuMu) {
        // Oyuncu 1.65 sn içinde Space/butona basmazsa yarış akışı adına gecikmeli otomatik çıkış alır
        if (!this.oyuncuCikisiYapildiMi && this.yarisSuresi >= 1.65) {
          this.oyuncuCikisTetikle();
        }
        return;
      }

      if (this.durumModu !== 'aktif_yuzme') {
        manken.fizikKilitliMi = false;
        manken.hiz.set(0, 1.4, 4.0);
        manken.aktifAnimasyonFazi = 'otomatik';
        durum.faz = 'yuzme';
        durum.gecenFazSuresi = 0;
        return;
      }

      if (this.yarisSuresi >= durum.cikisGecikmesi) {
        manken.fizikKilitliMi = false;
        manken.hiz.set(0, 2.05, 4.85);
        manken.yonelim.setFromEuler(new THREE.Euler(0.24, 0, 0));
        manken.aktifAnimasyonFazi = 'havada_atlayis';
        durum.faz = 'havada';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'havada') {
      const ucusHedefPitch = THREE.MathUtils.clamp(
        0.38 - manken.hiz.y * 0.08,
        0.15,
        0.65,
      );
      this.geciciHedefYonelim.setFromEuler(new THREE.Euler(ucusHedefPitch, 0, 0));
      manken.yonelim.slerp(this.geciciHedefYonelim, 1 - Math.exp(-7.0 * dt));

      if (manken.konum.y < 0.08) {
        manken.aktifAnimasyonFazi = 'su_alti_kayma';
        durum.faz = 'su_alti_kayma';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'su_alti_kayma') {
      if (durum.gecenFazSuresi >= 1.45 || this.durumModu !== 'aktif_yuzme') {
        manken.aktifAnimasyonFazi = 'otomatik';
        durum.faz = 'yuzme';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'yuzme') {
      const oyuncuMu =
        this.oyuncuKontroluAktifMi && durum.kulvarIndeksi === this.oyuncuKulvariIndeksi;

      if (oyuncuMu) {
        // Kulaç basılmadığında yavaş sönümlenme (ritim tutmayı ödüllendirir)
        this.oyuncuAnlikHizDestegi = Math.max(0.56, this.oyuncuAnlikHizDestegi - dt * 0.24);
        manken.hizCarpani = this.oyuncuAnlikHizDestegi;
        manken.tempoCarpaniAyarla(this.oyuncuAnlikHizDestegi);
      } else {
        // Yapay zeka kulvarlarda doğal tempo dalgalanması (yarış içi öne geçişler)
        const dalga = Math.sin(gecenSure * durum.dalgaFrekansi + durum.dalgaFazi) * 0.11;
        const anlikHiz = THREE.MathUtils.clamp(durum.temelHizCarpani + dalga, 0.78, 1.38);
        manken.hizCarpani = anlikHiz;
        manken.tempoCarpaniAyarla(anlikHiz);
      }

      if (manken.konum.z >= YARIS_BITIS_Z && durum.bitisSuresi === null) {
        this.yarisBitisSirasiSayaci++;
        durum.bitisSuresi = Number(this.yarisSuresi.toFixed(2));
        durum.faz = 'bitti';
        manken.hizCarpani = 0;
        manken.hiz.multiplyScalar(0.18);
      }
    }
  }

  private tramplenSporcuDurumunuGuncelle(dt: number): void {
    const durum = this.tramplenSporcusu;
    const manken = durum.manken;

    if (manken.tutuluyorMu) {
      manken.fizikKilitliMi = false;
      manken.aktifAnimasyonFazi = 'otomatik';
      durum.faz = 'tramplen_yuzey';
      return;
    }

    durum.gecenFazSuresi += dt;

    if (durum.faz === 'tramplen_hazirlik') {
      // Kule ucunda hafif nefes ve tahta yaylanma ritmi
      const yaylanma = Math.sin(durum.gecenFazSuresi * Math.PI * 2.4) * 0.032;
      manken.konum.y = HAVUZ_SABITLERI.TRAMPLEN_YUKSEKLIK_Y + 0.86 + yaylanma;
      manken.donusumuSenkronizeEt();

      if (durum.otomatikModMu && this.durumModu === 'aktif_yuzme' && durum.gecenFazSuresi >= 1.1) {
        this.tramplenSicramaBaslat(durum.sicramaGucu, durum.aktifAkrobasi);
        durum.otomatikModMu = true;
      }
      return;
    }

    if (durum.faz === 'tramplen_ucus' || durum.faz === 'tramplen_kugu') {
      // Seçilen figüre göre kontrollü havada takla / dönüş
      const donusHizi =
        durum.aktifAkrobasi === 'tam_salto'
          ? 6.1
          : durum.aktifAkrobasi === 'kirik_pike'
            ? 4.05
            : 2.35;
      durum.toplamDonusRadyan = Math.min(
        durum.toplamDonusRadyan + donusHizi * dt,
        durum.hedefTaklaRadyan,
      );
      this.geciciHedefYonelim.copy(
        this.tramplenDikDurusYonelimiOlustur(durum.toplamDonusRadyan),
      );
      manken.yonelim.slerp(this.geciciHedefYonelim, 1 - Math.exp(-12.0 * dt));

      // Otomatik modda veya suya 3.4m kala ok pozuna hazırlan
      if (manken.konum.y < 3.4) {
        if (durum.otomatikModMu) {
          durum.girisKilitlendiMi = true;
        }
        manken.aktifAnimasyonFazi = 'havada_atlayis';
        durum.faz = 'tramplen_ok';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'tramplen_ok') {
      const hedefAci = durum.girisKilitlendiMi ? Math.PI * 0.96 : Math.PI * 0.78;
      this.geciciHedefYonelim.copy(this.tramplenDikDurusYonelimiOlustur(hedefAci));
      manken.yonelim.slerp(
        this.geciciHedefYonelim,
        1 - Math.exp(-(durum.girisKilitlendiMi ? 11.0 : 4.5) * dt),
      );

      if (manken.konum.y < 0.12) {
        if (!durum.puanUretildiMi) {
          this.tramplenPuanlariniUret();
          durum.puanUretildiMi = true;
        }
        manken.aktifAnimasyonFazi = 'su_alti_kayma';
        durum.faz = 'tramplen_su_alti';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'tramplen_su_alti') {
      if (durum.gecenFazSuresi >= 1.2) {
        manken.aktifAnimasyonFazi = 'otomatik';
        durum.faz = 'tramplen_yuzey';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'tramplen_yuzey') {
      if (durum.otomatikModMu && durum.gecenFazSuresi >= 3.2 && !manken.tutuluyorMu) {
        this.tramplenAtlayisiniHazirla(true);
      }
    }
  }

  private tramplenPuanlariniUret(): void {
    this.atlayisSayaci++;
    const durum = this.tramplenSporcusu;
    const bilgi = AKROBASI_BILGILERI[durum.aktifAkrobasi];

    // Zorluk derecesi: son figür + ekstra kombo çeşitlilik bonusu
    const komboEk = Math.max(0, durum.secilenAkrobasiler.length - 1) * 0.25;
    const zorlukDerecesi = Number((bilgi.zorluk + komboEk).toFixed(1));

    // Giriş + sıçrama gücü + akrobasi performansına dayalı baz puan [5.8 .. 9.1]
    const gucSkoru = 1 - Math.abs(durum.sicramaGucu - 0.85);
    const dikGirisBonusu = durum.girisKilitlendiMi ? 1.45 : 0.2;
    const temelPuan = THREE.MathUtils.clamp(
      5.6 + gucSkoru * 1.8 + dikGirisBonusu + (Math.random() - 0.5) * 1.5,
      4.5,
      9.3,
    );

    // 5 hakem için her atlayışta taze ve bağımsız rastgele 0.5 adımlı puan üretimi
    const hakemPuanlari: number[] = [];
    for (let i = 0; i < 5; i++) {
      const hakemSapmasi = (Math.random() - 0.5) * 2.2;
      const ham = THREE.MathUtils.clamp(temelPuan + hakemSapmasi, 4.0, 10.0);
      hakemPuanlari.push(Math.round(ham * 2) / 2);
    }

    // FINA usulü: en yüksek ve en düşük 1'er hakem puanı atılır, kalan 3 toplanıp zorlukla çarpılır
    const sirali = [...hakemPuanlari].sort((a, b) => a - b);
    const ortaToplam = sirali[1] + sirali[2] + sirali[3];
    const atlayisPuani = Number((ortaToplam * zorlukDerecesi).toFixed(2));
    const oncekiToplam = this.sonTramplenSonucu?.toplamPuan ?? 0;

    this.sonTramplenSonucu = {
      sporcuAdi: 'C. Yildiz (GS)',
      atlayisNo: this.atlayisSayaci,
      toplamAtlayis: 3,
      hareketAdi:
        durum.secilenAkrobasiler.length > 1 ? `${bilgi.ad} + Kombo` : bilgi.ad,
      zorlukDerecesi,
      hakemPuanlari,
      atlayisPuani,
      toplamPuan: Number((oncekiToplam + atlayisPuani).toFixed(2)),
      durumMetni: durum.girisKilitlendiMi
        ? 'MUKEMMEL DIKEY GIRIS • HAKEM PUANLARI ACIKLANDI'
        : 'SUYA GIRIS TAMAMLANDI • HAKEM PUANLARI ACIKLANDI',
    };
    this.tramplenSonucTazeMi = true;
  }

  public tramplenSayaciniSifirla(): void {
    this.atlayisSayaci = 0;
    this.sonTramplenSonucu = null;
    this.tramplenSonucTazeMi = false;
  }

  private sinirVerisiGuncelle(darbeler: SuDarbesiVerisi[]): void {
    if (this.aktifTip !== 'insan') {
      const tekCisim = this.aktifCisimGetir();
      tekCisim.donusumuSenkronizeEt();
      this.geciciKutu.setFromObject(tekCisim.kokGrup);

      this.sinirVerisiOnbellegi.aktifTip = tekCisim.tip;
      this.sinirVerisiOnbellegi.merkez.copy(tekCisim.konum);
      this.sinirVerisiOnbellegi.sinirlayiciYaricap = tekCisim.sinirlayiciYaricap;
      this.sinirVerisiOnbellegi.altKutuMin.copy(this.geciciKutu.min);
      this.sinirVerisiOnbellegi.altKutuMak.copy(this.geciciKutu.max);
      this.sinirVerisiOnbellegi.yogunluk = tekCisim.yogunluk;
      this.sinirVerisiOnbellegi.batanHacimOrani = tekCisim.batanHacimOrani;

      const kureler = tekCisim.altKureleriHesapla();
      const kureSayisi = Math.min(kureler.length, HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE);
      this.sinirVerisiOnbellegi.aktifAltKureSayisi = kureSayisi;

      for (let i = 0; i < kureSayisi; i++) {
        this.sinirVerisiOnbellegi.altKureler[i].merkez.copy(kureler[i].merkez);
        this.sinirVerisiOnbellegi.altKureler[i].yaricap = kureler[i].yaricap;
      }

      this.sinirVerisiOnbellegi.suKesitDarbeleri = darbeler;
      return;
    }

    // Sadece görünür ve su içi/yakını sporcuların alt küre ve kapsayıcı kutusunu topla
    this.geciciKutu.makeEmpty();
    let altKureIndeksi = 0;
    let suIciSayisi = 0;
    let toplamBatma = 0;
    let gorunurSayisi = 0;
    let referansSporcu = this.kulvarSporculari[3].manken;

    for (const sporcu of this.tumSporcular) {
      if (!sporcu.kokGrup.visible) continue;
      if (gorunurSayisi === 0) referansSporcu = sporcu;
      gorunurSayisi++;

      sporcu.donusumuSenkronizeEt();
      toplamBatma += sporcu.batanHacimOrani;

      if (sporcu.konum.y < 1.8) {
        this.geciciSporcuKutusu.setFromObject(sporcu.kokGrup);
        this.geciciKutu.union(this.geciciSporcuKutusu);
        suIciSayisi++;

        if (altKureIndeksi < HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE) {
          const sporcuKureleri = sporcu.altKureleriHesapla();
          const anaKure = sporcuKureleri[1] ?? sporcuKureleri[0];
          this.sinirVerisiOnbellegi.altKureler[altKureIndeksi].merkez.copy(anaKure.merkez);
          this.sinirVerisiOnbellegi.altKureler[altKureIndeksi].yaricap = 0.28;
          altKureIndeksi++;
        }
      }
    }

    if (altKureIndeksi < HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE) {
      for (const sporcu of this.tumSporcular) {
        if (!sporcu.kokGrup.visible || sporcu.konum.y >= 1.8) {
          continue;
        }
        const sporcuKureleri = sporcu.altKureleriHesapla();
        const ikincilKure = sporcuKureleri[3];
        if (ikincilKure && altKureIndeksi < HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE) {
          this.sinirVerisiOnbellegi.altKureler[altKureIndeksi].merkez.copy(ikincilKure.merkez);
          this.sinirVerisiOnbellegi.altKureler[altKureIndeksi].yaricap = 0.22;
          altKureIndeksi++;
        }
        if (altKureIndeksi >= HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE) {
          break;
        }
      }
    }

    if (suIciSayisi === 0) {
      this.geciciKutu.setFromObject(referansSporcu.kokGrup);
    }

    this.sinirVerisiOnbellegi.aktifTip = 'insan';
    this.sinirVerisiOnbellegi.merkez.copy(referansSporcu.konum);
    this.sinirVerisiOnbellegi.sinirlayiciYaricap = referansSporcu.sinirlayiciYaricap;
    this.sinirVerisiOnbellegi.altKutuMin.copy(this.geciciKutu.min);
    this.sinirVerisiOnbellegi.altKutuMak.copy(this.geciciKutu.max);
    this.sinirVerisiOnbellegi.aktifAltKureSayisi = altKureIndeksi;
    this.sinirVerisiOnbellegi.yogunluk = referansSporcu.yogunluk;
    this.sinirVerisiOnbellegi.batanHacimOrani =
      gorunurSayisi > 0 ? toplamBatma / gorunurSayisi : 0;
    this.sinirVerisiOnbellegi.suKesitDarbeleri = darbeler;
  }

  /**
   * Aktif cismin veya Galatasaray Yüzme Takımı grubunun Three.js kök nesnesini döndürür.
   */
  public aktifNesneGetir(): THREE.Object3D {
    if (this.aktifTip === 'insan') {
      return this.insanGrubu;
    }
    return this.aktifCisimGetir().kokGrup;
  }

  /**
   * Tekil cisimler veya varsayılan temsilî sporcu için SuCismiTaban örneğini döndürür.
   */
  public aktifCisimGetir(): SuCismiTaban {
    if (this.aktifTip === 'kure') {
      return this.kureCismi;
    }
    if (this.aktifTip === 'kutu') {
      return this.kutuCismi;
    }
    return this.aktifBransModu === 'tramplen_atlayisi'
      ? this.tramplenSporcusu.manken
      : this.kulvarSporculari[3].manken;
  }

  /**
   * GPGPU ve optik işleyiciler için güncellenmiş cisim sınır verisini döndürür.
   */
  public sinirVerisiGetir(): ObjectBoundingData {
    return this.sinirVerisiOnbellegi;
  }

  /**
   * Tüm sporcu ve cisimlerin sahne ve GPU/geometri kaynaklarını serbest bırakır.
   */
  public temizle(): void {
    this.sahne.remove(this.insanGrubu);
    for (const sporcu of this.tumSporcular) {
      sporcu.temizle();
    }
    this.insanGrubu.clear();

    this.sahne.remove(this.kureCismi.kokGrup);
    this.kureCismi.temizle();

    this.sahne.remove(this.kutuCismi.kokGrup);
    this.kutuCismi.temizle();
  }
}
