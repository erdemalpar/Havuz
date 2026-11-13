import * as THREE from 'three';
import type { CisimYoneticisi } from '../entities/CisimYoneticisi';
import type { ArenaKalabalikVeHakemler } from '../scene/ArenaKalabalikVeHakemler';
import type { SahneYoneticisi } from '../scene/SahneYoneticisi';
import type { SporKompleksiMimarisi } from '../scene/SporKompleksiMimarisi';
import type {
  AktifBransModu,
  KaynakTemizlenebilir,
  TramplenAkrobasiTipi,
  TramplenSkorboardVerisi,
  YuzmeSkorboardVerisi,
} from '../types/simulation';

export type YuzmeOyunAsamasi = 'bosta' | 'hazir_bekle' | 'yuzuyor' | 'bitti';
export type TramplenOyunAsamasi =
  | 'bosta'
  | 'kulede'
  | 'havada'
  | 'suya_yaklasti'
  | 'tamamlandi'
  | 'turnuva_bitti';

export interface OyunDurumGoruntusu {
  bransModu: AktifBransModu;
  seciliKulvarIndeksi: number;
  ritimKonum: number;
  staminaOrani: number;
  yuzmeAsamasi: YuzmeOyunAsamasi;
  yuzmeSkoru: YuzmeSkorboardVerisi | null;
  tramplenAsamasi: TramplenOyunAsamasi;
  turNo: number;
  toplamTur: number;
  turnuvaToplamPuani: number;
  sonTramplenVerisi: TramplenSkorboardVerisi | null;
  durumMesaji: string;
  coskuSeviyesi: number;
}

const YUZME_KAMERA_KONUM = new THREE.Vector3(14.5, 7.6, -22.0);
const YUZME_KAMERA_BAKIS = new THREE.Vector3(0, 0.8, 0.5);

const TRAMPLEN_KAMERA_KONUM = new THREE.Vector3(-15.5, 11.4, 3.8);
const TRAMPLEN_KAMERA_BAKIS = new THREE.Vector3(1.2, 4.4, 12.6);

const GENEL_KAMERA_KONUM = new THREE.Vector3(19.5, 9.8, -22.5);
const GENEL_KAMERA_BAKIS = new THREE.Vector3(0, 1.5, 0);

/**
 * Galatasaray Olimpik Su Sporları Şampiyonası oyun kurallarını, kamera odağını,
 * skorboard güncellemelerini ve hakem/seyirci tepkilerini orkestre eder.
 */
export class OyunYoneticisi implements KaynakTemizlenebilir {
  private readonly cisimYoneticisi: CisimYoneticisi;
  private readonly sporKompleksi: SporKompleksiMimarisi;
  private readonly kalabalikVeHakemler: ArenaKalabalikVeHakemler;
  private readonly sahneYoneticisi: SahneYoneticisi;

  private bransModu: AktifBransModu = 'bekleme';
  private seciliKulvarIndeksi = 3;
  private ritimKonum = 0.5;
  private staminaOrani = 1.0;

  private yuzmeAsamasi: YuzmeOyunAsamasi = 'bosta';
  private yuzmeSkoru: YuzmeSkorboardVerisi | null = null;

  private tramplenAsamasi: TramplenOyunAsamasi = 'bosta';
  private turNo = 1;
  private readonly toplamTur = 3;
  private turnuvaToplamPuani = 0;
  private sonTramplenVerisi: TramplenSkorboardVerisi | null = null;

  private durumMesaji = 'Branş seçerek yarışmayı veya serbest havuzu başlatın.';
  private coskuSeviyesi = 0.35;
  private skorboardGuncellemeSayaci = 0;

  constructor(
    cisimYoneticisi: CisimYoneticisi,
    sporKompleksi: SporKompleksiMimarisi,
    kalabalikVeHakemler: ArenaKalabalikVeHakemler,
    sahneYoneticisi: SahneYoneticisi,
  ) {
    this.cisimYoneticisi = cisimYoneticisi;
    this.sporKompleksi = sporKompleksi;
    this.kalabalikVeHakemler = kalabalikVeHakemler;
    this.sahneYoneticisi = sahneYoneticisi;
    this.sporKompleksi.beklemeSkorboardGoster();
  }

  /**
   * Üst oyun çubuğundan veya sağ panelden aktif spor branşını değiştirir.
   */
  public bransSec(mod: AktifBransModu): void {
    this.bransModu = mod;
    this.skorboardGuncellemeSayaci = 0;

    if (mod === 'yuzme_yarisi') {
      this.cisimYoneticisi.beklemeModunaGec();
      this.yuzmeAsamasi = 'bosta';
      this.staminaOrani = 1.0;
      this.yuzmeSkoru = this.cisimYoneticisi.yuzmeSkorboardVerisiUret();
      this.sporKompleksi.yuzmeSkorboardGuncelle(this.yuzmeSkoru);
      this.sahneYoneticisi.kameraOdakAyarla(YUZME_KAMERA_KONUM, YUZME_KAMERA_BAKIS);
      this.durumMesaji = `Kulvar ${this.seciliKulvarIndeksi + 1} seçili. Yarışı Başlat ile suya atlayın!`;
      return;
    }

    if (mod === 'tramplen_atlayisi') {
      this.tramplenOyunuHazirla(true);
      this.sahneYoneticisi.kameraOdakAyarla(TRAMPLEN_KAMERA_KONUM, TRAMPLEN_KAMERA_BAKIS);
      this.durumMesaji = '10m Kule Kupası: Güç barı ortadayken Sıçra, havada figür yap ve girişi kilitle!';
      return;
    }

    if (mod === 'serbest_havuz') {
      this.cisimYoneticisi.serbestHavuzModunaGec();
      this.sporKompleksi.beklemeSkorboardGoster();
      this.sahneYoneticisi.kameraOdakAyarla(GENEL_KAMERA_KONUM, GENEL_KAMERA_BAKIS);
      this.yuzmeAsamasi = 'bosta';
      this.tramplenAsamasi = 'bosta';
      this.durumMesaji = 'Serbest havuz modu aktif: Cisim veya sporcuları sürükleyip fizik deneyleri yapın.';
      return;
    }

    this.cisimYoneticisi.beklemeModunaGec();
    this.sporKompleksi.beklemeSkorboardGoster();
    this.yuzmeAsamasi = 'bosta';
    this.tramplenAsamasi = 'bosta';
    this.durumMesaji = 'Galatasaray Olimpik Havuz hazır.';
  }

  public yuzmeKulvarSec(kulvarIndeksi: number): void {
    this.seciliKulvarIndeksi = THREE.MathUtils.clamp(kulvarIndeksi, 0, 5);
    if (this.bransModu === 'yuzme_yarisi' && this.yuzmeAsamasi === 'bosta') {
      this.durumMesaji = `Kulvar ${this.seciliKulvarIndeksi + 1} seçildi. Başlamak için Yarışı Başlat'a basın.`;
    }
  }

  /**
   * 6 kulvar yüzme yarışını başlatır (oyuncu kontrollü veya sağ panelden otomatik izleme).
   */
  public yuzmeYarisiBaslat(otomatikMi = false): void {
    this.bransModu = 'yuzme_yarisi';
    this.staminaOrani = 1.0;
    this.skorboardGuncellemeSayaci = 0;

    this.cisimYoneticisi.yuzmeYarisiniBaslat(
      otomatikMi ? null : this.seciliKulvarIndeksi,
      otomatikMi,
    );
    this.kalabalikVeHakemler.starterDudukCalTetikle();
    this.sahneYoneticisi.kameraOdakAyarla(YUZME_KAMERA_KONUM, YUZME_KAMERA_BAKIS);

    this.yuzmeAsamasi = otomatikMi ? 'yuzuyor' : 'hazir_bekle';
    this.coskuSeviyesi = 0.88;
    this.yuzmeSkoru = this.cisimYoneticisi.yuzmeSkorboardVerisiUret();
    this.sporKompleksi.yuzmeSkorboardGuncelle(this.yuzmeSkoru);

    this.durumMesaji = otomatikMi
      ? '6 kulvar Galatasaray yüzme yarışı başladı!'
      : 'Düdük çaldı! Bloktan fırlamak için Space veya "Suya Atla / Kulaç At"a basın!';
  }

  /**
   * Yüzme yarışı oyununda Space veya aksiyon butonuna basıldığında çıkış veya kulaç uygular.
   */
  public yuzmeAksiyonuUygula(): void {
    if (this.bransModu !== 'yuzme_yarisi') return;

    if (this.yuzmeAsamasi === 'bosta' || this.yuzmeAsamasi === 'bitti') {
      this.yuzmeYarisiBaslat(false);
      return;
    }

    if (this.yuzmeAsamasi === 'hazir_bekle') {
      const sonuc = this.cisimYoneticisi.oyuncuCikisTetikle();
      if (sonuc.basariliMi) {
        this.yuzmeAsamasi = 'yuzuyor';
        this.durumMesaji = `Harika çıkış (${sonuc.reaksiyonMs} ms)! İmleç ortadayken kulaç ritmini koru.`;
      }
      return;
    }

    if (this.yuzmeAsamasi === 'yuzuyor') {
      const sapma = Math.abs(this.ritimKonum - 0.5);
      const kalite = THREE.MathUtils.clamp(1.12 - sapma * 1.9, 0.25, 1.0);
      this.staminaOrani = Math.max(0.18, this.staminaOrani - (0.045 - kalite * 0.02));
      this.cisimYoneticisi.oyuncuKulacVur(kalite * (0.65 + this.staminaOrani * 0.35));
      this.durumMesaji =
        kalite > 0.82
          ? 'Mükemmel kulaç! Hız artıyor.'
          : kalite > 0.55
            ? 'İyi kulaç temposu.'
            : 'Ritim biraz kaçtı, yeşil bölgeyi yakala!';
    }
  }

  /**
   * 10m tramplen modunu sıfırdan veya sıradaki atlayış turu için hazırlar.
   */
  public tramplenOyunuHazirla(yeniTurnuvaMi = true): void {
    this.bransModu = 'tramplen_atlayisi';
    if (yeniTurnuvaMi) {
      this.turNo = 1;
      this.turnuvaToplamPuani = 0;
      this.sonTramplenVerisi = null;
      this.cisimYoneticisi.tramplenSayaciniSifirla();
    }

    this.cisimYoneticisi.tramplenAtlayisiniHazirla(false);
    this.tramplenAsamasi = 'kulede';
    this.coskuSeviyesi = 0.5;

    this.sporKompleksi.tramplenSkorboardGuncelle({
      sporcuAdi: 'C. Yildiz (GS)',
      atlayisNo: this.turNo,
      toplamAtlayis: this.toplamTur,
      hareketAdi: '10m Kule Atlayisa Hazir',
      zorlukDerecesi: 3.0,
      hakemPuanlari: [0, 0, 0, 0, 0],
      atlayisPuani: 0,
      toplamPuan: this.turnuvaToplamPuani,
      durumMetni: '10M KULE HAZIR • SICRAMA BEKLENIYOR',
    });
  }

  /**
   * Sağ panelden veya oyun içinden tek tıkla 10m tramplen atlayışını başlatır.
   */
  public tramplenAtlayisiBaslat(otomatikMi = true): void {
    this.bransModu = 'tramplen_atlayisi';
    this.cisimYoneticisi.tramplenAtlayisiniHazirla(otomatikMi);
    this.sahneYoneticisi.kameraOdakAyarla(TRAMPLEN_KAMERA_KONUM, TRAMPLEN_KAMERA_BAKIS);
    this.tramplenAsamasi = otomatikMi ? 'havada' : 'kulede';
    this.coskuSeviyesi = 0.78;
    this.durumMesaji = otomatikMi
      ? '10m kuleden atlayış başladı! Hakemler suya giriş anında puan verecek.'
      : 'Tur hazır! Güç barı ortadayken Sıçra butonuna basın.';
  }

  public tramplenSicra(akrobasi: TramplenAkrobasiTipi = 'kugu'): void {
    if (this.bransModu !== 'tramplen_atlayisi' || this.tramplenAsamasi !== 'kulede') {
      return;
    }

    const sapma = Math.abs(this.ritimKonum - 0.5);
    const gucOrani = THREE.MathUtils.clamp(1.0 - sapma * 1.65, 0.25, 1.0);
    if (this.cisimYoneticisi.tramplenSicramaBaslat(gucOrani, akrobasi)) {
      this.tramplenAsamasi = 'havada';
      this.coskuSeviyesi = 0.78;
      this.durumMesaji = 'Havadasın! 1-2-3 ile figür seç, suya yaklaşırken Girişi Kilitle!';
    }
  }

  public tramplenAkrobasiYap(akrobasi: TramplenAkrobasiTipi): void {
    if (this.bransModu !== 'tramplen_atlayisi') return;
    if (this.cisimYoneticisi.tramplenAkrobasiSec(akrobasi)) {
      const etiket =
        akrobasi === 'tam_salto'
          ? 'Çift Salto'
          : akrobasi === 'kirik_pike'
            ? 'Kırık Pike'
            : 'Kuğu Dalış';
      this.durumMesaji = `${etiket} uygulandı! Şimdi dikey girişe hazırlan.`;
    }
  }

  public tramplenGirisKilitle(): void {
    if (this.bransModu !== 'tramplen_atlayisi') return;
    if (this.cisimYoneticisi.tramplenGirisKilitle()) {
      this.durumMesaji = 'Dikey ok girişi kilitlendi! Hakemler suyu ve açıyı değerlendiriyor...';
    }
  }

  public siradakiTramplenTuru(): void {
    if (this.tramplenAsamasi === 'turnuva_bitti') {
      this.tramplenOyunuHazirla(true);
      this.durumMesaji = 'Yeni 3 atlayışlık 10m Kule Kupası başladı!';
      return;
    }

    this.turNo = Math.min(this.toplamTur, this.turNo + 1);
    this.tramplenOyunuHazirla(false);
    this.durumMesaji = `${this.turNo}/${this.toplamTur}. atlayış hazır! Sıçrama zamanlamasını ayarla.`;
  }

  /**
   * Oyun zamanlayıcısını, skorboard güncellemelerini ve hakem/seyirci senkronizasyonunu yürütür.
   */
  public guncelle(dt: number, gecenSure: number): void {
    const ritimHizi = this.bransModu === 'yuzme_yarisi' ? 3.2 : 2.55;
    this.ritimKonum = 0.5 + 0.5 * Math.sin(gecenSure * ritimHizi);
    this.coskuSeviyesi = Math.max(0.28, this.coskuSeviyesi - dt * 0.12);

    if (this.bransModu === 'yuzme_yarisi' && this.yuzmeAsamasi !== 'bosta') {
      this.staminaOrani = Math.min(1.0, this.staminaOrani + dt * 0.035);

      const guncelSkor = this.cisimYoneticisi.yuzmeSkorboardVerisiUret();
      this.yuzmeSkoru = guncelSkor;

      if (
        this.yuzmeAsamasi === 'hazir_bekle' &&
        this.cisimYoneticisi.yuzmeSkorboardVerisiUret().kronometreSaniye > 1.7
      ) {
        this.yuzmeAsamasi = 'yuzuyor';
      }

      const tumuBittiMi = guncelSkor.satirlar.every((s) => s.bitirdiMi);
      if (tumuBittiMi && this.yuzmeAsamasi !== 'bitti') {
        this.yuzmeAsamasi = 'bitti';
        this.coskuSeviyesi = 1.0;
        const birinci = guncelSkor.satirlar[0];
        this.durumMesaji = `Yarış Bitti! 1. ${birinci.sporcuAdi} (${birinci.dereceSaniye?.toFixed(2)}s • ${birinci.puan} puan)`;
      }

      this.skorboardGuncellemeSayaci += dt;
      if (this.skorboardGuncellemeSayaci >= 0.18 || tumuBittiMi) {
        this.skorboardGuncellemeSayaci = 0;
        this.sporKompleksi.yuzmeSkorboardGuncelle(guncelSkor);
      }
    }

    if (this.bransModu === 'tramplen_atlayisi') {
      const faz = this.cisimYoneticisi.tramplenFaziGetir();
      const yukseklik = this.cisimYoneticisi.tramplenMankenYGetir();

      if (
        (faz === 'tramplen_ucus' || faz === 'tramplen_kugu' || faz === 'tramplen_ok') &&
        yukseklik < 6.0 &&
        yukseklik > 0.35
      ) {
        this.tramplenAsamasi = 'suya_yaklasti';
      } else if (faz === 'tramplen_ucus' || faz === 'tramplen_kugu') {
        this.tramplenAsamasi = 'havada';
      }

      const tazeSonuc = this.cisimYoneticisi.yeniTramplenSonucunuAl();
      if (tazeSonuc) {
        this.turnuvaToplamPuani = Number(
          (this.turnuvaToplamPuani + tazeSonuc.atlayisPuani).toFixed(2),
        );
        const birlesikSonuc: TramplenSkorboardVerisi = {
          ...tazeSonuc,
          atlayisNo: this.turNo,
          toplamAtlayis: this.toplamTur,
          toplamPuan: this.turnuvaToplamPuani,
        };
        this.sonTramplenVerisi = birlesikSonuc;
        this.sporKompleksi.tramplenSkorboardGuncelle(birlesikSonuc);
        this.kalabalikVeHakemler.hakemMasasiPuanlariniGoster(birlesikSonuc.hakemPuanlari);
        this.coskuSeviyesi = 1.0;

        this.tramplenAsamasi =
          this.turNo >= this.toplamTur ? 'turnuva_bitti' : 'tamamlandi';
        this.durumMesaji =
          this.tramplenAsamasi === 'turnuva_bitti'
            ? `Kupa Tamamlandı! Final Toplam Puan: ${this.turnuvaToplamPuani.toFixed(2)}`
            : `Tur ${this.turNo} Puanı: ${birlesikSonuc.atlayisPuani.toFixed(2)} — Hakem tabelaları yükseldi!`;
      }
    }
  }

  public goruntuGetir(): OyunDurumGoruntusu {
    return {
      bransModu: this.bransModu,
      seciliKulvarIndeksi: this.seciliKulvarIndeksi,
      ritimKonum: this.ritimKonum,
      staminaOrani: this.staminaOrani,
      yuzmeAsamasi: this.yuzmeAsamasi,
      yuzmeSkoru: this.yuzmeSkoru,
      tramplenAsamasi: this.tramplenAsamasi,
      turNo: this.turNo,
      toplamTur: this.toplamTur,
      turnuvaToplamPuani: this.turnuvaToplamPuani,
      sonTramplenVerisi: this.sonTramplenVerisi,
      durumMesaji: this.durumMesaji,
      coskuSeviyesi: this.coskuSeviyesi,
    };
  }

  public temizle(): void {
    this.yuzmeSkoru = null;
    this.sonTramplenVerisi = null;
  }
}
