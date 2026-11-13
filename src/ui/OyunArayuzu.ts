import type { OyunDurumGoruntusu, OyunYoneticisi } from '../game/OyunYoneticisi';
import type { AktifBransModu, KaynakTemizlenebilir } from '../types/simulation';

interface OlayKaydi {
  hedef: EventTarget;
  olay: string;
  dinleyici: EventListener;
}

/**
 * Galatasaray Olimpik Su Sporları Şampiyonası için üst branş çubuğu
 * ve oynanabilir yüzme / 10m tramplen HUD arayüzünü yönetir.
 */
export class OyunArayuzu implements KaynakTemizlenebilir {
  private readonly oyunYoneticisi: OyunYoneticisi;
  private readonly hudKatmani: HTMLDivElement;
  private readonly modButonlari: Map<AktifBransModu, HTMLButtonElement> = new Map();

  private readonly altPanel: HTMLElement;
  private readonly baslikEleman: HTMLSpanElement;
  private readonly durumEtiketi: HTMLSpanElement;
  private readonly aciklamaEleman: HTMLDivElement;
  private readonly kulvarSatiri: HTMLDivElement;
  private readonly kulvarButonlari: HTMLButtonElement[] = [];

  private readonly ritimSatiri: HTMLDivElement;
  private readonly ritimImleci: HTMLDivElement;
  private readonly anaAksiyonButon: HTMLButtonElement;
  private readonly ikincilButon: HTMLButtonElement;

  private readonly akrobasiSatiri: HTMLDivElement;
  private readonly kuguButon: HTMLButtonElement;
  private readonly pikeButon: HTMLButtonElement;
  private readonly saltoButon: HTMLButtonElement;
  private readonly girisKilitleButon: HTMLButtonElement;

  private readonly hakemKartSatiri: HTMLDivElement;
  private readonly hakemPuanSpans: HTMLSpanElement[] = [];
  private readonly sonucOzetiEleman: HTMLDivElement;

  private readonly olayKayitlari: OlayKaydi[] = [];
  private sonImlecYuzde = -1;

  constructor(kokEleman: HTMLElement, oyunYoneticisi: OyunYoneticisi) {
    this.oyunYoneticisi = oyunYoneticisi;

    this.hudKatmani = document.createElement('div');
    this.hudKatmani.className = 'oyun-hud-katmani';

    // 1. Üst sol branş seçim çubuğu
    const modCubugu = document.createElement('nav');
    modCubugu.className = 'oyun-mod-cubugu';
    modCubugu.setAttribute('aria-label', 'Spor Branşı Seçimi');

    const modlar: readonly { mod: AktifBransModu; etiket: string }[] = [
      { mod: 'yuzme_yarisi', etiket: '🏊 Yüzme Yarışı Oyunu' },
      { mod: 'tramplen_atlayisi', etiket: '🤸 10m Tramplen Kupası' },
      { mod: 'serbest_havuz', etiket: '🌊 Serbest Havuz' },
    ];

    for (const { mod, etiket } of modlar) {
      const buton = document.createElement('button');
      buton.type = 'button';
      buton.className = 'oyun-mod-buton';
      buton.textContent = etiket;
      this.olayEkle(buton, 'click', () => {
        this.oyunYoneticisi.bransSec(mod);
        this.guncelle();
      });
      this.modButonlari.set(mod, buton);
      modCubugu.appendChild(buton);
    }

    // 2. Alt oyun kontrol paneli (sadece oyun branşlarında açılır)
    this.altPanel = document.createElement('section');
    this.altPanel.className = 'oyun-alt-panel gizli';

    const baslikSatiri = document.createElement('div');
    baslikSatiri.className = 'oyun-baslik-satiri';
    this.baslikEleman = document.createElement('span');
    this.baslikEleman.className = 'oyun-baslik';
    this.durumEtiketi = document.createElement('span');
    this.durumEtiketi.className = 'oyun-durum-etiketi';
    baslikSatiri.append(this.baslikEleman, this.durumEtiketi);

    this.aciklamaEleman = document.createElement('div');
    this.aciklamaEleman.style.fontSize = '12px';
    this.aciklamaEleman.style.color = '#cbd5e1';

    // Kulvar seçim satırı (Yüzme)
    this.kulvarSatiri = document.createElement('div');
    this.kulvarSatiri.className = 'oyun-kontrol-satiri';
    for (let k = 0; k < 6; k++) {
      const kBtn = document.createElement('button');
      kBtn.type = 'button';
      kBtn.className = 'oyun-ikincil-buton';
      kBtn.textContent = `Kulvar ${k + 1}`;
      this.olayEkle(kBtn, 'click', () => {
        this.oyunYoneticisi.yuzmeKulvarSec(k);
        this.guncelle();
      });
      this.kulvarButonlari.push(kBtn);
      this.kulvarSatiri.appendChild(kBtn);
    }

    // Ortak ritim / güç çubuğu ve ana aksiyon satırı
    this.ritimSatiri = document.createElement('div');
    this.ritimSatiri.className = 'oyun-kontrol-satiri';

    const ritimAlani = document.createElement('div');
    ritimAlani.className = 'oyun-ritim-alani';
    const yesilBolge = document.createElement('div');
    yesilBolge.className = 'oyun-ritim-yesil-bolge';
    this.ritimImleci = document.createElement('div');
    this.ritimImleci.className = 'oyun-ritim-imlec';
    ritimAlani.append(yesilBolge, this.ritimImleci);

    this.anaAksiyonButon = document.createElement('button');
    this.anaAksiyonButon.type = 'button';
    this.anaAksiyonButon.className = 'oyun-aksiyon-buton';
    this.olayEkle(this.anaAksiyonButon, 'click', () => {
      this.anaAksiyonTiklandi();
    });

    this.ikincilButon = document.createElement('button');
    this.ikincilButon.type = 'button';
    this.ikincilButon.className = 'oyun-ikincil-buton';
    this.ikincilButon.textContent = '🔄 Yeniden Başlat';
    this.olayEkle(this.ikincilButon, 'click', () => {
      const goruntu = this.oyunYoneticisi.goruntuGetir();
      if (goruntu.bransModu === 'yuzme_yarisi') {
        this.oyunYoneticisi.yuzmeYarisiBaslat(false);
      } else if (goruntu.bransModu === 'tramplen_atlayisi') {
        this.oyunYoneticisi.tramplenOyunuHazirla(true);
      }
      this.guncelle();
    });

    this.ritimSatiri.append(ritimAlani, this.anaAksiyonButon, this.ikincilButon);

    // Akrobasi + dikey giriş satırı (10m Tramplen havada)
    this.akrobasiSatiri = document.createElement('div');
    this.akrobasiSatiri.className = 'oyun-kontrol-satiri';

    this.kuguButon = this.akrobasiButonuOlustur('1 • Kuğu Dalış', () => {
      this.oyunYoneticisi.tramplenAkrobasiYap('kugu');
    });
    this.pikeButon = this.akrobasiButonuOlustur('2 • Kırık Pike', () => {
      this.oyunYoneticisi.tramplenAkrobasiYap('kirik_pike');
    });
    this.saltoButon = this.akrobasiButonuOlustur('3 • Çift Salto', () => {
      this.oyunYoneticisi.tramplenAkrobasiYap('tam_salto');
    });

    this.girisKilitleButon = document.createElement('button');
    this.girisKilitleButon.type = 'button';
    this.girisKilitleButon.className = 'oyun-aksiyon-buton';
    this.girisKilitleButon.textContent = '🎯 Dikey Girişi Kilitle (Space)';
    this.olayEkle(this.girisKilitleButon, 'click', () => {
      this.oyunYoneticisi.tramplenGirisKilitle();
    });

    this.akrobasiSatiri.append(
      this.kuguButon,
      this.pikeButon,
      this.saltoButon,
      this.girisKilitleButon,
    );

    // 5 hakemlik puan kartları (10m Tramplen sonucu)
    this.hakemKartSatiri = document.createElement('div');
    this.hakemKartSatiri.className = 'oyun-hakem-kartlari';
    for (let h = 0; h < 5; h++) {
      const kart = document.createElement('div');
      kart.className = 'oyun-hakem-karti';
      const etiket = document.createElement('span');
      etiket.className = 'oyun-hakem-etiket';
      etiket.textContent = `HAKEM ${h + 1}`;
      const puan = document.createElement('span');
      puan.className = 'oyun-hakem-puan';
      puan.textContent = '--';
      this.hakemPuanSpans.push(puan);
      kart.append(etiket, puan);
      this.hakemKartSatiri.appendChild(kart);
    }

    // Yarış / Kupa sonuç özeti
    this.sonucOzetiEleman = document.createElement('div');
    this.sonucOzetiEleman.className = 'oyun-sonuc-ozet';

    this.altPanel.append(
      baslikSatiri,
      this.aciklamaEleman,
      this.kulvarSatiri,
      this.ritimSatiri,
      this.akrobasiSatiri,
      this.hakemKartSatiri,
      this.sonucOzetiEleman,
    );

    this.hudKatmani.append(modCubugu, this.altPanel);
    kokEleman.appendChild(this.hudKatmani);

    // Klavye kısayolları (Space + 1/2/3 akrobasi)
    this.olayEkle(window, 'keydown', (ev: Event) => {
      const ke = ev as KeyboardEvent;
      if (
        ke.target instanceof HTMLInputElement ||
        ke.target instanceof HTMLTextAreaElement ||
        ke.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const durum = this.oyunYoneticisi.goruntuGetir();
      if (durum.bransModu !== 'yuzme_yarisi' && durum.bransModu !== 'tramplen_atlayisi') {
        return;
      }

      if (ke.code === 'Space') {
        ke.preventDefault();
        this.anaAksiyonTiklandi();
      } else if (durum.bransModu === 'tramplen_atlayisi') {
        if (ke.key === '1') this.oyunYoneticisi.tramplenAkrobasiYap('kugu');
        else if (ke.key === '2') this.oyunYoneticisi.tramplenAkrobasiYap('kirik_pike');
        else if (ke.key === '3') this.oyunYoneticisi.tramplenAkrobasiYap('tam_salto');
      }
    });

    this.guncelle();
  }

  private akrobasiButonuOlustur(etiket: string, islem: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oyun-ikincil-buton';
    btn.textContent = etiket;
    this.olayEkle(btn, 'click', islem);
    return btn;
  }

  private anaAksiyonTiklandi(): void {
    const durum = this.oyunYoneticisi.goruntuGetir();
    if (durum.bransModu === 'yuzme_yarisi') {
      this.oyunYoneticisi.yuzmeAksiyonuUygula();
    } else if (durum.bransModu === 'tramplen_atlayisi') {
      if (durum.tramplenAsamasi === 'kulede') {
        this.oyunYoneticisi.tramplenSicra('kugu');
      } else if (
        durum.tramplenAsamasi === 'havada' ||
        durum.tramplenAsamasi === 'suya_yaklasti'
      ) {
        this.oyunYoneticisi.tramplenGirisKilitle();
      } else if (
        durum.tramplenAsamasi === 'tamamlandi' ||
        durum.tramplenAsamasi === 'turnuva_bitti'
      ) {
        this.oyunYoneticisi.siradakiTramplenTuru();
      }
    }
    this.guncelle();
  }

  private olayEkle(hedef: EventTarget, olay: string, dinleyici: EventListener): void {
    hedef.addEventListener(olay, dinleyici);
    this.olayKayitlari.push({ hedef, olay, dinleyici });
  }

  /**
   * Oyun yöneticisindeki anlık duruma göre HUD elemanlarını günceller.
   */
  public guncelle(): void {
    const durum = this.oyunYoneticisi.goruntuGetir();

    for (const [mod, btn] of this.modButonlari) {
      btn.classList.toggle('aktif', durum.bransModu === mod);
    }

    const oyunAcikMi =
      durum.bransModu === 'yuzme_yarisi' || durum.bransModu === 'tramplen_atlayisi';
    this.altPanel.classList.toggle('gizli', !oyunAcikMi);
    if (!oyunAcikMi) {
      return;
    }

    const imlecYuzde = Math.round(durum.ritimKonum * 100);
    if (imlecYuzde !== this.sonImlecYuzde) {
      this.sonImlecYuzde = imlecYuzde;
      this.ritimImleci.style.left = `${imlecYuzde}%`;
    }

    this.aciklamaEleman.textContent = durum.durumMesaji;

    if (durum.bransModu === 'yuzme_yarisi') {
      this.yuzmeHudGuncelle(durum);
    } else {
      this.tramplenHudGuncelle(durum);
    }
  }

  private yuzmeHudGuncelle(durum: OyunDurumGoruntusu): void {
    this.baslikEleman.textContent = '🏊 GALATASARAY 32m SERBEST YÜZME YARIŞI';
    const staminaYuzde = Math.round(durum.staminaOrani * 100);
    const kronometre = durum.yuzmeSkoru?.kronometreSaniye ?? 0;
    this.durumEtiketi.textContent =
      durum.yuzmeAsamasi === 'bosta'
        ? 'HAZIR'
        : `${kronometre.toFixed(2)}s • Enerji %${staminaYuzde}`;

    const kulvarSecilebilirMi = durum.yuzmeAsamasi === 'bosta';
    this.kulvarSatiri.style.display = kulvarSecilebilirMi ? 'flex' : 'none';
    for (let k = 0; k < this.kulvarButonlari.length; k++) {
      const seciliMi = durum.seciliKulvarIndeksi === k;
      this.kulvarButonlari[k].style.borderColor = seciliMi ? '#fdb912' : '';
      this.kulvarButonlari[k].style.color = seciliMi ? '#fdb912' : '';
    }

    this.ritimSatiri.style.display = 'flex';
    this.akrobasiSatiri.style.display = 'none';
    this.hakemKartSatiri.style.display = 'none';

    if (durum.yuzmeAsamasi === 'bosta') {
      this.anaAksiyonButon.textContent = '🏁 Yarışı Başlat (Space)';
    } else if (durum.yuzmeAsamasi === 'hazir_bekle') {
      this.anaAksiyonButon.textContent = '🚀 Bloktan Suya Atla (Space)';
    } else if (durum.yuzmeAsamasi === 'yuzuyor') {
      this.anaAksiyonButon.textContent = '⚡ Kulaç At (Space)';
    } else {
      this.anaAksiyonButon.textContent = '🏆 Yeni Yarış Başlat (Space)';
    }
    this.anaAksiyonButon.disabled = false;

    if (durum.yuzmeAsamasi === 'bitti' && durum.yuzmeSkoru) {
      this.sonucOzetiEleman.style.display = 'flex';
      const ilkUc = durum.yuzmeSkoru.satirlar
        .slice(0, 3)
        .map(
          (s) =>
            `${s.sira}. ${s.sporcuAdi} — ${(s.dereceSaniye ?? 0).toFixed(2)}s (${s.puan} puan)`,
        )
        .join('  •  ');
      this.sonucOzetiEleman.textContent = `Podyum: ${ilkUc}`;
    } else {
      this.sonucOzetiEleman.style.display = 'none';
    }
  }

  private tramplenHudGuncelle(durum: OyunDurumGoruntusu): void {
    this.baslikEleman.textContent = `🤸 10m KULE KUPASI • TUR ${durum.turNo}/${durum.toplamTur}`;
    this.durumEtiketi.textContent = `TOPLAM ${durum.turnuvaToplamPuani.toFixed(1)} PUAN`;

    this.kulvarSatiri.style.display = 'none';
    this.ritimSatiri.style.display = 'flex';

    const havadaMi =
      durum.tramplenAsamasi === 'havada' || durum.tramplenAsamasi === 'suya_yaklasti';
    this.akrobasiSatiri.style.display = havadaMi ? 'flex' : 'none';

    const girisKilidiEtkin =
      durum.tramplenAsamasi === 'havada' || durum.tramplenAsamasi === 'suya_yaklasti';
    this.kuguButon.disabled = !havadaMi;
    this.pikeButon.disabled = !havadaMi;
    this.saltoButon.disabled = !havadaMi;
    this.girisKilitleButon.disabled = !girisKilidiEtkin;

    if (durum.tramplenAsamasi === 'kulede') {
      this.anaAksiyonButon.textContent = '🚀 Güçle Sıçra (Space)';
      this.anaAksiyonButon.disabled = false;
    } else if (havadaMi) {
      this.anaAksiyonButon.textContent = '🎯 Dikey Girişi Kilitle (Space)';
      this.anaAksiyonButon.disabled = false;
    } else if (durum.tramplenAsamasi === 'tamamlandi') {
      this.anaAksiyonButon.textContent = `➡️ ${durum.turNo + 1}. Tura Geç (Space)`;
      this.anaAksiyonButon.disabled = false;
    } else if (durum.tramplenAsamasi === 'turnuva_bitti') {
      this.anaAksiyonButon.textContent = '🏆 Yeni Kupa Başlat (Space)';
      this.anaAksiyonButon.disabled = false;
    } else {
      this.anaAksiyonButon.textContent = 'Atlayış Devam Ediyor...';
      this.anaAksiyonButon.disabled = true;
    }

    if (durum.sonTramplenVerisi && durum.sonTramplenVerisi.hakemPuanlari.length === 5) {
      this.hakemKartSatiri.style.display = 'flex';
      for (let h = 0; h < 5; h++) {
        this.hakemPuanSpans[h].textContent =
          durum.sonTramplenVerisi.hakemPuanlari[h].toFixed(1);
      }
      this.sonucOzetiEleman.style.display = 'flex';
      this.sonucOzetiEleman.textContent = `${durum.sonTramplenVerisi.hareketAdi} (DD ${durum.sonTramplenVerisi.zorlukDerecesi.toFixed(1)}) • Tur Puanı: ${durum.sonTramplenVerisi.atlayisPuani.toFixed(2)} • Kupa Toplamı: ${durum.turnuvaToplamPuani.toFixed(2)}`;
    } else {
      this.hakemKartSatiri.style.display = 'none';
      this.sonucOzetiEleman.style.display = 'none';
    }
  }

  public temizle(): void {
    for (const kayit of this.olayKayitlari) {
      kayit.hedef.removeEventListener(kayit.olay, kayit.dinleyici);
    }
    this.olayKayitlari.length = 0;
    this.hudKatmani.remove();
  }
}
