import * as THREE from 'three';
import {
  dunyaXZdenUVye,
  enYakinKulvarMerkeziX,
  HAVUZ_SABITLERI,
  type SuDarbesiVerisi,
  type SuYuksekligiSorguFonksiyonu,
  type YuzmeDurumModu,
} from '../types/simulation';
import type { SuCismiTaban } from '../entities/SuCismiTaban';
import { YuzucuManken } from '../entities/YuzucuManken';

const DUNYA_YUKARI = new THREE.Vector3(0, 1, 0);

interface YuzucuKulvarDurumu {
  hedefZIsareti: 1 | -1;
  donusYonu: 1 | -1;
}

/**
 * Çok noktalı Arşimet kaldırma kuvveti, 10m dalış frenlemesi,
 * Olimpik kulvar yüzmesi ve havuz duvar/taban çarpışmalarını hesaplayan fizik motoru.
 */
export class ArsimetFizikMotoru {
  private readonly geciciDunyaNokta = new THREE.Vector3();
  private readonly geciciKol = new THREE.Vector3();
  private readonly geciciKaldirma = new THREE.Vector3();
  private readonly geciciTork = new THREE.Vector3();

  private readonly toplamKuvvet = new THREE.Vector3();
  private readonly toplamTork = new THREE.Vector3();

  private readonly geciciSirt = new THREE.Vector3();
  private readonly geciciIleri = new THREE.Vector3();
  private readonly geciciYatayIleri = new THREE.Vector3();
  private readonly geciciHedefYon = new THREE.Vector3();
  private readonly geciciKepceHedef = new THREE.Vector3();
  private readonly geciciKepceEkseni = new THREE.Vector3();
  private readonly geciciDogrultmaEkseni = new THREE.Vector3();

  private readonly geciciTersYonelim = new THREE.Quaternion();
  private readonly geciciYerelTork = new THREE.Vector3();
  private readonly geciciAcisalIvme = new THREE.Vector3();
  private readonly geciciDonmeEkseni = new THREE.Vector3();
  private readonly geciciDeltaYonelim = new THREE.Quaternion();
  private readonly geciciRotasyonMatrisi = new THREE.Matrix4();

  private readonly oncekiBatanOranlari = new WeakMap<SuCismiTaban, number>();
  private readonly kulvarDurumlari = new WeakMap<SuCismiTaban, YuzucuKulvarDurumu>();

  /**
   * Verilen cismi 2 sabit alt adımda ilerletir ve suya yüksek hızla girişte splash darbesi üretir.
   */
  public adimla(
    cisim: SuCismiTaban,
    dt: number,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
    durumModu: YuzmeDurumModu,
  ): SuDarbesiVerisi[] {
    const darbeler: SuDarbesiVerisi[] = [];

    if (cisim.fizikKilitliMi) {
      cisim.batanHacimOrani = 0;
      this.oncekiBatanOranlari.set(cisim, 0);
      this.kulvarDurumlari.delete(cisim);
      cisim.donusumuSenkronizeEt();
      return darbeler;
    }

    const sinirliDt = Math.min(Math.max(dt, 0), 0.033);

    if (cisim.tutuluyorMu || sinirliDt <= 0) {
      if (cisim.tutuluyorMu) {
        this.kulvarDurumlari.delete(cisim);
      }
      cisim.batanHacimOrani = this.sadeceBatmaOraniHesapla(cisim, suYuksekligiSorgula);
      this.oncekiBatanOranlari.set(cisim, cisim.batanHacimOrani);
      cisim.donusumuSenkronizeEt();
      return darbeler;
    }

    const altAdimSayisi = 2;
    const altDt = sinirliDt / altAdimSayisi;

    for (let adim = 0; adim < altAdimSayisi; adim++) {
      const oncekiBatmaOrani = this.oncekiBatanOranlari.get(cisim) ?? cisim.batanHacimOrani;
      const yeniBatmaOrani = this.tekAltAdimCalistir(
        cisim,
        altDt,
        suYuksekligiSorgula,
        durumModu,
      );

      // Suya yüksekten giriş anında hıza orantılı büyük splash (10m dalışında -0.30'a kadar)
      const suyaSertGiris =
        oncekiBatmaOrani < 0.10 &&
        yeniBatmaOrani >= 0.10 &&
        cisim.hiz.y < -0.5;

      if (suyaSertGiris) {
        const uv = dunyaXZdenUVye(cisim.konum.x, cisim.konum.z);
        const hizSiddeti = Math.abs(cisim.hiz.y);
        darbeler.push({
          uvX: THREE.MathUtils.clamp(uv.u, 0.03, 0.97),
          uvZ: THREE.MathUtils.clamp(uv.v, 0.03, 0.97),
          yaricap: THREE.MathUtils.clamp(0.022 + hizSiddeti * 0.0022, 0.024, 0.056),
          kuvvet: -THREE.MathUtils.clamp(hizSiddeti * 0.022, 0.045, 0.30),
        });
      }

      this.oncekiBatanOranlari.set(cisim, yeniBatmaOrani);
    }

    cisim.donusumuSenkronizeEt();
    return darbeler;
  }

  private sadeceBatmaOraniHesapla(
    cisim: SuCismiTaban,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
  ): number {
    let toplamBatanOran = 0;
    for (const nokta of cisim.hacimNoktalari) {
      this.geciciDunyaNokta
        .copy(nokta.yerelKonum)
        .applyQuaternion(cisim.yonelim)
        .add(cisim.konum);

      const suY = suYuksekligiSorgula(this.geciciDunyaNokta.x, this.geciciDunyaNokta.z);
      const batmaDerinligi = suY - (this.geciciDunyaNokta.y - nokta.propYaricapi);
      const batmaOrani = THREE.MathUtils.clamp(
        batmaDerinligi / (2 * nokta.propYaricapi),
        0,
        1,
      );
      toplamBatanOran += batmaOrani * nokta.hacimAgirligi;
    }
    return THREE.MathUtils.clamp(toplamBatanOran, 0, 1);
  }

  private tekAltAdimCalistir(
    cisim: SuCismiTaban,
    altDt: number,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
    durumModu: YuzmeDurumModu,
  ): number {
    this.toplamKuvvet.set(0, 0, 0);
    this.toplamTork.set(0, 0, 0);

    let toplamBatanOran = 0;

    // 1. Çok noktalı Arşimet kaldırma kuvveti ve tork hesabı
    for (const nokta of cisim.hacimNoktalari) {
      this.geciciDunyaNokta
        .copy(nokta.yerelKonum)
        .applyQuaternion(cisim.yonelim)
        .add(cisim.konum);

      const suY = suYuksekligiSorgula(this.geciciDunyaNokta.x, this.geciciDunyaNokta.z);
      const batmaDerinligi = suY - (this.geciciDunyaNokta.y - nokta.propYaricapi);
      const noktaBatmaOrani = THREE.MathUtils.clamp(
        batmaDerinligi / (2 * nokta.propYaricapi),
        0,
        1,
      );

      toplamBatanOran += noktaBatmaOrani * nokta.hacimAgirligi;

      if (noktaBatmaOrani > 0) {
        const noktaHacmi = cisim.toplamHacim * nokta.hacimAgirligi;
        const kaldirmaY =
          HAVUZ_SABITLERI.SU_YOGUNLUGU *
          noktaHacmi *
          noktaBatmaOrani *
          HAVUZ_SABITLERI.YERCEKIMI;

        this.toplamKuvvet.y += kaldirmaY;

        this.geciciKol.copy(this.geciciDunyaNokta).sub(cisim.konum);
        this.geciciKaldirma.set(0, kaldirmaY, 0);
        this.geciciTork.crossVectors(this.geciciKol, this.geciciKaldirma);
        this.toplamTork.add(this.geciciTork);
      }
    }

    const batanOran = THREE.MathUtils.clamp(toplamBatanOran, 0, 1);
    cisim.batanHacimOrani = batanOran;

    // 2. Yerçekimi kuvveti ('batma' modunda su yoğunluğunun üzerinde efektif yoğunluk sağlanır)
    const efektifYogunluk =
      durumModu === 'batma' ? Math.max(cisim.yogunluk, 1250) : cisim.yogunluk;
    const kutle = Math.max(efektifYogunluk * cisim.toplamHacim, 0.5);
    this.toplamKuvvet.y -= kutle * HAVUZ_SABITLERI.YERCEKIMI;

    // 3. İnsan mankeni için su içi dengeleme, dalış kepçelemesi ve aktif kulvar yüzmesi
    if (cisim instanceof YuzucuManken) {
      if (batanOran > 0.15) {
        this.yuzucuKuvvetVeTorkuUygula(cisim, kutle, batanOran, durumModu);
      } else {
        this.kulvarDurumlari.delete(cisim);
      }
    }

    // 4. Doğrusal ve açısal hız entegrasyonu
    cisim.hiz.addScaledVector(this.toplamKuvvet, altDt / kutle);

    const yerelAtalet = cisim.yerelAtaletMomentiGetir(kutle);
    this.geciciTersYonelim.copy(cisim.yonelim).invert();
    this.geciciYerelTork.copy(this.toplamTork).applyQuaternion(this.geciciTersYonelim);

    this.geciciAcisalIvme.set(
      this.geciciYerelTork.x / Math.max(yerelAtalet.x, 0.2),
      this.geciciYerelTork.y / Math.max(yerelAtalet.y, 0.2),
      this.geciciYerelTork.z / Math.max(yerelAtalet.z, 0.2),
    );
    this.geciciAcisalIvme.applyQuaternion(cisim.yonelim);
    cisim.acisalHiz.addScaledVector(this.geciciAcisalIvme, altDt);

    // 5. Hidrodinamik doğrusal ve açısal su direnci (10m dalış frenlemesi dahil)
    this.hidrodinamikSonumlemeUygula(cisim, batanOran, durumModu, altDt);

    // NaN / patlama güvenlik kontrolü
    this.sayisalGuvenlikUygula(cisim);

    // 6. Konum ve yönelim integrasyonu
    cisim.konum.addScaledVector(cisim.hiz, altDt);

    const acisalHizBuyuklugu = cisim.acisalHiz.length();
    if (acisalHizBuyuklugu > 1e-6) {
      this.geciciDonmeEkseni.copy(cisim.acisalHiz).divideScalar(acisalHizBuyuklugu);
      this.geciciDeltaYonelim.setFromAxisAngle(
        this.geciciDonmeEkseni,
        acisalHizBuyuklugu * altDt,
      );
      cisim.yonelim.premultiply(this.geciciDeltaYonelim).normalize();
    }

    // 7. Havuz duvar ve taban çarpışma tepkisi
    this.duvarSinirlariniCoz(cisim);

    return batanOran;
  }

  private yuzucuKuvvetVeTorkuUygula(
    cisim: YuzucuManken,
    kutle: number,
    batanOran: number,
    durumModu: YuzmeDurumModu,
  ): void {
    this.geciciIleri.set(0, 0, 1).applyQuaternion(cisim.yonelim);
    this.geciciYatayIleri.set(this.geciciIleri.x, 0, this.geciciIleri.z);

    if (this.geciciYatayIleri.lengthSq() > 1e-4) {
      this.geciciYatayIleri.normalize();
    } else {
      this.geciciYatayIleri.set(0, 0, -1);
    }

    // Dalış sonrası veya dik girişte su altı yukarı kepçeleme ve yüzüstü doğrultma torku
    const yuksekHizliDalisMi =
      Math.abs(cisim.hiz.y) > 4.5 ||
      cisim.hiz.length() > 6.0 ||
      this.geciciIleri.y < -0.25;

    if (durumModu === 'aktif_yuzme' || durumModu === 'dengede') {
      this.geciciSirt.set(0, 1, 0).applyQuaternion(cisim.yonelim);
      this.geciciDogrultmaEkseni.crossVectors(this.geciciSirt, DUNYA_YUKARI);
      const sirtKatsayisi = yuksekHizliDalisMi ? 5.6 : 2.8;
      this.toplamTork.addScaledVector(
        this.geciciDogrultmaEkseni,
        kutle * sirtKatsayisi * batanOran,
      );

      // Burun aşağı dalmışsa gövdeyi havuz tabanına çarpmadan yukarı yüzeye kepçele
      if (this.geciciIleri.y < -0.10) {
        this.geciciKepceHedef
          .set(this.geciciYatayIleri.x, 0.28, this.geciciYatayIleri.z)
          .normalize();
        this.geciciKepceEkseni.crossVectors(this.geciciIleri, this.geciciKepceHedef);
        this.toplamTork.addScaledVector(
          this.geciciKepceEkseni,
          kutle * 6.8 * batanOran,
        );
      }
    }

    const hedefKulvarX =
      cisim.atanmisKulvarX !== null
        ? cisim.atanmisKulvarX
        : enYakinKulvarMerkeziX(cisim.konum.x);
    const xSapmasi = hedefKulvarX - cisim.konum.x;

    const hizCarpani = Math.max(0, cisim.hizCarpani);

    // Su altı kelebek kayma fazında ileri süzülme ve kulvar hizalaması
    if (cisim.aktifAnimasyonFazi === 'su_alti_kayma' && durumModu === 'aktif_yuzme') {
      const kaymaItkisi = kutle * 2.1 * batanOran * hizCarpani;
      this.toplamKuvvet.addScaledVector(this.geciciYatayIleri, kaymaItkisi);
      this.toplamKuvvet.x += xSapmasi * kutle * 1.65 * batanOran;
      this.toplamKuvvet.x -= cisim.hiz.x * kutle * 0.55 * batanOran;
      return;
    }

    // Aktif yüzme: atanmış/en yakın olimpik kulvar ekseninde ±Z boyunca gidiş-geliş
    if (
      durumModu === 'aktif_yuzme' &&
      cisim.aktifAnimasyonFazi === 'otomatik' &&
      batanOran > 0.25
    ) {
      let kulvarDurumu = this.kulvarDurumlari.get(cisim);
      if (!kulvarDurumu) {
        kulvarDurumu = {
          hedefZIsareti: this.geciciYatayIleri.z >= 0 ? 1 : -1,
          donusYonu: 1,
        };
        this.kulvarDurumlari.set(cisim, kulvarDurumu);
      }

      const pozitifDonusEsigiZ =
        cisim.maksPozitifZ !== null
          ? cisim.maksPozitifZ
          : HAVUZ_SABITLERI.MAK_Z - 1.15;
      const negatifDonusEsigiZ = -(HAVUZ_SABITLERI.MAK_Z - 1.15);

      if (kulvarDurumu.hedefZIsareti === 1 && cisim.konum.z >= pozitifDonusEsigiZ) {
        kulvarDurumu.hedefZIsareti = -1;
        kulvarDurumu.donusYonu = xSapmasi >= 0 ? 1 : -1;
      } else if (kulvarDurumu.hedefZIsareti === -1 && cisim.konum.z <= negatifDonusEsigiZ) {
        kulvarDurumu.hedefZIsareti = 1;
        kulvarDurumu.donusYonu = xSapmasi >= 0 ? -1 : 1;
      }

      const yanYonlendirme = THREE.MathUtils.clamp(xSapmasi * 0.9, -0.45, 0.45);
      this.geciciHedefYon
        .set(yanYonlendirme, 0, kulvarDurumu.hedefZIsareti)
        .normalize();

      const noktaCarpim = THREE.MathUtils.clamp(
        this.geciciYatayIleri.dot(this.geciciHedefYon),
        -1,
        1,
      );
      const crossY =
        this.geciciYatayIleri.z * this.geciciHedefYon.x -
        this.geciciYatayIleri.x * this.geciciHedefYon.z;

      let aciHatasi = Math.atan2(crossY, noktaCarpim);
      if (noktaCarpim < -0.95 && Math.abs(crossY) < 0.08) {
        aciHatasi = kulvarDurumu.donusYonu * Math.PI;
      }

      this.toplamTork.y += aciHatasi * kutle * 3.1;

      const donusHizCarpani = THREE.MathUtils.clamp((noktaCarpim + 0.25) / 0.85, 0.18, 1.0);
      const itkiKuvveti =
        hizCarpani <= 0.01 ? 0 : kutle * 3.25 * batanOran * donusHizCarpani * hizCarpani;
      this.toplamKuvvet.addScaledVector(this.geciciYatayIleri, itkiKuvveti);

      this.toplamKuvvet.x += xSapmasi * kutle * 1.95 * batanOran;
      this.toplamKuvvet.x -= cisim.hiz.x * kutle * 0.65 * batanOran;
    }
  }

  private hidrodinamikSonumlemeUygula(
    cisim: SuCismiTaban,
    batanOran: number,
    durumModu: YuzmeDurumModu,
    altDt: number,
  ): void {
    const yatayKatsayi =
      cisim.tip === 'insan' && durumModu === 'aktif_yuzme' ? 1.85 : 2.85;

    const dikeyHiz = Math.abs(cisim.hiz.y);
    const toplamHiz = cisim.hiz.length();
    const yuksekHizliDalis = batanOran > 0.15 && (dikeyHiz > 4.5 || toplamHiz > 6.0);

    // 10m tramplen dalışı gibi yüksek hızlı girişlerde güçlü dikey frenleme + kuadratik direnç
    const ekstraDikeyFren = yuksekHizliDalis ? 7.8 * batanOran : 0;

    const yatayCarpan = Math.exp(-(0.08 + yatayKatsayi * batanOran) * altDt);
    const dikeyCarpan = Math.exp(-(0.08 + 3.9 * batanOran + ekstraDikeyFren) * altDt);

    cisim.hiz.x *= yatayCarpan;
    cisim.hiz.z *= yatayCarpan;
    cisim.hiz.y *= dikeyCarpan;

    if (batanOran > 0.05 && toplamHiz > 0.8) {
      const kuadratikKatsayi = yuksekHizliDalis ? 0.92 : 0.45;
      const tavanFren = yuksekHizliDalis ? 14.5 : 4.0;
      const kuadratikCarpan = Math.exp(
        -Math.min(toplamHiz * kuadratikKatsayi * batanOran, tavanFren) * altDt,
      );
      cisim.hiz.multiplyScalar(kuadratikCarpan);
    }

    const acisalCarpan = Math.exp(-(0.16 + 4.4 * batanOran) * altDt);
    cisim.acisalHiz.multiplyScalar(acisalCarpan);
  }

  private sayisalGuvenlikUygula(cisim: SuCismiTaban): void {
    if (
      !Number.isFinite(cisim.hiz.x) ||
      !Number.isFinite(cisim.hiz.y) ||
      !Number.isFinite(cisim.hiz.z)
    ) {
      cisim.hiz.set(0, 0, 0);
    }
    if (
      !Number.isFinite(cisim.acisalHiz.x) ||
      !Number.isFinite(cisim.acisalHiz.y) ||
      !Number.isFinite(cisim.acisalHiz.z)
    ) {
      cisim.acisalHiz.set(0, 0, 0);
    }

    cisim.hiz.clampLength(0, 18.5);
    cisim.acisalHiz.clampLength(0, 10.0);
  }

  private duvarSinirlariniCoz(cisim: SuCismiTaban): void {
    const kutuBoyut = cisim.yerelKutuBoyutlariGetir();
    const hx = kutuBoyut.x * 0.5;
    const hy = kutuBoyut.y * 0.5;
    const hz = kutuBoyut.z * 0.5;

    let yarimX = hx;
    let yarimY = hy;
    let yarimZ = hz;

    if (cisim.tip !== 'kure') {
      this.geciciRotasyonMatrisi.makeRotationFromQuaternion(cisim.yonelim);
      const e = this.geciciRotasyonMatrisi.elements;
      yarimX = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz;
      yarimY = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
      yarimZ = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz;
    }

    const sekmeKatsayisi = 0.25;

    // İç havuz X ve Z duvar sınırlarını yalnızca cisim duvar üst seviyesinin altındayken uygula
    // (Z = -8.35 atlama blokları ve Y = 10m tramplen sıçrayışları engellenmez)
    if (cisim.konum.y - yarimY < HAVUZ_SABITLERI.DUVAR_UST_Y + 0.08) {
      const minX = HAVUZ_SABITLERI.MIN_X + yarimX;
      const makX = HAVUZ_SABITLERI.MAK_X - yarimX;
      const minZ = HAVUZ_SABITLERI.MIN_Z + yarimZ;
      const makZ = HAVUZ_SABITLERI.MAK_Z - yarimZ;

      if (cisim.konum.x < minX) {
        cisim.konum.x = minX;
        if (cisim.hiz.x < 0) {
          cisim.hiz.x = -cisim.hiz.x * sekmeKatsayisi;
        }
      } else if (cisim.konum.x > makX) {
        cisim.konum.x = makX;
        if (cisim.hiz.x > 0) {
          cisim.hiz.x = -cisim.hiz.x * sekmeKatsayisi;
        }
      }

      if (cisim.konum.z < minZ) {
        cisim.konum.z = minZ;
        if (cisim.hiz.z < 0) {
          cisim.hiz.z = -cisim.hiz.z * sekmeKatsayisi;
        }
      } else if (cisim.konum.z > makZ) {
        cisim.konum.z = makZ;
        if (cisim.hiz.z > 0) {
          cisim.hiz.z = -cisim.hiz.z * sekmeKatsayisi;
        }
      }
    }

    // Alt taban sınırını daima uygula
    const tabanY = HAVUZ_SABITLERI.TABAN_Y + yarimY;
    if (cisim.konum.y < tabanY) {
      cisim.konum.y = tabanY;
      if (cisim.hiz.y < 0) {
        cisim.hiz.y = Math.abs(cisim.hiz.y) > 0.08 ? -cisim.hiz.y * 0.2 : 0;
      }
      cisim.hiz.x *= 0.88;
      cisim.hiz.z *= 0.88;
      cisim.acisalHiz.multiplyScalar(0.84);
    }
  }
}
