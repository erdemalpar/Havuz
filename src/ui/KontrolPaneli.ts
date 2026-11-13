import './stil.css';
import {
  CisimTipi,
  KaynakTemizlenebilir,
  KontrolPaneliOlaylari,
  SimulasyonParametreleri,
  TelemetriVerisi,
  YuzmeDurumModu,
} from '../types/simulation';

const TELEMETRI_GUNCELLEME_ARALIGI_MS = 150;

const DURUM_MODU_YOGUNLUKLARI: Readonly<Record<Exclude<YuzmeDurumModu, 'serbest'>, number>> = {
  aktif_yuzme: 820,
  dengede: 720,
  batma: 1450,
};

interface SegmentSecenegi<T extends string> {
  deger: T;
  etiket: string;
}

interface KaydiriciAyari {
  etiket: string;
  enAz: number;
  enCok: number;
  adim: number;
  baslangicDegeri: number;
  bicimlendir: (deger: number) => string;
  degistiginde: (deger: number) => void;
}

interface KaydiriciBaglantisi {
  girdi: HTMLInputElement;
  degerMetni: HTMLSpanElement;
  enAz: number;
  enCok: number;
  bicimlendir: (deger: number) => string;
}

/**
 * Sağ üst cam efektli kontrol panelini, canlı performans telemetrisini
 * ve sol alt etkileşim rehberini yöneten arayüz sınıfı.
 */
export class KontrolPaneli implements KaynakTemizlenebilir {
  private readonly guncelParametreler: SimulasyonParametreleri;
  private readonly olaylar: KontrolPaneliOlaylari;
  private readonly temizlemeIslemleri: Array<() => void> = [];

  private readonly panelKok: HTMLElement;
  private readonly rehberKutusu: HTMLDivElement;
  private readonly daraltButon: HTMLButtonElement;
  private readonly suDurdurButon: HTMLButtonElement;

  private readonly fpsRozet: HTMLSpanElement;
  private readonly fpsDegerMetin: HTMLSpanElement;
  private readonly kareSuresiMetin: HTMLSpanElement;
  private readonly gpuPassMetin: HTMLSpanElement;
  private readonly webglDurumRozet: HTMLSpanElement;
  private readonly webglDurumMetin: HTMLSpanElement;

  private readonly cisimButonlari = new Map<CisimTipi, HTMLButtonElement>();
  private readonly durumButonlari = new Map<
    Exclude<YuzmeDurumModu, 'serbest'>,
    HTMLButtonElement
  >();
  private readonly yogunlukKaydiricisi: KaydiriciBaglantisi;

  private daraltildiMi = true;
  private temizlendiMi = false;
  private sonTelemetriZamani = -TELEMETRI_GUNCELLEME_ARALIGI_MS;
  private sonFpsSinifi = '';
  private sonWebglSinifi = '';

  constructor(
    kokEleman: HTMLElement,
    baslangicParametreleri: SimulasyonParametreleri,
    olaylar: KontrolPaneliOlaylari,
  ) {
    this.guncelParametreler = { ...baslangicParametreleri };
    this.olaylar = olaylar;

    // Ana kontrol paneli kabuğu (varsayılan kapalı/daraltılmış başlar)
    this.panelKok = document.createElement('aside');
    this.panelKok.className = 'kontrol-paneli daraltildi';
    this.panelKok.setAttribute('aria-label', 'Simülasyon Kontrol Paneli');

    // 1. Başlık ve Telemetri Satırı
    const baslikAlani = document.createElement('div');
    baslikAlani.className = 'panel-baslik-alani';

    const ustSatir = document.createElement('div');
    ustSatir.className = 'panel-ust-satir';

    const baslik = document.createElement('h2');
    baslik.className = 'panel-baslik-metin';
    const baslikNokta = document.createElement('span');
    baslikNokta.className = 'baslik-nokta';
    baslik.append(baslikNokta, document.createTextNode('GS Olimpik Havuz • Su & Optik'));

    this.daraltButon = document.createElement('button');
    this.daraltButon.type = 'button';
    this.daraltButon.className = 'panel-daralt-buton';
    this.daraltButon.textContent = 'Ayarlar • Aç';
    this.daraltButon.setAttribute('aria-expanded', 'false');
    this.olayDinleyiciEkle(this.daraltButon, 'click', () => {
      this.daraltildiMi = !this.daraltildiMi;
      this.panelKok.classList.toggle('daraltildi', this.daraltildiMi);
      this.daraltButon.textContent = this.daraltildiMi ? 'Ayarlar • Aç' : 'Daralt';
      this.daraltButon.setAttribute('aria-expanded', String(!this.daraltildiMi));
    });

    ustSatir.append(baslik, this.daraltButon);
    baslikAlani.appendChild(ustSatir);

    const telemetriIzcara = document.createElement('div');
    telemetriIzcara.className = 'telemetri-izgara';

    const fpsOlusturulan = this.telemetriRozetiOlustur('FPS', '--');
    this.fpsRozet = fpsOlusturulan.rozet;
    this.fpsDegerMetin = fpsOlusturulan.degerElemani;

    const kareOlusturulan = this.telemetriRozetiOlustur('Kare', '-- ms');
    this.kareSuresiMetin = kareOlusturulan.degerElemani;

    const gpuOlusturulan = this.telemetriRozetiOlustur('GPU Pass', '--');
    this.gpuPassMetin = gpuOlusturulan.degerElemani;

    const webglOlusturulan = this.telemetriRozetiOlustur('API', 'WebGL2');
    this.webglDurumRozet = webglOlusturulan.rozet;
    this.webglDurumMetin = webglOlusturulan.degerElemani;

    telemetriIzcara.append(
      this.fpsRozet,
      kareOlusturulan.rozet,
      gpuOlusturulan.rozet,
      this.webglDurumRozet,
    );
    baslikAlani.appendChild(telemetriIzcara);
    this.panelKok.appendChild(baslikAlani);

    // Kaydırılabilir gövde
    const panelGovde = document.createElement('div');
    panelGovde.className = 'panel-govde';

    // 2. Cisim Tipi Seçimi
    const cisimSecenekleri: readonly SegmentSecenegi<CisimTipi>[] = [
      { deger: 'insan', etiket: 'İnsan Modeli' },
      { deger: 'kure', etiket: 'Küre' },
      { deger: 'kutu', etiket: 'Kutu' },
    ];
    const cisimBolumu = this.bolumOlustur('Cisim Tipi');
    cisimBolumu.appendChild(
      this.segmentGrubuOlustur(
        cisimSecenekleri,
        this.guncelParametreler.cisimTipi,
        this.cisimButonlari,
        (secilenTip) => {
          this.guncelParametreler.cisimTipi = secilenTip;
          this.segmentAktifliginiGuncelle(this.cisimButonlari, secilenTip);
          this.parametreDegisimiBildir();
        },
      ),
    );
    panelGovde.appendChild(cisimBolumu);

    // 3. Yüzme / Batma Durumu ve Cisim Yoğunluğu
    const durumSecenekleri: readonly SegmentSecenegi<Exclude<YuzmeDurumModu, 'serbest'>>[] = [
      { deger: 'aktif_yuzme', etiket: 'Aktif Yüzme' },
      { deger: 'dengede', etiket: 'Dengede' },
      { deger: 'batma', etiket: 'Batma' },
    ];
    const durumBolumu = this.bolumOlustur('Yüzme / Batma Durumu');
    durumBolumu.appendChild(
      this.segmentGrubuOlustur(
        durumSecenekleri,
        this.guncelParametreler.durumModu === 'serbest'
          ? null
          : this.guncelParametreler.durumModu,
        this.durumButonlari,
        (secilenMod) => {
          const hedefYogunluk = DURUM_MODU_YOGUNLUKLARI[secilenMod];
          this.guncelParametreler.durumModu = secilenMod;
          this.guncelParametreler.cisimYogunlugu = hedefYogunluk;
          this.segmentAktifliginiGuncelle(this.durumButonlari, secilenMod);
          this.kaydiriciDegeriniGuncelle(this.yogunlukKaydiricisi, hedefYogunluk);
          this.parametreDegisimiBildir();
        },
      ),
    );

    const yogunlukOlusturulan = this.kaydiriciOlustur({
      etiket: 'Cisim Yoğunluğu (kg/m³)',
      enAz: 300,
      enCok: 2400,
      adim: 10,
      baslangicDegeri: this.guncelParametreler.cisimYogunlugu,
      bicimlendir: (deger) => `${Math.round(deger)} kg/m³`,
      degistiginde: (deger) => {
        const yuvarlanmis = Math.round(deger);
        const eslesenMod = this.yogunlugaGoreDurumModuBul(yuvarlanmis);
        this.guncelParametreler.cisimYogunlugu = yuvarlanmis;
        this.guncelParametreler.durumModu = eslesenMod;
        this.segmentAktifliginiGuncelle(
          this.durumButonlari,
          eslesenMod === 'serbest' ? null : eslesenMod,
        );
        this.parametreDegisimiBildir();
      },
    });
    this.yogunlukKaydiricisi = yogunlukOlusturulan.baglanti;
    durumBolumu.appendChild(yogunlukOlusturulan.kapsayici);
    panelGovde.appendChild(durumBolumu);

    // 4. Fizik & Optik Kaydırıcıları
    const fizikOptikBolumu = this.bolumOlustur('Fizik & Optik Parametreleri');
    const kaydiriciAyarlari: readonly KaydiriciAyari[] = [
      {
        etiket: 'Dalga Sönümleme',
        enAz: 0.95,
        enCok: 0.998,
        adim: 0.001,
        baslangicDegeri: this.guncelParametreler.dalgaSonumleme,
        bicimlendir: (deger) => deger.toFixed(3),
        degistiginde: (deger) => {
          this.guncelParametreler.dalgaSonumleme = Number(deger.toFixed(3));
          this.parametreDegisimiBildir();
        },
      },
      {
        etiket: 'Kırılma İndisi (IOR)',
        enAz: 1.0,
        enCok: 1.75,
        adim: 0.001,
        baslangicDegeri: this.guncelParametreler.kirilmaIndisi,
        bicimlendir: (deger) => deger.toFixed(3),
        degistiginde: (deger) => {
          this.guncelParametreler.kirilmaIndisi = Number(deger.toFixed(3));
          this.parametreDegisimiBildir();
        },
      },
      {
        etiket: 'Kostik Şiddeti',
        enAz: 0.0,
        enCok: 2.5,
        adim: 0.05,
        baslangicDegeri: this.guncelParametreler.kostikSiddeti,
        bicimlendir: (deger) => deger.toFixed(2),
        degistiginde: (deger) => {
          this.guncelParametreler.kostikSiddeti = Number(deger.toFixed(2));
          this.parametreDegisimiBildir();
        },
      },
      {
        etiket: 'Işık Yükseklik Açısı',
        enAz: 30,
        enCok: 88,
        adim: 1,
        baslangicDegeri: this.guncelParametreler.isikYukseklikAcisi,
        bicimlendir: (deger) => `${Math.round(deger)}°`,
        degistiginde: (deger) => {
          this.guncelParametreler.isikYukseklikAcisi = Math.round(deger);
          this.parametreDegisimiBildir();
        },
      },
      {
        etiket: 'Işık Azimut Açısı',
        enAz: 0,
        enCok: 360,
        adim: 1,
        baslangicDegeri: this.guncelParametreler.isikAzimutAcisi,
        bicimlendir: (deger) => `${Math.round(deger)}°`,
        degistiginde: (deger) => {
          this.guncelParametreler.isikAzimutAcisi = Math.round(deger);
          this.parametreDegisimiBildir();
        },
      },
    ];

    for (const ayar of kaydiriciAyarlari) {
      const kaydirici = this.kaydiriciOlustur(ayar);
      fizikOptikBolumu.appendChild(kaydirici.kapsayici);
    }
    panelGovde.appendChild(fizikOptikBolumu);

    // 5. Eylem Butonları
    const eylemBolumu = this.bolumOlustur('Eylemler');
    const eylemIzgara = document.createElement('div');
    eylemIzgara.className = 'eylem-izgara';

    this.suDurdurButon = document.createElement('button');
    this.suDurdurButon.type = 'button';
    this.suDurdurButon.className = 'eylem-buton';
    this.suDurdurButonDurumunuGuncelle();
    this.olayDinleyiciEkle(this.suDurdurButon, 'click', () => {
      this.guncelParametreler.suDurdurulduMu = !this.guncelParametreler.suDurdurulduMu;
      this.suDurdurButonDurumunuGuncelle();
      this.parametreDegisimiBildir();
    });

    const suyuSifirlaButon = document.createElement('button');
    suyuSifirlaButon.type = 'button';
    suyuSifirlaButon.className = 'eylem-buton';
    suyuSifirlaButon.textContent = 'Suyu Sıfırla';
    this.olayDinleyiciEkle(suyuSifirlaButon, 'click', () => {
      this.olaylar.suyuSifirlaIstegi();
    });

    const yuzmeBaslatButon = document.createElement('button');
    yuzmeBaslatButon.type = 'button';
    yuzmeBaslatButon.className = 'eylem-buton buton-gs-aksan';
    yuzmeBaslatButon.textContent = '🏊 Yüzme Yarışını Başlat';
    this.olayDinleyiciEkle(yuzmeBaslatButon, 'click', () => {
      this.olaylar.yuzmeYarisiBaslatIstegi();
    });

    const tramplenBaslatButon = document.createElement('button');
    tramplenBaslatButon.type = 'button';
    tramplenBaslatButon.className = 'eylem-buton buton-gs-aksan';
    tramplenBaslatButon.textContent = '🤸 10m Atlayışını Başlat';
    this.olayDinleyiciEkle(tramplenBaslatButon, 'click', () => {
      this.olaylar.tramplenAtlayisiBaslatIstegi();
    });

    const yukaridanBirakButon = document.createElement('button');
    yukaridanBirakButon.type = 'button';
    yukaridanBirakButon.className = 'eylem-buton tam-genislik';
    yukaridanBirakButon.textContent = 'Cismi Yukarıdan Bırak';
    this.olayDinleyiciEkle(yukaridanBirakButon, 'click', () => {
      this.olaylar.cismiYukaridanBirakIstegi();
    });

    eylemIzgara.append(
      this.suDurdurButon,
      suyuSifirlaButon,
      yuzmeBaslatButon,
      tramplenBaslatButon,
      yukaridanBirakButon,
    );
    eylemBolumu.appendChild(eylemIzgara);
    panelGovde.appendChild(eylemBolumu);

    this.panelKok.appendChild(panelGovde);

    // Sol alt etkileşim rehberi
    this.rehberKutusu = document.createElement('div');
    this.rehberKutusu.className = 'etkilesim-rehberi';
    this.rehberKutusu.textContent =
      'Sporcuyu tut & sürükle • Suya tıkla & dalga yarat • Boşlukta sürükle & kamerayı döndür';

    kokEleman.append(this.panelKok, this.rehberKutusu);
  }

  /**
   * Telemetri satırı için etiketli bir rozet DOM öğesi üretir.
   */
  private telemetriRozetiOlustur(
    etiket: string,
    baslangicDeger: string,
  ): { rozet: HTMLSpanElement; degerElemani: HTMLSpanElement } {
    const rozet = document.createElement('span');
    rozet.className = 'telemetri-rozet';

    const etiketElemani = document.createElement('span');
    etiketElemani.className = 'telemetri-etiket';
    etiketElemani.textContent = etiket;

    const degerElemani = document.createElement('span');
    degerElemani.textContent = baslangicDeger;

    rozet.append(etiketElemani, degerElemani);
    return { rozet, degerElemani };
  }

  /**
   * Başlıklı bir kontrol bölümü kapsayıcısı oluşturur.
   */
  private bolumOlustur(baslikMetni: string): HTMLElement {
    const bolum = document.createElement('section');
    bolum.className = 'kontrol-bolum';

    const baslik = document.createElement('div');
    baslik.className = 'bolum-baslik';
    baslik.textContent = baslikMetni;

    bolum.appendChild(baslik);
    return bolum;
  }

  /**
   * Segmentli buton grubunu oluşturur ve tıklama olaylarını bağlar.
   */
  private segmentGrubuOlustur<T extends string>(
    secenekler: readonly SegmentSecenegi<T>[],
    aktifDeger: T | null,
    butonHaritasi: Map<T, HTMLButtonElement>,
    secildiginde: (deger: T) => void,
  ): HTMLDivElement {
    const grup = document.createElement('div');
    grup.className = 'segment-grup';

    for (const secenek of secenekler) {
      const buton = document.createElement('button');
      buton.type = 'button';
      buton.className = 'segment-buton';
      buton.textContent = secenek.etiket;

      const seciliMi = secenek.deger === aktifDeger;
      buton.classList.toggle('aktif', seciliMi);
      buton.setAttribute('aria-pressed', String(seciliMi));

      this.olayDinleyiciEkle(buton, 'click', () => {
        secildiginde(secenek.deger);
      });

      butonHaritasi.set(secenek.deger, buton);
      grup.appendChild(buton);
    }

    return grup;
  }

  /**
   * Segment butonlarının aktif görsel durumunu ve ARIA özniteliğini günceller.
   */
  private segmentAktifliginiGuncelle<T extends string>(
    butonHaritasi: Map<T, HTMLButtonElement>,
    aktifDeger: T | null,
  ): void {
    for (const [deger, buton] of butonHaritasi) {
      const aktifMi = deger === aktifDeger;
      buton.classList.toggle('aktif', aktifMi);
      buton.setAttribute('aria-pressed', String(aktifMi));
    }
  }

  /**
   * Etiket, sayısal değer göstergesi ve özelleştirilmiş range input içeren satır üretir.
   */
  private kaydiriciOlustur(ayar: KaydiriciAyari): {
    kapsayici: HTMLDivElement;
    baglanti: KaydiriciBaglantisi;
  } {
    const kapsayici = document.createElement('div');
    kapsayici.className = 'kaydirici-satir';

    const ustSatir = document.createElement('div');
    ustSatir.className = 'kaydirici-ust';

    const etiket = document.createElement('label');
    etiket.className = 'kaydirici-etiket';
    etiket.textContent = ayar.etiket;

    const degerMetni = document.createElement('span');
    degerMetni.className = 'kaydirici-deger';

    const girdi = document.createElement('input');
    girdi.type = 'range';
    girdi.className = 'ozel-kaydirici';
    girdi.min = String(ayar.enAz);
    girdi.max = String(ayar.enCok);
    girdi.step = String(ayar.adim);
    girdi.setAttribute('aria-label', ayar.etiket);

    const baglanti: KaydiriciBaglantisi = {
      girdi,
      degerMetni,
      enAz: ayar.enAz,
      enCok: ayar.enCok,
      bicimlendir: ayar.bicimlendir,
    };

    this.kaydiriciDegeriniGuncelle(baglanti, ayar.baslangicDegeri);

    this.olayDinleyiciEkle(girdi, 'input', () => {
      const sayiDeger = Number(girdi.value);
      this.kaydiriciGorselDolguGuncelle(baglanti, sayiDeger);
      degerMetni.textContent = ayar.bicimlendir(sayiDeger);
      ayar.degistiginde(sayiDeger);
    });

    ustSatir.append(etiket, degerMetni);
    kapsayici.append(ustSatir, girdi);

    return { kapsayici, baglanti };
  }

  /**
   * Kaydırıcı girdi değerini, sayısal metni ve dolgu izini günceller.
   */
  private kaydiriciDegeriniGuncelle(baglanti: KaydiriciBaglantisi, yeniDeger: number): void {
    const sinirli = Math.min(baglanti.enCok, Math.max(baglanti.enAz, yeniDeger));
    baglanti.girdi.value = String(sinirli);
    baglanti.degerMetni.textContent = baglanti.bicimlendir(sinirli);
    this.kaydiriciGorselDolguGuncelle(baglanti, sinirli);
  }

  /**
   * Range track arka plan dolgu yüzdesini CSS değişkeni olarak günceller.
   */
  private kaydiriciGorselDolguGuncelle(baglanti: KaydiriciBaglantisi, deger: number): void {
    const aralik = baglanti.enCok - baglanti.enAz;
    const oran = aralik > 0 ? ((deger - baglanti.enAz) / aralik) * 100 : 0;
    const yuzde = Math.max(0, Math.min(100, oran));
    baglanti.girdi.style.setProperty('--dolgu', `${yuzde.toFixed(2)}%`);
  }

  /**
   * Yoğunluk değerine göre eşleşen hazır yüzme durum modunu döndürür.
   */
  private yogunlugaGoreDurumModuBul(yogunluk: number): YuzmeDurumModu {
    if (yogunluk === DURUM_MODU_YOGUNLUKLARI.aktif_yuzme) {
      return 'aktif_yuzme';
    }
    if (yogunluk === DURUM_MODU_YOGUNLUKLARI.dengede) {
      return 'dengede';
    }
    if (yogunluk === DURUM_MODU_YOGUNLUKLARI.batma) {
      return 'batma';
    }
    return 'serbest';
  }

  /**
   * Suyu Durdur / Suyu Başlat butonunun etiket ve durum sınıfını günceller.
   */
  private suDurdurButonDurumunuGuncelle(): void {
    const durduruldu = this.guncelParametreler.suDurdurulduMu;
    this.suDurdurButon.textContent = durduruldu ? 'Suyu Başlat' : 'Suyu Durdur';
    this.suDurdurButon.classList.toggle('durum-durduruldu', durduruldu);
  }

  /**
   * Olay dinleyicisi bağlar ve temizleme sırasında otomatik kaldırmak üzere kaydeder.
   */
  private olayDinleyiciEkle<K extends keyof HTMLElementEventMap>(
    eleman: HTMLElement,
    olayAdi: K,
    isleyici: (olay: HTMLElementEventMap[K]) => void,
  ): void {
    eleman.addEventListener(olayAdi, isleyici);
    this.temizlemeIslemleri.push(() => {
      eleman.removeEventListener(olayAdi, isleyici);
    });
  }

  /**
   * Güncel simülasyon parametrelerinin kopyasını dış olay dinleyicisine iletir.
   */
  private parametreDegisimiBildir(): void {
    this.olaylar.parametreDegisti({ ...this.guncelParametreler });
  }

  /**
   * DOM reflow maliyetini en aza indirmek için yalnızca ~150ms aralıklarla
   * sayısal telemetri metinlerini ve renk durum sınıflarını günceller.
   */
  public telemetriGuncelle(telemetri: TelemetriVerisi): void {
    if (this.temizlendiMi) {
      return;
    }

    const simdi = performance.now();
    if (simdi - this.sonTelemetriZamani < TELEMETRI_GUNCELLEME_ARALIGI_MS) {
      return;
    }
    this.sonTelemetriZamani = simdi;

    const yuvarlanmisFps = Math.max(0, Math.round(telemetri.fps));
    this.fpsDegerMetin.textContent = String(yuvarlanmisFps);
    this.kareSuresiMetin.textContent = `${telemetri.kareSuresiMs.toFixed(1)} ms`;
    this.gpuPassMetin.textContent = String(telemetri.aktifGpuPassSayisi);

    const yeniFpsSinifi =
      yuvarlanmisFps >= 50 ? 'fps-iyi' : yuvarlanmisFps >= 30 ? 'fps-orta' : 'fps-dusuk';
    if (yeniFpsSinifi !== this.sonFpsSinifi) {
      this.fpsRozet.classList.remove('fps-iyi', 'fps-orta', 'fps-dusuk');
      this.fpsRozet.classList.add(yeniFpsSinifi);
      this.sonFpsSinifi = yeniFpsSinifi;
    }

    const yeniWebglMetin = telemetri.webgl2AktifMi
      ? telemetri.floatFboDestegiVarMi
        ? 'WebGL2 + Float'
        : 'WebGL2 (Half)'
      : 'WebGL1';
    if (this.webglDurumMetin.textContent !== yeniWebglMetin) {
      this.webglDurumMetin.textContent = yeniWebglMetin;
    }

    const yeniWebglSinifi =
      telemetri.webgl2AktifMi && telemetri.floatFboDestegiVarMi
        ? 'durum-tamam'
        : 'durum-uyari';
    if (yeniWebglSinifi !== this.sonWebglSinifi) {
      this.webglDurumRozet.classList.remove('durum-tamam', 'durum-uyari');
      this.webglDurumRozet.classList.add(yeniWebglSinifi);
      this.sonWebglSinifi = yeniWebglSinifi;
    }
  }

  /**
   * Bağlanan tüm olay dinleyicilerini ve DOM düğümlerini temizler.
   */
  public temizle(): void {
    if (this.temizlendiMi) {
      return;
    }
    this.temizlendiMi = true;

    for (const kaldir of this.temizlemeIslemleri) {
      kaldir();
    }
    this.temizlemeIslemleri.length = 0;

    this.panelKok.remove();
    this.rehberKutusu.remove();
  }
}
