import * as THREE from 'three';
import {
  GALATASARAY_RENKLERI,
  HAVUZ_SABITLERI,
  KaynakTemizlenebilir,
} from '../types/simulation';

const KARO_UV_OLCEGI = 0.5;
const IC_DUDAK_GENISLIGI = 0.10;
const IZGARA_GENISLIGI = 0.18;
const DIS_DRENAJ_BORDUR_GENISLIGI = 0.04;
const GS_SERIT_GENISLIGI = 0.015;
const TOPLAM_BORDUR_GENISLIGI =
  IC_DUDAK_GENISLIGI +
  IZGARA_GENISLIGI +
  DIS_DRENAJ_BORDUR_GENISLIGI +
  GS_SERIT_GENISLIGI * 2; // 0.35 m

const DIS_BETON_KALINLIGI = 0.28;
const DIS_BETON_ALT_Y = HAVUZ_SABITLERI.TABAN_Y - 0.08;

interface DuzlemYuzeyTanimi {
  koseler: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
  normal: readonly [number, number, number];
  uvler: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
}

/**
 * Olimpik 8m x 16m iç seramik havuz kabuğunu (taban Y = -2.60),
 * taşma oluğu ızgarasını ve Galatasaray Sarı-Kırmızı şeritli drenaj
 * bordür çerçevesini yöneten geometri sınıfı.
 */
export class HavuzGeometrisi implements KaynakTemizlenebilir {
  private readonly sahne: THREE.Scene;
  private readonly icHavuzMesh: THREE.Mesh;
  private readonly dekoratifGrup: THREE.Group;
  private readonly olusturulanGeometriler: THREE.BufferGeometry[] = [];
  private readonly olusturulanMateryaller: THREE.Material[] = [];
  private readonly olusturulanDokular: THREE.Texture[] = [];

  constructor(sahne: THREE.Scene, havuzMateryali: THREE.ShaderMaterial) {
    this.sahne = sahne;

    const icGeometri = this.icHavuzKabuguOlustur();
    this.olusturulanGeometriler.push(icGeometri);

    this.icHavuzMesh = new THREE.Mesh(icGeometri, havuzMateryali);
    this.icHavuzMesh.name = 'icHavuzKabugu';
    this.sahne.add(this.icHavuzMesh);

    this.dekoratifGrup = this.olimpikKenarVeOlukOlustur();
    this.sahne.add(this.dekoratifGrup);
  }

  /**
   * 4 iç duvar (X = ±4, Z = ±8, Y ∈ [TABAN_Y, DUVAR_UST_Y]) ve tabanı (Y = TABAN_Y)
   * içe dönük normaller ve metrik kesintisiz UV koordinatlarıyla tek geometride birleştirir.
   */
  private icHavuzKabuguOlustur(): THREE.BufferGeometry {
    const { MIN_X, MAK_X, MIN_Z, MAK_Z, TABAN_Y, DUVAR_UST_Y } = HAVUZ_SABITLERI;

    const yatayU = (MAK_X - MIN_X) * KARO_UV_OLCEGI;
    const derinlikU = (MAK_Z - MIN_Z) * KARO_UV_OLCEGI;
    const duvarV = (DUVAR_UST_Y - TABAN_Y) * KARO_UV_OLCEGI;

    const yuzeyler: DuzlemYuzeyTanimi[] = [
      // Taban (Y = -2.60, normal: +Y)
      {
        koseler: [
          [MIN_X, TABAN_Y, MIN_Z],
          [MIN_X, TABAN_Y, MAK_Z],
          [MAK_X, TABAN_Y, MAK_Z],
          [MAK_X, TABAN_Y, MIN_Z],
        ],
        normal: [0, 1, 0],
        uvler: [
          [0, 0],
          [0, derinlikU],
          [yatayU, derinlikU],
          [yatayU, 0],
        ],
      },
      // Sol duvar (X = -4, normal: +X)
      {
        koseler: [
          [MIN_X, DUVAR_UST_Y, MIN_Z],
          [MIN_X, DUVAR_UST_Y, MAK_Z],
          [MIN_X, TABAN_Y, MAK_Z],
          [MIN_X, TABAN_Y, MIN_Z],
        ],
        normal: [1, 0, 0],
        uvler: [
          [0, duvarV],
          [derinlikU, duvarV],
          [derinlikU, 0],
          [0, 0],
        ],
      },
      // Sağ duvar (X = +4, normal: -X)
      {
        koseler: [
          [MAK_X, DUVAR_UST_Y, MAK_Z],
          [MAK_X, DUVAR_UST_Y, MIN_Z],
          [MAK_X, TABAN_Y, MIN_Z],
          [MAK_X, TABAN_Y, MAK_Z],
        ],
        normal: [-1, 0, 0],
        uvler: [
          [derinlikU, duvarV],
          [0, duvarV],
          [0, 0],
          [derinlikU, 0],
        ],
      },
      // Arka duvar (Z = -8, normal: +Z)
      {
        koseler: [
          [MAK_X, DUVAR_UST_Y, MIN_Z],
          [MIN_X, DUVAR_UST_Y, MIN_Z],
          [MIN_X, TABAN_Y, MIN_Z],
          [MAK_X, TABAN_Y, MIN_Z],
        ],
        normal: [0, 0, 1],
        uvler: [
          [yatayU, duvarV],
          [0, duvarV],
          [0, 0],
          [yatayU, 0],
        ],
      },
      // Ön duvar (Z = +8, normal: -Z)
      {
        koseler: [
          [MIN_X, DUVAR_UST_Y, MAK_Z],
          [MAK_X, DUVAR_UST_Y, MAK_Z],
          [MAK_X, TABAN_Y, MAK_Z],
          [MIN_X, TABAN_Y, MAK_Z],
        ],
        normal: [0, 0, -1],
        uvler: [
          [0, duvarV],
          [yatayU, duvarV],
          [yatayU, 0],
          [0, 0],
        ],
      },
    ];

    const konumlar: number[] = [];
    const normaller: number[] = [];
    const uvDizisi: number[] = [];
    const indeksler: number[] = [];

    for (let i = 0; i < yuzeyler.length; i += 1) {
      this.yuzeyEkle(yuzeyler[i], i * 4, konumlar, normaller, uvDizisi, indeksler);
    }

    const geometri = new THREE.BufferGeometry();
    geometri.setAttribute('position', new THREE.Float32BufferAttribute(konumlar, 3));
    geometri.setAttribute('normal', new THREE.Float32BufferAttribute(normaller, 3));
    geometri.setAttribute('uv', new THREE.Float32BufferAttribute(uvDizisi, 2));
    geometri.setIndex(indeksler);
    geometri.computeBoundingBox();
    geometri.computeBoundingSphere();

    return geometri;
  }

  /**
   * Bir dörtgen yüzeyi iki üçgen halinde indeksli tampon dizilerine ekler.
   */
  private yuzeyEkle(
    yuzey: DuzlemYuzeyTanimi,
    baslangicIndeksi: number,
    konumlar: number[],
    normaller: number[],
    uvDizisi: number[],
    indeksler: number[],
  ): void {
    for (let k = 0; k < 4; k += 1) {
      const kose = yuzey.koseler[k];
      const uv = yuzey.uvler[k];
      konumlar.push(kose[0], kose[1], kose[2]);
      normaller.push(yuzey.normal[0], yuzey.normal[1], yuzey.normal[2]);
      uvDizisi.push(uv[0], uv[1]);
    }

    indeksler.push(
      baslangicIndeksi,
      baslangicIndeksi + 1,
      baslangicIndeksi + 2,
      baslangicIndeksi,
      baslangicIndeksi + 2,
      baslangicIndeksi + 3,
    );
  }

  /**
   * Taşma oluğu ızgarası için beyaz/açık gri nervürlü PVC drenaj dokusu üretir.
   */
  private tasmaIzgaraDokusuOlustur(
    tekrarX: number,
    tekrarY: number,
    yatayMi: boolean,
  ): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 128;
    tuval.height = 128;

    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Taşma oluğu ızgara dokusu için 2B tuval bağlamı oluşturulamadı.');
    }

    // Koyu su tahliye kanalı arka planı
    baglam.fillStyle = '#1b2b3a';
    baglam.fillRect(0, 0, 128, 128);

    const cubukAdeti = 4;
    const adim = 128 / cubukAdeti;
    const cubukKalinligi = adim * 0.6;

    for (let i = 0; i < cubukAdeti; i += 1) {
      const baslangic = i * adim + 2;
      const gradyan = yatayMi
        ? baglam.createLinearGradient(baslangic, 0, baslangic + cubukKalinligi, 0)
        : baglam.createLinearGradient(0, baslangic, 0, baslangic + cubukKalinligi);
      gradyan.addColorStop(0, '#eef4f8');
      gradyan.addColorStop(0.5, '#ffffff');
      gradyan.addColorStop(1, '#cbd5e1');

      baglam.fillStyle = gradyan;
      if (yatayMi) {
        baglam.fillRect(baslangic, 0, cubukKalinligi, 128);
      } else {
        baglam.fillRect(0, baslangic, 128, cubukKalinligi);
      }
    }

    // Merkez destek omurgası
    baglam.fillStyle = '#dbe4ee';
    if (yatayMi) {
      baglam.fillRect(0, 58, 128, 12);
    } else {
      baglam.fillRect(58, 0, 12, 128);
    }

    const doku = new THREE.CanvasTexture(tuval);
    doku.wrapS = THREE.RepeatWrapping;
    doku.wrapT = THREE.RepeatWrapping;
    doku.repeat.set(tekrarX, tekrarY);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    doku.needsUpdate = true;

    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * 4 kenar boyunca olimpik taşma oluğu ızgarasını, beyaz/açık gri drenaj bordürünü,
   * Galatasaray Sarı-Kırmızı dış şerit bordürünü ve alt yapı beton gövde duvarlarını oluşturur.
   */
  private olimpikKenarVeOlukOlustur(): THREE.Group {
    const grup = new THREE.Group();
    grup.name = 'olimpikKenarVeOluk';

    const { GENISLIK_X, UZUNLUK_Z, MIN_X, MAK_X, MIN_Z, MAK_Z, TABAN_Y, DUVAR_UST_Y } =
      HAVUZ_SABITLERI;

    const icDudakMateryali = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.30,
      metalness: 0.05,
    });
    const olukTabanMateryali = new THREE.MeshStandardMaterial({
      color: 0x162432,
      roughness: 0.65,
      metalness: 0.08,
    });
    const disBordurMateryali = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.42,
      metalness: 0.04,
    });
    const gsSariSeritMateryali = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_SARI_ANA,
      roughness: 0.35,
      metalness: 0.12,
    });
    const gsKirmiziSeritMateryali = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      roughness: 0.35,
      metalness: 0.12,
    });
    const disBetonMateryali = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.88,
      metalness: 0.06,
    });

    const kisaKenarIzgaraDokusu = this.tasmaIzgaraDokusuOlustur(18, 1, true);
    const uzunKenarIzgaraDokusu = this.tasmaIzgaraDokusuOlustur(1, 36, false);

    const kisaKenarIzgaraMateryali = new THREE.MeshStandardMaterial({
      map: kisaKenarIzgaraDokusu,
      roughness: 0.38,
      metalness: 0.05,
    });
    const uzunKenarIzgaraMateryali = new THREE.MeshStandardMaterial({
      map: uzunKenarIzgaraDokusu,
      roughness: 0.38,
      metalness: 0.05,
    });

    this.olusturulanMateryaller.push(
      icDudakMateryali,
      olukTabanMateryali,
      disBordurMateryali,
      gsSariSeritMateryali,
      gsKirmiziSeritMateryali,
      disBetonMateryali,
      kisaKenarIzgaraMateryali,
      uzunKenarIzgaraMateryali,
    );

    // 1. İç beyaz seramik kenar dudağı (|X| ∈ [4.00, 4.10], |Z| ∈ [8.00, 8.10], üst Y = 0.182)
    this.cerceveHalkasiEkle(
      grup,
      'icSeramikDudak',
      MAK_X,
      MAK_Z,
      IC_DUDAK_GENISLIGI,
      0.042,
      DUVAR_UST_Y + 0.002 - 0.021,
      icDudakMateryali,
    );

    // 2. Taşma oluğu su kanalı tabanı (|X| ∈ [4.10, 4.28], |Z| ∈ [8.10, 8.28], üst Y = 0.142)
    const olukIcX = MAK_X + IC_DUDAK_GENISLIGI;
    const olukIcZ = MAK_Z + IC_DUDAK_GENISLIGI;
    this.cerceveHalkasiEkle(
      grup,
      'tasmaOluguTaban',
      olukIcX,
      olukIcZ,
      IZGARA_GENISLIGI,
      0.032,
      0.142 - 0.016,
      olukTabanMateryali,
    );

    // 3. Taşma oluğu ızgarası (üst Y = 0.177, güvertenin 2mm üstünde)
    const izgaraMerkezY = 0.177 - 0.006;
    const izgaraKisaUzunluk = (olukIcX + IZGARA_GENISLIGI) * 2;
    const izgaraZKonum = olukIcZ + IZGARA_GENISLIGI * 0.5;
    const izgaraXKonum = olukIcX + IZGARA_GENISLIGI * 0.5;
    const izgaraYanUzunluk = olukIcZ * 2;

    this.kutuParcaEkle(
      grup,
      'tasmaIzgarasiArka',
      izgaraKisaUzunluk,
      0.012,
      IZGARA_GENISLIGI,
      0,
      izgaraMerkezY,
      -izgaraZKonum,
      kisaKenarIzgaraMateryali,
    );
    this.kutuParcaEkle(
      grup,
      'tasmaIzgarasiOn',
      izgaraKisaUzunluk,
      0.012,
      IZGARA_GENISLIGI,
      0,
      izgaraMerkezY,
      izgaraZKonum,
      kisaKenarIzgaraMateryali,
    );
    this.kutuParcaEkle(
      grup,
      'tasmaIzgarasiSol',
      IZGARA_GENISLIGI,
      0.012,
      izgaraYanUzunluk,
      -izgaraXKonum,
      izgaraMerkezY,
      0,
      uzunKenarIzgaraMateryali,
    );
    this.kutuParcaEkle(
      grup,
      'tasmaIzgarasiSag',
      IZGARA_GENISLIGI,
      0.012,
      izgaraYanUzunluk,
      izgaraXKonum,
      izgaraMerkezY,
      0,
      uzunKenarIzgaraMateryali,
    );

    // 4. Dış drenaj bordürü (|X| ∈ [4.28, 4.32], |Z| ∈ [8.28, 8.32], üst Y = 0.180)
    const bordurIcX = olukIcX + IZGARA_GENISLIGI;
    const bordurIcZ = olukIcZ + IZGARA_GENISLIGI;
    this.cerceveHalkasiEkle(
      grup,
      'disDrenajBorduru',
      bordurIcX,
      bordurIcZ,
      DIS_DRENAJ_BORDUR_GENISLIGI,
      0.060,
      0.180 - 0.030,
      disBordurMateryali,
    );

    // 5. Galatasaray Sarı ve Kırmızı dekoratif dış şerit bordürü (|X| ∈ [4.32, 4.35], |Z| ∈ [8.32, 8.35])
    const sariIcX = bordurIcX + DIS_DRENAJ_BORDUR_GENISLIGI;
    const sariIcZ = bordurIcZ + DIS_DRENAJ_BORDUR_GENISLIGI;
    this.cerceveHalkasiEkle(
      grup,
      'gsSariBordurSerit',
      sariIcX,
      sariIcZ,
      GS_SERIT_GENISLIGI,
      0.062,
      0.181 - 0.031,
      gsSariSeritMateryali,
    );

    const kirmiziIcX = sariIcX + GS_SERIT_GENISLIGI;
    const kirmiziIcZ = sariIcZ + GS_SERIT_GENISLIGI;
    this.cerceveHalkasiEkle(
      grup,
      'gsKirmiziBordurSerit',
      kirmiziIcX,
      kirmiziIcZ,
      GS_SERIT_GENISLIGI,
      0.063,
      0.182 - 0.0315,
      gsKirmiziSeritMateryali,
    );

    // 6. Su altı kamerası için iç havuz duvarlarını dışarıdan kapatan beton zarf (güverte altında kalır)
    const icBosluk = 0.004;
    const zarfUstY = 0.120;
    const zarfYukseklik = zarfUstY - DIS_BETON_ALT_Y;
    const zarfMerkezY = (zarfUstY + DIS_BETON_ALT_Y) * 0.5;
    const yanKalinlik = Math.min(DIS_BETON_KALINLIGI, TOPLAM_BORDUR_GENISLIGI - 0.01);

    const zDisKonum = MAK_Z + icBosluk + yanKalinlik * 0.5;
    const xDisKonum = MAK_X + icBosluk + yanKalinlik * 0.5;
    const disTamGenislikX = GENISLIK_X + (icBosluk + yanKalinlik) * 2;
    const disYanUzunlukZ = UZUNLUK_Z + icBosluk * 2;

    this.kutuParcaEkle(
      grup,
      'havuzDisZarfArka',
      disTamGenislikX,
      zarfYukseklik,
      yanKalinlik,
      0,
      zarfMerkezY,
      -zDisKonum,
      disBetonMateryali,
    );
    this.kutuParcaEkle(
      grup,
      'havuzDisZarfOn',
      disTamGenislikX,
      zarfYukseklik,
      yanKalinlik,
      0,
      zarfMerkezY,
      zDisKonum,
      disBetonMateryali,
    );
    this.kutuParcaEkle(
      grup,
      'havuzDisZarfSol',
      yanKalinlik,
      zarfYukseklik,
      disYanUzunlukZ,
      -xDisKonum,
      zarfMerkezY,
      0,
      disBetonMateryali,
    );
    this.kutuParcaEkle(
      grup,
      'havuzDisZarfSag',
      yanKalinlik,
      zarfYukseklik,
      disYanUzunlukZ,
      xDisKonum,
      zarfMerkezY,
      0,
      disBetonMateryali,
    );

    const disTabanUstY = TABAN_Y - icBosluk;
    const disTabanKalinlik = disTabanUstY - DIS_BETON_ALT_Y;
    const disTabanMerkezY = (disTabanUstY + DIS_BETON_ALT_Y) * 0.5;
    this.kutuParcaEkle(
      grup,
      'havuzDisZarfTaban',
      GENISLIK_X + icBosluk * 2,
      disTabanKalinlik,
      UZUNLUK_Z + icBosluk * 2,
      (MIN_X + MAK_X) * 0.5,
      disTabanMerkezY,
      (MIN_Z + MAK_Z) * 0.5,
      disBetonMateryali,
    );

    return grup;
  }

  /**
   * Z-fighting olmadan 4 parçalı dikdörtgen çerçeve halkası ekler.
   */
  private cerceveHalkasiEkle(
    hedefGrup: THREE.Group,
    onEk: string,
    icYariX: number,
    icYariZ: number,
    genislik: number,
    yukseklik: number,
    merkezY: number,
    materyal: THREE.Material,
  ): void {
    const disTamX = (icYariX + genislik) * 2;
    const icUzunlukZ = icYariZ * 2;
    const zMerkez = icYariZ + genislik * 0.5;
    const xMerkez = icYariX + genislik * 0.5;

    this.kutuParcaEkle(
      hedefGrup,
      `${onEk}Arka`,
      disTamX,
      yukseklik,
      genislik,
      0,
      merkezY,
      -zMerkez,
      materyal,
    );
    this.kutuParcaEkle(
      hedefGrup,
      `${onEk}On`,
      disTamX,
      yukseklik,
      genislik,
      0,
      merkezY,
      zMerkez,
      materyal,
    );
    this.kutuParcaEkle(
      hedefGrup,
      `${onEk}Sol`,
      genislik,
      yukseklik,
      icUzunlukZ,
      -xMerkez,
      merkezY,
      0,
      materyal,
    );
    this.kutuParcaEkle(
      hedefGrup,
      `${onEk}Sag`,
      genislik,
      yukseklik,
      icUzunlukZ,
      xMerkez,
      merkezY,
      0,
      materyal,
    );
  }

  /**
   * Belirtilen boyut ve konumda kutu parça oluşturup gruba ve kaynak izleme listesine ekler.
   */
  private kutuParcaEkle(
    hedefGrup: THREE.Group,
    ad: string,
    genislik: number,
    yukseklik: number,
    derinlik: number,
    x: number,
    y: number,
    z: number,
    materyal: THREE.Material,
  ): void {
    const geometri = new THREE.BoxGeometry(genislik, yukseklik, derinlik);
    this.olusturulanGeometriler.push(geometri);

    const mesh = new THREE.Mesh(geometri, materyal);
    mesh.name = ad;
    mesh.position.set(x, y, z);
    hedefGrup.add(mesh);
  }

  /**
   * İç havuz kabuğu mesh'ini döndürür.
   */
  public icHavuzMeshGetir(): THREE.Mesh {
    return this.icHavuzMesh;
  }

  /**
   * Havuz geometrisi tarafından oluşturulan tüm sahne düğümlerini,
   * geometrileri, materyalleri ve dokuları temizler.
   */
  public temizle(): void {
    this.sahne.remove(this.icHavuzMesh);
    this.sahne.remove(this.dekoratifGrup);

    for (const geometri of this.olusturulanGeometriler) {
      geometri.dispose();
    }
    this.olusturulanGeometriler.length = 0;

    for (const materyal of this.olusturulanMateryaller) {
      materyal.dispose();
    }
    this.olusturulanMateryaller.length = 0;

    for (const doku of this.olusturulanDokular) {
      doku.dispose();
    }
    this.olusturulanDokular.length = 0;
  }
}
