import * as THREE from 'three';
import {
  dunyaXZdenUVye,
  HAVUZ_SABITLERI,
  type AltKureVerisi,
  type CisimTipi,
  type HacimOrnekNoktasi,
  type SuDarbesiVerisi,
  type SuYuksekligiSorguFonksiyonu,
  type YuzmeDurumModu,
} from '../types/simulation';
import { SuCismiTaban } from './SuCismiTaban';

const KUTU_GENISLIK = 0.56;
const KUTU_YUKSEKLIK = 0.42;
const KUTU_DERINLIK = 0.56;

/**
 * 0.56 m x 0.42 m x 0.56 m boyutlarında çerçeveli ahşap kasa cismi.
 * 8 köşe + 6 yüz merkezi + 1 merkez olmak üzere 15 hacim noktasıyla
 * suya eğik girişte gerçekçi doğrultma torku ve salınım üretir.
 */
export class KutuCismi extends SuCismiTaban {
  public readonly tip: CisimTipi = 'kutu';

  private readonly yerelAltKureOfsetleri: THREE.Vector3[];
  private readonly altKureTamponu: AltKureVerisi[];
  private readonly boyutVektoru = new THREE.Vector3(
    KUTU_GENISLIK,
    KUTU_YUKSEKLIK,
    KUTU_DERINLIK,
  );
  private readonly oncekiKonum = new THREE.Vector3();
  private konumTakibiBasladi = false;

  constructor(baslangicYogunlugu = 620) {
    const kutuHacmi = KUTU_GENISLIK * KUTU_YUKSEKLIK * KUTU_DERINLIK;
    const sinirlayiciYaricap =
      0.5 *
      Math.sqrt(
        KUTU_GENISLIK * KUTU_GENISLIK +
          KUTU_YUKSEKLIK * KUTU_YUKSEKLIK +
          KUTU_DERINLIK * KUTU_DERINLIK,
      );

    const hacimNoktalari = KutuCismi.ornekNoktalariniOlustur();
    super(kutuHacmi, baslangicYogunlugu, sinirlayiciYaricap, hacimNoktalari);

    this.gorselInsaEt();

    this.yerelAltKureOfsetleri = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.14, 0, 0.14),
      new THREE.Vector3(-0.14, 0, 0.14),
      new THREE.Vector3(0.14, 0, -0.14),
      new THREE.Vector3(-0.14, 0, -0.14),
    ];

    this.altKureTamponu = this.yerelAltKureOfsetleri.map(() => ({
      merkez: new THREE.Vector3(),
      yaricap: 0.2,
    }));

    this.donusumuSenkronizeEt();
  }

  private static ornekNoktalariniOlustur(): HacimOrnekNoktasi[] {
    const noktalar: HacimOrnekNoktasi[] = [
      // 1. Merkez noktası
      {
        yerelKonum: new THREE.Vector3(0, 0, 0),
        hacimAgirligi: 0.14,
        propYaricapi: 0.14,
        darbeUretirMi: true,
      },
    ];

    // 2..9. 8 köşe noktası
    const koseX = KUTU_GENISLIK * 0.41;
    const koseY = KUTU_YUKSEKLIK * 0.38;
    const koseZ = KUTU_DERINLIK * 0.41;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          noktalar.push({
            yerelKonum: new THREE.Vector3(sx * koseX, sy * koseY, sz * koseZ),
            hacimAgirligi: 0.055,
            propYaricapi: 0.085,
            darbeUretirMi: true,
          });
        }
      }
    }

    // 10..15. 6 yüz merkezi
    const yuzKonumlari: Array<[number, number, number]> = [
      [KUTU_GENISLIK * 0.42, 0, 0],
      [-KUTU_GENISLIK * 0.42, 0, 0],
      [0, KUTU_YUKSEKLIK * 0.40, 0],
      [0, -KUTU_YUKSEKLIK * 0.40, 0],
      [0, 0, KUTU_DERINLIK * 0.42],
      [0, 0, -KUTU_DERINLIK * 0.42],
    ];
    for (const [x, y, z] of yuzKonumlari) {
      noktalar.push({
        yerelKonum: new THREE.Vector3(x, y, z),
        hacimAgirligi: 0.07,
        propYaricapi: 0.095,
        darbeUretirMi: true,
      });
    }

    return noktalar;
  }

  private gorselInsaEt(): void {
    const icGovdeMat = new THREE.MeshStandardMaterial({
      color: 0x6f4526,
      roughness: 0.78,
      metalness: 0.04,
    });
    const cerceveAhsapMat = new THREE.MeshStandardMaterial({
      color: 0xb8844e,
      roughness: 0.66,
      metalness: 0.05,
    });
    const metalBraketMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.38,
      metalness: 0.68,
    });

    // İç gövde çekirdeği
    this.meshOlusturVeEkle(
      this.kokGrup,
      new THREE.BoxGeometry(KUTU_GENISLIK - 0.06, KUTU_YUKSEKLIK - 0.05, KUTU_DERINLIK - 0.06),
      icGovdeMat,
    );

    const citaKalinlik = 0.055;
    const yarimX = KUTU_GENISLIK * 0.5 - citaKalinlik * 0.5;
    const yarimY = KUTU_YUKSEKLIK * 0.5 - citaKalinlik * 0.5;
    const yarimZ = KUTU_DERINLIK * 0.5 - citaKalinlik * 0.5;

    // 4 dikey köşe direği
    const dikeyDirekGeo = new THREE.BoxGeometry(citaKalinlik, KUTU_YUKSEKLIK, citaKalinlik);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.meshOlusturVeEkle(
          this.kokGrup,
          dikeyDirekGeo,
          cerceveAhsapMat,
          sx * yarimX,
          0,
          sz * yarimZ,
        );
      }
    }

    // 4 X-ekseni üst/alt yatay çıtası (köşe direklerinin arasına oturur)
    const yatayXGeo = new THREE.BoxGeometry(
      KUTU_GENISLIK - citaKalinlik * 2,
      citaKalinlik,
      citaKalinlik,
    );
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.meshOlusturVeEkle(
          this.kokGrup,
          yatayXGeo,
          cerceveAhsapMat,
          0,
          sy * yarimY,
          sz * yarimZ,
        );
      }
    }

    // 4 Z-ekseni üst/alt yatay çıtası
    const yatayZGeo = new THREE.BoxGeometry(
      citaKalinlik,
      citaKalinlik,
      KUTU_DERINLIK - citaKalinlik * 2,
    );
    for (const sy of [-1, 1]) {
      for (const sx of [-1, 1]) {
        this.meshOlusturVeEkle(
          this.kokGrup,
          yatayZGeo,
          cerceveAhsapMat,
          sx * yarimX,
          sy * yarimY,
          0,
        );
      }
    }

    // Yan yüzlerde çapraz kasa destek çıtaları
    const caprazUzunluk = Math.sqrt(
      Math.pow(KUTU_GENISLIK - citaKalinlik * 2, 2) +
        Math.pow(KUTU_YUKSEKLIK - citaKalinlik * 2, 2),
    );
    const caprazAci = Math.atan2(
      KUTU_YUKSEKLIK - citaKalinlik * 2,
      KUTU_GENISLIK - citaKalinlik * 2,
    );
    const caprazCitaGeo = new THREE.BoxGeometry(caprazUzunluk * 0.94, 0.036, 0.022);
    const yanCaprazCitaGeo = new THREE.BoxGeometry(0.022, 0.036, caprazUzunluk * 0.94);

    for (const sz of [-1, 1]) {
      this.meshOlusturVeEkle(
        this.kokGrup,
        caprazCitaGeo,
        cerceveAhsapMat,
        0,
        0,
        sz * (KUTU_DERINLIK * 0.5 - 0.024),
        0,
        0,
        sz * caprazAci,
      );
    }
    for (const sx of [-1, 1]) {
      this.meshOlusturVeEkle(
        this.kokGrup,
        yanCaprazCitaGeo,
        cerceveAhsapMat,
        sx * (KUTU_GENISLIK * 0.5 - 0.024),
        0,
        0,
        sx * caprazAci,
        0,
        0,
      );
    }

    // Üst ve alt yüzlerde dekoratif tahta şeritler
    const kapakCitaGeo = new THREE.BoxGeometry(KUTU_GENISLIK - citaKalinlik * 2, 0.018, 0.075);
    for (const sy of [-1, 1]) {
      for (const ofsetZ of [-0.14, 0, 0.14]) {
        this.meshOlusturVeEkle(
          this.kokGrup,
          kapakCitaGeo,
          cerceveAhsapMat,
          0,
          sy * (KUTU_YUKSEKLIK * 0.5 - 0.022),
          ofsetZ,
        );
      }
    }

    // 8 köşede paslanmaz metal köşe takviye plakaları
    const koseBraketGeo = new THREE.BoxGeometry(0.066, 0.066, 0.066);
    const braketX = KUTU_GENISLIK * 0.5 - 0.031;
    const braketY = KUTU_YUKSEKLIK * 0.5 - 0.031;
    const braketZ = KUTU_DERINLIK * 0.5 - 0.031;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          this.meshOlusturVeEkle(
            this.kokGrup,
            koseBraketGeo,
            metalBraketMat,
            sx * braketX,
            sy * braketY,
            sz * braketZ,
          );
        }
      }
    }
  }

  public yerelKutuBoyutlariGetir(): THREE.Vector3 {
    return this.boyutVektoru;
  }

  public animasyonuGuncelle(
    dt: number,
    _gecenSure: number,
    _durumModu: YuzmeDurumModu,
    batanOran: number,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
  ): SuDarbesiVerisi[] {
    const darbeler: SuDarbesiVerisi[] = [];

    if (!this.konumTakibiBasladi) {
      this.oncekiKonum.copy(this.konum);
      this.konumTakibiBasladi = true;
      return darbeler;
    }

    const guvenliDt = Math.max(dt, 0.001);
    const toplamHiz = this.konum.distanceTo(this.oncekiKonum) / guvenliDt;
    const suY = suYuksekligiSorgula(this.konum.x, this.konum.z);

    const suKesitindeMi =
      batanOran > 0.05 &&
      batanOran < 0.96 &&
      Math.abs(this.konum.y - suY) < KUTU_YUKSEKLIK;

    const havuzIcindeMi =
      this.konum.x > HAVUZ_SABITLERI.MIN_X + 0.12 &&
      this.konum.x < HAVUZ_SABITLERI.MAK_X - 0.12 &&
      this.konum.z > HAVUZ_SABITLERI.MIN_Z + 0.12 &&
      this.konum.z < HAVUZ_SABITLERI.MAK_Z - 0.12;

    if (suKesitindeMi && havuzIcindeMi && toplamHiz > 0.16 && !this.tutuluyorMu) {
      const uv = dunyaXZdenUVye(this.konum.x, this.konum.z);
      darbeler.push({
        uvX: THREE.MathUtils.clamp(uv.u, 0.02, 0.98),
        uvZ: THREE.MathUtils.clamp(uv.v, 0.02, 0.98),
        yaricap: 0.028,
        kuvvet: -THREE.MathUtils.clamp(toplamHiz * 0.012, 0.006, 0.03),
      });
    }

    this.oncekiKonum.copy(this.konum);
    return darbeler;
  }

  public altKureleriHesapla(): AltKureVerisi[] {
    for (let i = 0; i < this.yerelAltKureOfsetleri.length; i++) {
      this.altKureTamponu[i].merkez
        .copy(this.yerelAltKureOfsetleri[i])
        .applyQuaternion(this.yonelim)
        .add(this.konum);
      this.altKureTamponu[i].yaricap = i === 0 ? 0.22 : 0.19;
    }
    return this.altKureTamponu;
  }
}
