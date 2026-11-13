/// <reference types="vite/client" />
import * as THREE from 'three';
import { CisimYoneticisi } from './entities/CisimYoneticisi';
import { OyunYoneticisi } from './game/OyunYoneticisi';
import { FareEtkilesimYoneticisi } from './physics/FareEtkilesimYoneticisi';
import { ArenaKalabalikVeHakemler } from './scene/ArenaKalabalikVeHakemler';
import { HavuzGeometrisi } from './scene/HavuzGeometrisi';
import { OlimpikEkipmanlar } from './scene/OlimpikEkipmanlar';
import { SahneYoneticisi } from './scene/SahneYoneticisi';
import { seramikKaroDokusuUret } from './scene/SeramikKaroDokusu';
import { SporKompleksiMimarisi } from './scene/SporKompleksiMimarisi';
import { OptikIsleyici } from './shaders/OptikIsleyici';
import { GpgpuSuSimulatoru } from './simulation/gpgpu/GpgpuSuSimulatoru';
import {
  type SimulasyonParametreleri,
  type SuYuksekligiSorguFonksiyonu,
} from './types/simulation';
import { KontrolPaneli } from './ui/KontrolPaneli';
import { OyunArayuzu } from './ui/OyunArayuzu';

/**
 * 3B İnteraktif Havuz ve Su Simülasyonu başlangıç parametreleri.
 */
const BASLANGIC_PARAMETRELERI: SimulasyonParametreleri = {
  cisimTipi: 'insan',
  durumModu: 'aktif_yuzme',
  cisimYogunlugu: 820,
  dalgaSonumleme: 0.988,
  kirilmaIndisi: 1.333,
  kostikSiddeti: 1.25,
  isikAzimutAcisi: 35,
  isikYukseklikAcisi: 62,
  suDurdurulduMu: false,
};

/**
 * Tüm alt sistemleri başlatan, kare bazlı veri akışını yöneten ve yaşam döngüsü sonunda
 * GPU/DOM kaynaklarını temizleyen baş orkestratör.
 */
class HavuzUygulamaOrkestratoru {
  private readonly sahneYoneticisi: SahneYoneticisi;
  private readonly gpgpuSimulatoru: GpgpuSuSimulatoru;
  private readonly optikIsleyici: OptikIsleyici;
  private readonly karoDokusu: THREE.CanvasTexture;
  private readonly havuzGeometrisi: HavuzGeometrisi;
  private readonly olimpikEkipmanlar: OlimpikEkipmanlar;
  private readonly sporKompleksiMimarisi: SporKompleksiMimarisi;
  private readonly arenaKalabalikVeHakemler: ArenaKalabalikVeHakemler;
  private readonly cisimYoneticisi: CisimYoneticisi;
  private readonly oyunYoneticisi: OyunYoneticisi;
  private readonly fareYoneticisi: FareEtkilesimYoneticisi;
  private readonly kontrolPaneli: KontrolPaneli;
  private readonly oyunArayuzu: OyunArayuzu;

  private readonly guncelParametreler: SimulasyonParametreleri;
  private readonly suYuksekligiSorgulayici: SuYuksekligiSorguFonksiyonu;
  private readonly temizlemeDinleyicisi: () => void;

  private animasyonCercesiId: number | null = null;
  private sonZamanMs = performance.now();
  private gecenSureSaniye = 0;
  private yumusatilmisFps = 60;
  private temizlendiMi = false;

  constructor(uygulamaKapsayici: HTMLElement, arayuzKatmani: HTMLElement) {
    this.guncelParametreler = { ...BASLANGIC_PARAMETRELERI };

    // 1. WebGL2 sahne, kamera, ışıklandırma ve OrbitControls kurulumu
    this.sahneYoneticisi = new SahneYoneticisi(uygulamaKapsayici);
    this.sahneYoneticisi.gunesIsigiYonuGuncelle(
      this.guncelParametreler.isikAzimutAcisi,
      this.guncelParametreler.isikYukseklikAcisi,
    );

    const baslangicGenislik = Math.max(1, uygulamaKapsayici.clientWidth || window.innerWidth);
    const baslangicYukseklik = Math.max(1, uygulamaKapsayici.clientHeight || window.innerHeight);

    // 2. GPGPU Ping-Pong dalga simülatörü
    this.gpgpuSimulatoru = new GpgpuSuSimulatoru(this.sahneYoneticisi.renderer);
    this.suYuksekligiSorgulayici = (dunyaX: number, dunyaZ: number): number =>
      this.gpgpuSimulatoru.suYuksekligiSorgula(dunyaX, dunyaZ);

    // 3. Çok geçişli optik, kırılma, kostik ve su altı gölge işleyicisi
    this.optikIsleyici = new OptikIsleyici(
      this.sahneYoneticisi.renderer,
      baslangicGenislik,
      baslangicYukseklik,
    );
    this.sahneYoneticisi.sahne.add(this.optikIsleyici.suYuzeyiMeshGetir());

    // 4. Prosedürel seramik karo dokusu, havuz kabuğu, olimpik ekipman ve spor kompleksi mimarisi
    this.karoDokusu = seramikKaroDokusuUret(this.sahneYoneticisi.maksimumAnizotropi);
    const havuzMateryali = this.optikIsleyici.havuzMateryaliOlustur(this.karoDokusu);
    this.havuzGeometrisi = new HavuzGeometrisi(this.sahneYoneticisi.sahne, havuzMateryali);
    this.olimpikEkipmanlar = new OlimpikEkipmanlar(this.sahneYoneticisi.sahne);
    this.sporKompleksiMimarisi = new SporKompleksiMimarisi(this.sahneYoneticisi.sahne);
    this.arenaKalabalikVeHakemler = new ArenaKalabalikVeHakemler(this.sahneYoneticisi.sahne);

    // 5. Hidrostatik fizik, eklemli cisim yöneticisi ve şampiyona oyun yöneticisi
    this.cisimYoneticisi = new CisimYoneticisi(this.sahneYoneticisi.sahne);
    this.cisimYoneticisi.parametreleriUygula(this.guncelParametreler);
    this.optikIsleyici.cisimlereSuAltiOptigiBagla(this.cisimYoneticisi.aktifNesneGetir());
    this.oyunYoneticisi = new OyunYoneticisi(
      this.cisimYoneticisi,
      this.sporKompleksiMimarisi,
      this.arenaKalabalikVeHakemler,
      this.sahneYoneticisi,
    );

    // 6. Raycast cisim sürükleme ve suya dokunma etkileşimi
    this.fareYoneticisi = new FareEtkilesimYoneticisi(
      this.sahneYoneticisi.kamera,
      this.sahneYoneticisi.tuval,
      this.sahneYoneticisi.kontroller,
      this.cisimYoneticisi,
      (uvX, uvZ, yaricap, kuvvet) => {
        this.gpgpuSimulatoru.darbeEkle(uvX, uvZ, yaricap, kuvvet);
      },
    );

    // 7. Koyu cam efektli kontrol paneli (varsayılan kapalı) ve oynanabilir şampiyona HUD'u
    this.kontrolPaneli = new KontrolPaneli(arayuzKatmani, this.guncelParametreler, {
      parametreDegisti: (yeniParametreler) => this.parametreGuncelle(yeniParametreler),
      suyuSifirlaIstegi: () => {
        this.gpgpuSimulatoru.sifirla(this.sahneYoneticisi.renderer);
      },
      cismiYukaridanBirakIstegi: () => {
        this.cisimYoneticisi.yukaridanBirak();
      },
      yuzmeYarisiBaslatIstegi: () => {
        this.gpgpuSimulatoru.sifirla(this.sahneYoneticisi.renderer);
        this.oyunYoneticisi.yuzmeYarisiBaslat(true);
        this.oyunArayuzu.guncelle();
      },
      tramplenAtlayisiBaslatIstegi: () => {
        this.gpgpuSimulatoru.sifirla(this.sahneYoneticisi.renderer);
        this.oyunYoneticisi.tramplenAtlayisiBaslat(true);
        this.oyunArayuzu.guncelle();
      },
    });
    this.oyunArayuzu = new OyunArayuzu(arayuzKatmani, this.oyunYoneticisi);

    this.sahneYoneticisi.yenidenBoyutlandirDinleyiciAta((genislik, yukseklik) => {
      this.optikIsleyici.yenidenBoyutlandir(genislik, yukseklik);
    });

    // Açılış karesinde su yüzeyini ve kostikleri canlandırmak için yumuşak başlangıç dalgaları
    this.acilisDalgalariniEkle();

    this.temizlemeDinleyicisi = () => this.temizle();
    window.addEventListener('beforeunload', this.temizlemeDinleyicisi);

    this.baslat();
  }

  private acilisDalgalariniEkle(): void {
    this.gpgpuSimulatoru.darbeEkle(0.58, 0.24, 0.034, -0.065);
    this.gpgpuSimulatoru.darbeEkle(0.26, 0.62, 0.026, -0.045);
    this.gpgpuSimulatoru.darbeEkle(0.74, 0.72, 0.026, -0.045);
    this.gpgpuSimulatoru.darbeEkle(0.42, 0.44, 0.022, -0.035);
  }

  private parametreGuncelle(yeniParametreler: SimulasyonParametreleri): void {
    const oncekiTip = this.guncelParametreler.cisimTipi;
    Object.assign(this.guncelParametreler, yeniParametreler);

    if (yeniParametreler.cisimTipi !== oncekiTip) {
      const yeniNesne = this.cisimYoneticisi.cisimTipiAyarla(yeniParametreler.cisimTipi);
      this.optikIsleyici.cisimlereSuAltiOptigiBagla(yeniNesne);
    }

    this.cisimYoneticisi.parametreleriUygula(this.guncelParametreler);
    this.sahneYoneticisi.gunesIsigiYonuGuncelle(
      this.guncelParametreler.isikAzimutAcisi,
      this.guncelParametreler.isikYukseklikAcisi,
    );
  }

  private baslat(): void {
    this.sonZamanMs = performance.now();
    const kareIsle = (simdiMs: number): void => {
      if (this.temizlendiMi) {
        return;
      }

      const hamDtSaniye = Math.max(0.0001, (simdiMs - this.sonZamanMs) / 1000);
      this.sonZamanMs = simdiMs;

      const sinirliDt = Math.min(hamDtSaniye, 0.033);
      this.gecenSureSaniye += sinirliDt;

      // 1. Kamera kontrolcüsü, hidrostatik fizik, oyun durumu ve tribün/hakem animasyonları
      this.sahneYoneticisi.guncelle(sinirliDt);
      this.cisimYoneticisi.guncelle(
        sinirliDt,
        this.gecenSureSaniye,
        this.suYuksekligiSorgulayici,
      );
      this.oyunYoneticisi.guncelle(sinirliDt, this.gecenSureSaniye);
      this.arenaKalabalikVeHakemler.guncelle(
        sinirliDt,
        this.gecenSureSaniye,
        this.oyunYoneticisi.goruntuGetir().coskuSeviyesi,
      );
      this.oyunArayuzu.guncelle();

      // 2. Cismin su kesitinden gelen deplasman dalgalarını GPGPU simülatörüne aktar
      const sinirVerisi = this.cisimYoneticisi.sinirVerisiGetir();
      if (!this.guncelParametreler.suDurdurulduMu && sinirVerisi.suKesitDarbeleri.length > 0) {
        this.gpgpuSimulatoru.cokluDarbeEkle(sinirVerisi.suKesitDarbeleri);
      }

      // 3. GPGPU dalga denklemi ve yüzey normali geçişleri
      const gpgpuPassSayisi = this.gpgpuSimulatoru.adimla(
        this.sahneYoneticisi.renderer,
        this.guncelParametreler.dalgaSonumleme,
        this.guncelParametreler.suDurdurulduMu,
      );

      // 4. Su altı gölgesi + kostikler + kırılma FBO geçişleri
      const optikPassSayisi = this.optikIsleyici.guncelleVeIsle({
        renderer: this.sahneYoneticisi.renderer,
        sahne: this.sahneYoneticisi.sahne,
        kamera: this.sahneYoneticisi.kamera,
        aktifCisimNesnesi: this.cisimYoneticisi.aktifNesneGetir(),
        yukseklikDokusu: this.gpgpuSimulatoru.yukseklikDokusuGetir(),
        cisimSinirVerisi: sinirVerisi,
        parametreler: this.guncelParametreler,
        gecenSureSaniye: this.gecenSureSaniye,
      });

      // 5. Ana ekran sahne render geçişi (+1 pass)
      this.sahneYoneticisi.isle();

      // 6. Canlı FPS ve GPU pass telemetrisi güncellemesi
      const kareSuresiMs = hamDtSaniye * 1000;
      const anlikFps = Math.min(240, 1000 / Math.max(kareSuresiMs, 1));
      this.yumusatilmisFps = this.yumusatilmisFps * 0.9 + anlikFps * 0.1;

      this.kontrolPaneli.telemetriGuncelle({
        fps: this.yumusatilmisFps,
        kareSuresiMs,
        aktifGpuPassSayisi: gpgpuPassSayisi + optikPassSayisi + 1,
        webgl2AktifMi: this.sahneYoneticisi.webgl2AktifMi,
        floatFboDestegiVarMi: this.sahneYoneticisi.floatFboDestegiVarMi,
      });

      this.animasyonCercesiId = requestAnimationFrame(kareIsle);
    };

    this.animasyonCercesiId = requestAnimationFrame(kareIsle);
  }

  /**
   * Animasyon döngüsünü durdurur ve tüm modüllerin CPU/GPU/DOM kaynaklarını serbest bırakır.
   */
  public temizle(): void {
    if (this.temizlendiMi) {
      return;
    }
    this.temizlendiMi = true;

    if (this.animasyonCercesiId !== null) {
      cancelAnimationFrame(this.animasyonCercesiId);
      this.animasyonCercesiId = null;
    }

    window.removeEventListener('beforeunload', this.temizlemeDinleyicisi);

    this.fareYoneticisi.temizle();
    this.oyunArayuzu.temizle();
    this.kontrolPaneli.temizle();
    this.oyunYoneticisi.temizle();
    this.arenaKalabalikVeHakemler.temizle();
    this.cisimYoneticisi.temizle();
    this.olimpikEkipmanlar.temizle();
    this.sporKompleksiMimarisi.temizle();
    this.havuzGeometrisi.temizle();
    this.karoDokusu.dispose();
    this.optikIsleyici.temizle();
    this.gpgpuSimulatoru.temizle();
    this.sahneYoneticisi.temizle();
  }
}

function uygulamayiBaslat(): void {
  const uygulamaKapsayici = document.getElementById('uygulama-kapsayici');
  const arayuzKatmani = document.getElementById('arayuz-katmani');

  if (!uygulamaKapsayici || !arayuzKatmani) {
    throw new Error('Uygulama kök DOM elemanları (#uygulama-kapsayici, #arayuz-katmani) bulunamadı.');
  }

  const orkestrator = new HavuzUygulamaOrkestratoru(uygulamaKapsayici, arayuzKatmani);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      orkestrator.temizle();
    });
  }
}

uygulamayiBaslat();
