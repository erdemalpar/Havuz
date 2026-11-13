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

const KURE_YARICAPI = 0.32;

/**
 * Plaj topu / şamandıra estetiğine sahip 0.32 m yarıçaplı küre cismi.
 * 15 adet hacim örnekleme noktasıyla gerçekçi batma, salınım ve dönme torku üretir.
 */
export class KureCismi extends SuCismiTaban {
  public readonly tip: CisimTipi = 'kure';

  private readonly altKureTamponu: AltKureVerisi[];
  private readonly boyutVektoru = new THREE.Vector3(
    KURE_YARICAPI * 2,
    KURE_YARICAPI * 2,
    KURE_YARICAPI * 2,
  );
  private readonly oncekiKonum = new THREE.Vector3();
  private konumTakibiBasladi = false;

  constructor(baslangicYogunlugu = 360) {
    const kureHacmi = (4 / 3) * Math.PI * Math.pow(KURE_YARICAPI, 3);
    const hacimNoktalari = KureCismi.ornekNoktalariniOlustur(KURE_YARICAPI);

    super(kureHacmi, baslangicYogunlugu, KURE_YARICAPI, hacimNoktalari);

    this.gorselInsaEt();

    this.altKureTamponu = [
      {
        merkez: new THREE.Vector3(),
        yaricap: KURE_YARICAPI,
      },
    ];

    this.donusumuSenkronizeEt();
  }

  private static ornekNoktalariniOlustur(yaricap: number): HacimOrnekNoktasi[] {
    const noktalar: HacimOrnekNoktasi[] = [
      // 1. Merkez noktası
      {
        yerelKonum: new THREE.Vector3(0, 0, 0),
        hacimAgirligi: 0.16,
        propYaricapi: yaricap * 0.44,
        darbeUretirMi: true,
      },
    ];

    // 2..7. 6 ana eksen noktası
    const eksenUzaklik = yaricap * 0.66;
    const eksenYonleri: Array<[number, number, number]> = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [x, y, z] of eksenYonleri) {
      noktalar.push({
        yerelKonum: new THREE.Vector3(x * eksenUzaklik, y * eksenUzaklik, z * eksenUzaklik),
        hacimAgirligi: 0.08,
        propYaricapi: yaricap * 0.33,
        darbeUretirMi: true,
      });
    }

    // 8..15. 8 köşegen oktant noktası
    const oktantUzaklik = yaricap * 0.45;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          noktalar.push({
            yerelKonum: new THREE.Vector3(
              sx * oktantUzaklik,
              sy * oktantUzaklik,
              sz * oktantUzaklik,
            ),
            hacimAgirligi: 0.045,
            propYaricapi: yaricap * 0.30,
            darbeUretirMi: true,
          });
        }
      }
    }

    return noktalar;
  }

  private gorselInsaEt(): void {
    const dilimAcisi = Math.PI / 3;
    const kutupAcisi = 0.24;

    const renkPaleti = [0xf8fafc, 0xff5a36, 0xf8fafc, 0x0284c7, 0xf8fafc, 0xf59e0b];
    const dilimMateryalleri = renkPaleti.map(
      (renk) =>
        new THREE.MeshStandardMaterial({
          color: renk,
          roughness: 0.22,
          metalness: 0.05,
        }),
    );

    // 6 renkli plaj topu dilimi (birbirine tam oturur, z-fighting oluşturmaz)
    for (let i = 0; i < 6; i++) {
      const dilimGeometrisi = new THREE.SphereGeometry(
        KURE_YARICAPI,
        16,
        24,
        i * dilimAcisi,
        dilimAcisi,
        kutupAcisi,
        Math.PI - kutupAcisi * 2,
      );
      this.meshOlusturVeEkle(this.kokGrup, dilimGeometrisi, dilimMateryalleri[i]);
    }

    // Üst ve alt kutup kapakları
    const kapakMateryali = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.05,
    });
    const ustKapakGeo = new THREE.SphereGeometry(
      KURE_YARICAPI,
      24,
      8,
      0,
      Math.PI * 2,
      0,
      kutupAcisi,
    );
    const altKapakGeo = new THREE.SphereGeometry(
      KURE_YARICAPI,
      24,
      8,
      0,
      Math.PI * 2,
      Math.PI - kutupAcisi,
      kutupAcisi,
    );
    this.meshOlusturVeEkle(this.kokGrup, ustKapakGeo, kapakMateryali);
    this.meshOlusturVeEkle(this.kokGrup, altKapakGeo, kapakMateryali);

    // Ekvator şeridi (şamandıra kuşağı)
    const seritMateryali = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.12,
    });
    this.meshOlusturVeEkle(
      this.kokGrup,
      new THREE.TorusGeometry(KURE_YARICAPI + 0.002, 0.009, 10, 48),
      seritMateryali,
      0,
      0,
      0,
      Math.PI / 2,
      0,
      0,
    );

    // Üst kutup şişirme supabı detayı
    this.meshOlusturVeEkle(
      this.kokGrup,
      new THREE.CylinderGeometry(0.018, 0.022, 0.014, 14),
      seritMateryali,
      0,
      KURE_YARICAPI - 0.002,
      0,
    );
  }

  public yerelKutuBoyutlariGetir(): THREE.Vector3 {
    return this.boyutVektoru;
  }

  public override yerelAtaletMomentiGetir(kutle: number): THREE.Vector3 {
    // Katı küre analitik atalet momenti (2/5 * m * r^2)
    const atalet = Math.max(0.4 * kutle * KURE_YARICAPI * KURE_YARICAPI, 0.25);
    return new THREE.Vector3(atalet, atalet, atalet);
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
    const yatayHiz = Math.hypot(
      this.konum.x - this.oncekiKonum.x,
      this.konum.z - this.oncekiKonum.z,
    ) / guvenliDt;

    const suY = suYuksekligiSorgula(this.konum.x, this.konum.z);
    const suKesitindeMi =
      batanOran > 0.05 &&
      batanOran < 0.96 &&
      Math.abs(this.konum.y - suY) < KURE_YARICAPI + 0.08;

    const havuzIcindeMi =
      this.konum.x > HAVUZ_SABITLERI.MIN_X + 0.1 &&
      this.konum.x < HAVUZ_SABITLERI.MAK_X - 0.1 &&
      this.konum.z > HAVUZ_SABITLERI.MIN_Z + 0.1 &&
      this.konum.z < HAVUZ_SABITLERI.MAK_Z - 0.1;

    if (suKesitindeMi && havuzIcindeMi && yatayHiz > 0.18 && !this.tutuluyorMu) {
      const uv = dunyaXZdenUVye(this.konum.x, this.konum.z);
      darbeler.push({
        uvX: THREE.MathUtils.clamp(uv.u, 0.02, 0.98),
        uvZ: THREE.MathUtils.clamp(uv.v, 0.02, 0.98),
        yaricap: 0.024,
        kuvvet: -THREE.MathUtils.clamp(yatayHiz * 0.011, 0.006, 0.028),
      });
    }

    this.oncekiKonum.copy(this.konum);
    return darbeler;
  }

  public altKureleriHesapla(): AltKureVerisi[] {
    this.altKureTamponu[0].merkez.copy(this.konum);
    this.altKureTamponu[0].yaricap = KURE_YARICAPI;
    return this.altKureTamponu;
  }
}
