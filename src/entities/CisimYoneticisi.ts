import * as THREE from 'three';
import {
  enYakinKulvarMerkeziX,
  GALATASARAY_RENKLERI,
  HAVUZ_SABITLERI,
  kulvarMerkeziXGetir,
  type AltKureVerisi,
  type CisimTipi,
  type KaynakTemizlenebilir,
  type ObjectBoundingData,
  type SimulasyonParametreleri,
  type SuDarbesiVerisi,
  type SuYuksekligiSorguFonksiyonu,
  type YuzmeDurumModu,
} from '../types/simulation';
import { ArsimetFizikMotoru } from '../physics/ArsimetFizikMotoru';
import { KureCismi } from './KureCismi';
import { KutuCismi } from './KutuCismi';
import type { SuCismiTaban } from './SuCismiTaban';
import { YuzucuManken } from './YuzucuManken';

type KulvarYuzucuFazi = 'hazirlik' | 'havada' | 'su_alti_kayma' | 'yuzme';
type TramplenAtlayiciFazi =
  | 'tramplen_hazirlik'
  | 'tramplen_kugu'
  | 'tramplen_ok'
  | 'tramplen_su_alti'
  | 'tramplen_yuzey';

interface KulvarSporcuDurumu {
  manken: YuzucuManken;
  kulvarIndeksi: number;
  cikisGecikmesi: number;
  gecenFazSuresi: number;
  faz: KulvarYuzucuFazi;
}

interface TramplenSporcuDurumu {
  manken: YuzucuManken;
  gecenFazSuresi: number;
  faz: TramplenAtlayiciFazi;
}

const CIKIS_GECIKMELERI = [0.61, 0.57, 0.66, 0.55, 0.63, 0.69] as const;
const KULVAR_TEMPO_CARPANLARI = [0.98, 1.03, 0.96, 1.05, 1.0, 0.94] as const;
const SPORCU_CILT_TONLARI = [
  0xdca580,
  0xe3b28e,
  0xcf936e,
  0xe0aa84,
  0xd69b75,
  0xe6b996,
] as const;

/**
 * 6 Galatasaraylı kulvar yüzücüsü, 1 adet 10m tramplen atlayıcısı,
 * küre ve kutu cisimlerinin yaşam döngüsünü ve fizik adımlarını yönetir.
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
  private yarisSuresi = 0;

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
        tempoCarpani: KULVAR_TEMPO_CARPANLARI[k],
      });

      manken.atanmisKulvarX = kulvarMerkeziXGetir(k);
      manken.maksPozitifZ = k === 3 ? 3.8 : null;

      this.insanGrubu.add(manken.kokGrup);
      this.kulvarSporculari.push({
        manken,
        kulvarIndeksi: k,
        cikisGecikmesi: CIKIS_GECIKMELERI[k],
        gecenFazSuresi: 0,
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

    this.yarisiYenidenBaslat();
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
    // Manken yerel eksenleri: X = -X_dunya, Y (sırt) = +Z_dunya, Z (baş) = +Y_dunya -> yüz havuza (-Z) bakar
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
      // Dünya X ekseninde negatif döndürme başı +Y'den -Z üzerinden -Y'ye (öne dalış) eğdirir
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
    durum.manken.maksPozitifZ = durum.kulvarIndeksi === 3 ? 3.8 : null;
    durum.manken.donusumuSenkronizeEt();

    durum.gecenFazSuresi = 0;
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
    manken.donusumuSenkronizeEt();

    this.tramplenSporcusu.gecenFazSuresi = 0;
    this.tramplenSporcusu.faz = 'tramplen_hazirlik';
  }

  /**
   * 6 kulvar yüzücüsünü çıkış bloklarına, 10m tramplen sporcusunu 10m kule ucuna sıfırlayıp yarışı yeniden başlatır.
   */
  public yarisiYenidenBaslat(): void {
    this.yarisSuresi = 0;
    for (const sporcu of this.kulvarSporculari) {
      this.kulvarSporcusunuBlokaKoy(sporcu);
    }
    this.tramplenSporcusunuKuleyeKoy();
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

    // Eski tekil cismin konumundan esinlenerek geçiş yap
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
   * Aktif cismi (insan modunda 6 yüzücü + 10m tramplen atlayıcısını) yüksekten suya serbest bırakır.
   */
  public yukaridanBirak(): void {
    if (this.aktifTip === 'insan') {
      for (const sporcu of this.kulvarSporculari) {
        const kulvarX = kulvarMerkeziXGetir(sporcu.kulvarIndeksi);
        const guvenliZ = THREE.MathUtils.clamp(
          sporcu.manken.konum.z,
          HAVUZ_SABITLERI.MIN_Z + 1.1,
          sporcu.kulvarIndeksi === 3 ? 3.5 : HAVUZ_SABITLERI.MAK_Z - 1.1,
        );
        this.geciciHedefKonum.set(kulvarX, 1.45, guvenliZ);
        sporcu.manken.konumuSifirla(this.geciciHedefKonum);
        sporcu.manken.fizikKilitliMi = false;
        sporcu.manken.aktifAnimasyonFazi = 'otomatik';
        sporcu.faz = 'yuzme';
        sporcu.gecenFazSuresi = 0;
      }

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
   * Raycaster ile sahnedeki aktif sporculardan veya cisimden kameraya en yakın olanı döndürür.
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
      const kesisimler = raycaster.intersectObject(sporcu.kokGrup, true);
      if (kesisimler.length > 0 && kesisimler[0].distance < enKisaMesafe) {
        enKisaMesafe = kesisimler[0].distance;
        enYakinSporcu = sporcu;
      }
    }

    return enYakinSporcu;
  }

  /**
   * Tüm aktif cisimlerin fizik ve animasyonlarını günceller, önceliklendirilmiş su darbelerini döndürür.
   */
  public guncelle(
    dt: number,
    gecenSure: number,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
  ): SuDarbesiVerisi[] {
    const tumDarbeler: SuDarbesiVerisi[] = [];

    if (this.aktifTip === 'insan') {
      const sinirliDt = Math.min(Math.max(dt, 0), 0.033);
      this.yarisSuresi += sinirliDt;

      for (const sporcu of this.kulvarSporculari) {
        this.kulvarSporcuDurumunuGuncelle(sporcu, sinirliDt);
      }
      this.tramplenSporcuDurumunuGuncelle(sinirliDt);

      for (const sporcu of this.tumSporcular) {
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

    // Maksimum 24 darbe kotası için en güçlü darbeleri (10m splash + sert kulaçlar) önceliklendir
    if (tumDarbeler.length > HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI) {
      tumDarbeler.sort((a, b) => Math.abs(b.kuvvet) - Math.abs(a.kuvvet));
      tumDarbeler.length = HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI;
    }

    this.sinirVerisiGuncelle(tumDarbeler);
    return tumDarbeler;
  }

  private kulvarSporcuDurumunuGuncelle(durum: KulvarSporcuDurumu, dt: number): void {
    const manken = durum.manken;

    if (manken.tutuluyorMu) {
      manken.fizikKilitliMi = false;
      manken.aktifAnimasyonFazi = 'otomatik';
      durum.faz = 'yuzme';
      return;
    }

    durum.gecenFazSuresi += dt;

    if (durum.faz === 'hazirlik') {
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
      // Uçuş eğrisi boyunca burnu hafifçe suya yönlendir
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
      if (this.durumModu !== 'aktif_yuzme') {
        return;
      }

      // 10m kule ucunda hafif yaylanma hareketi
      const yaylanma = Math.sin(durum.gecenFazSuresi * Math.PI * 2.4) * 0.035;
      manken.konum.y = HAVUZ_SABITLERI.TRAMPLEN_YUKSEKLIK_Y + 0.86 + yaylanma;
      manken.donusumuSenkronizeEt();

      if (durum.gecenFazSuresi >= 1.05) {
        manken.konum.y = HAVUZ_SABITLERI.TRAMPLEN_YUKSEKLIK_Y + 0.86;
        manken.fizikKilitliMi = false;
        manken.hiz.set(0, 3.25, -1.75);
        manken.aktifAnimasyonFazi = 'kugu_dalis';
        durum.faz = 'tramplen_kugu';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'tramplen_kugu') {
      const ilerleme = THREE.MathUtils.clamp(durum.gecenFazSuresi / 0.45, 0, 1);
      const hedefPitch = THREE.MathUtils.lerp(0.1, Math.PI * 0.56, ilerleme);
      this.geciciHedefYonelim.copy(this.tramplenDikDurusYonelimiOlustur(hedefPitch));
      manken.yonelim.slerp(this.geciciHedefYonelim, 1 - Math.exp(-8.5 * dt));

      if (durum.gecenFazSuresi >= 0.45) {
        manken.aktifAnimasyonFazi = 'havada_atlayis';
        durum.faz = 'tramplen_ok';
        durum.gecenFazSuresi = 0;
      }
      return;
    }

    if (durum.faz === 'tramplen_ok') {
      // Baş aşağı dikey ok dalış açısına (~172°) kilitlen
      this.geciciHedefYonelim.copy(
        this.tramplenDikDurusYonelimiOlustur(Math.PI * 0.96),
      );
      manken.yonelim.slerp(this.geciciHedefYonelim, 1 - Math.exp(-6.5 * dt));

      if (manken.konum.y < 0.10) {
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
      if (
        this.durumModu === 'aktif_yuzme' &&
        durum.gecenFazSuresi >= 2.4 &&
        !manken.tutuluyorMu
      ) {
        this.tramplenSporcusunuKuleyeKoy();
      }
    }
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

    // İnsan takımı modu: su içi/yakını sporcuların alt küre ve kapsayıcı kutusunu topla
    this.geciciKutu.makeEmpty();
    let altKureIndeksi = 0;
    let suIciSayisi = 0;
    let toplamBatma = 0;

    for (const sporcu of this.tumSporcular) {
      sporcu.donusumuSenkronizeEt();
      toplamBatma += sporcu.batanHacimOrani;

      if (sporcu.konum.y < 1.8) {
        this.geciciSporcuKutusu.setFromObject(sporcu.kokGrup);
        this.geciciKutu.union(this.geciciSporcuKutusu);
        suIciSayisi++;

        if (altKureIndeksi < HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE) {
          const sporcuKureleri = sporcu.altKureleriHesapla();
          // Göğüs ana gölge küresi (tüm 7 sporcu için yer kalmasını sağlar)
          const anaKure = sporcuKureleri[1] ?? sporcuKureleri[0];
          this.sinirVerisiOnbellegi.altKureler[altKureIndeksi].merkez.copy(anaKure.merkez);
          this.sinirVerisiOnbellegi.altKureler[altKureIndeksi].yaricap = 0.28;
          altKureIndeksi++;
        }
      }
    }

    // Boş alt küre slotu kaldıysa öncelikli yüzücünün pelvis/baş kürelerini de ekle
    if (altKureIndeksi < HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE) {
      for (const sporcu of this.tumSporcular) {
        if (sporcu.konum.y >= 1.8) {
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
      this.geciciKutu.setFromObject(this.kulvarSporculari[3].manken.kokGrup);
    }

    const referansSporcu = this.kulvarSporculari[3].manken;
    this.sinirVerisiOnbellegi.aktifTip = 'insan';
    this.sinirVerisiOnbellegi.merkez.copy(referansSporcu.konum);
    this.sinirVerisiOnbellegi.sinirlayiciYaricap = referansSporcu.sinirlayiciYaricap;
    this.sinirVerisiOnbellegi.altKutuMin.copy(this.geciciKutu.min);
    this.sinirVerisiOnbellegi.altKutuMak.copy(this.geciciKutu.max);
    this.sinirVerisiOnbellegi.aktifAltKureSayisi = altKureIndeksi;
    this.sinirVerisiOnbellegi.yogunluk = referansSporcu.yogunluk;
    this.sinirVerisiOnbellegi.batanHacimOrani = toplamBatma / this.tumSporcular.length;
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
    return this.kulvarSporculari[3].manken;
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
