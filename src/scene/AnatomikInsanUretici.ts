import * as THREE from 'three';
import {
  GALATASARAY_RENKLERI,
  type KaynakTemizlenebilir,
} from '../types/simulation';

export type SakalTipi = 'yok' | 'kirli' | 'biyik';
export type SacTipi = 'kisa' | 'topuz' | 'kep' | 'bere' | 'acik';
export type KiyafetTipi =
  | 'hakem_polo'
  | 'hakem_ceket'
  | 'gs_esofman'
  | 'cankurtaran'
  | 'sade';

export interface InsanGorunumSecenekleri {
  ciltRengi?: number;
  sacRengi?: number;
  ustAnaRenk?: number;
  ustIkinciRenk?: number;
  pantolonRengi?: number;
  ayakkabiRengi?: number;
  gozRengi?: string;
  sakalTipi?: SakalTipi;
  sacTipi?: SacTipi;
  gunesGozluguMu?: boolean;
  kiyafetTipi?: KiyafetTipi;
  kisaKolMu?: boolean;
  olcek?: number;
}

export interface AnatomikInsanFiguru {
  grup: THREE.Group;
  govdeGrubu: THREE.Group;
  boyunPivoti: THREE.Group;
  solOmuz: THREE.Group;
  solDirsek: THREE.Group;
  solElNoktasi: THREE.Object3D;
  sagOmuz: THREE.Group;
  sagDirsek: THREE.Group;
  sagElNoktasi: THREE.Object3D;
  solKalca: THREE.Group;
  solDiz: THREE.Group;
  sagKalca: THREE.Group;
  sagDiz: THREE.Group;
}

interface PaylasimliGeometriler {
  kafa: THREE.BufferGeometry;
  boyun: THREE.BufferGeometry;
  ustGovde: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  yaka: THREE.BufferGeometry;
  ustKolUzun: THREE.BufferGeometry;
  ustKolKisa: THREE.BufferGeometry;
  onKol: THREE.BufferGeometry;
  el: THREE.BufferGeometry;
  uyluk: THREE.BufferGeometry;
  baldir: THREE.BufferGeometry;
  ayakkabiTaban: THREE.BufferGeometry;
  ayakkabiUst: THREE.BufferGeometry;
  kisaSac: THREE.BufferGeometry;
  topuzSac: THREE.BufferGeometry;
  sporKep: THREE.BufferGeometry;
  bere: THREE.BufferGeometry;
  tribunKafa: THREE.BufferGeometry;
  tribunGovde: THREE.BufferGeometry;
  tribunAltVucut: THREE.BufferGeometry;
  tribunKol: THREE.BufferGeometry;
}

/**
 * Sahnedeki tüm giyinik insanlar (havuz hakemleri, puan hakemleri, Galatasaray
 * antrenörleri, cankurtaran ve ~170 tribün seyircisi) için paylaşımlı 3B anatomik
 * geometriler ve prosedürel yüz/kıyafet dokuları üreten merkezi havuz sınıfı.
 * Yerel yönelim: ön yüz +Z, sırt -Z, yukarı +Y.
 */
export class AnatomikInsanUretici implements KaynakTemizlenebilir {
  private readonly olusturulanGeometriler: THREE.BufferGeometry[] = [];
  private readonly olusturulanMateryaller: THREE.Material[] = [];
  private readonly olusturulanDokular: THREE.Texture[] = [];

  private readonly materyalOnbellegi = new Map<string, THREE.MeshStandardMaterial>();
  private readonly yuzMateryalOnbellegi = new Map<string, THREE.MeshStandardMaterial>();
  private readonly kiyafetMateryalOnbellegi = new Map<string, THREE.MeshStandardMaterial>();

  private readonly geometriler: PaylasimliGeometriler;
  private tribunOrtakYuzDokusuCache: THREE.CanvasTexture | null = null;
  private temizlendiMi = false;

  constructor() {
    this.geometriler = this.paylasimliGeometrileriKur();
  }

  private paylasimliGeometrileriKur(): PaylasimliGeometriler {
    const kafa = this.anatomikKafaGeometrisiOlustur();
    const boyun = this.latheProfilOlustur(
      [
        [0.056, 0.0],
        [0.048, 0.04],
        [0.047, 0.08],
        [0.052, 0.11],
      ],
      16,
    );
    boyun.scale(0.95, 1.0, 0.92);

    // Omuzlu, göğüslü, ince belli gerçekçi üst gövde (Y: 0 -> 0.50)
    const ustGovde = this.latheProfilOlustur(
      [
        [0.01, 0.0],
        [0.116, 0.015],
        [0.112, 0.11], // Bel oyuğu
        [0.130, 0.22], // Kaburga
        [0.150, 0.34], // Göğüs kafesi
        [0.154, 0.41], // Omuz genişliği
        [0.120, 0.46], // Trapez geçişi
        [0.058, 0.50], // Boyun kökü
        [0.01, 0.505],
      ],
      24,
    );
    // Önden (+Z) arkaya (-Z) göre hafif daha dolgun göğüs ve kürek kemiği şekillendirmesi
    ustGovde.rotateY(-Math.PI * 0.5);
    this.ustGovdeAnatomikSekillendir(ustGovde);

    const pelvis = this.latheProfilOlustur(
      [
        [0.01, -0.10],
        [0.110, -0.09],
        [0.132, -0.02],
        [0.122, 0.04],
        [0.01, 0.045],
      ],
      20,
    );
    pelvis.scale(1.20, 1.0, 0.82);

    const yaka = new THREE.CylinderGeometry(0.068, 0.084, 0.045, 18, 1, true);
    yaka.scale(1.06, 1.0, 0.94);

    // Üst kol (0 -> -0.26, omuz deltoidinden dirseğe incelen)
    const ustKolUzun = this.latheProfilOlustur(
      [
        [0.036, -0.26],
        [0.043, -0.19],
        [0.051, -0.10],
        [0.053, -0.02],
        [0.01, 0.015],
      ],
      14,
    );
    const ustKolKisa = this.latheProfilOlustur(
      [
        [0.049, -0.17],
        [0.052, -0.16],
        [0.054, -0.09],
        [0.055, -0.02],
        [0.01, 0.015],
      ],
      14,
    );

    // Ön kol (0 -> -0.23, dirsekten bileğe incelen)
    const onKol = this.latheProfilOlustur(
      [
        [0.024, -0.23],
        [0.030, -0.15],
        [0.041, -0.06],
        [0.037, 0.0],
      ],
      14,
    );

    const el = this.anatomikElGeometrisiOlustur();

    // Uyluk (0 -> -0.40) ve Baldır (0 -> -0.38)
    const uyluk = this.latheProfilOlustur(
      [
        [0.052, -0.40],
        [0.062, -0.28],
        [0.076, -0.12],
        [0.080, 0.0],
      ],
      16,
    );
    const baldir = this.latheProfilOlustur(
      [
        [0.036, -0.38],
        [0.044, -0.26],
        [0.056, -0.13],
        [0.052, -0.04],
        [0.050, 0.0],
      ],
      16,
    );

    const ayakkabiTaban = this.ayakkabiParcasiOlustur(true);
    const ayakkabiUst = this.ayakkabiParcasiOlustur(false);

    const kisaSac = this.kisaSacGeometrisiOlustur();
    const topuzSac = this.topuzSacGeometrisiOlustur(kisaSac);
    const sporKep = this.sporKepGeometrisiOlustur();
    const bere = this.bereGeometrisiOlustur();

    // Tribün seyircileri için optimize edilmiş boyun/yaka birleşimli InstancedMesh geometrileri
    const tribunKafaKopya = kafa.clone();
    const tribunBoyunKopya = boyun.clone();
    const boyunUv = tribunBoyunKopya.attributes.uv;
    if (boyunUv) {
      for (let i = 0; i < boyunUv.count; i += 1) {
        boyunUv.setXY(i, 0.12, 0.12);
      }
      boyunUv.needsUpdate = true;
    }
    tribunBoyunKopya.translate(0, -0.185, -0.006);
    const tribunKafa = this.bufferGeometrileriBirlestir([tribunKafaKopya, tribunBoyunKopya]);
    tribunKafaKopya.dispose();
    tribunBoyunKopya.dispose();

    const tribunUstKopya = ustGovde.clone();
    const tribunYakaKopya = yaka.clone();
    tribunYakaKopya.translate(0, 0.50, 0);
    const tribunGovde = this.bufferGeometrileriBirlestir([tribunUstKopya, tribunYakaKopya]);
    tribunUstKopya.dispose();
    tribunYakaKopya.dispose();

    const tribunAltVucut = this.tribunOturanAltVucutOlustur(pelvis, uyluk, baldir, ayakkabiUst);
    const tribunKol = this.tribunKolGeometrisiOlustur(ustKolUzun, onKol, el);

    const tumGeometriler = [
      kafa,
      boyun,
      ustGovde,
      pelvis,
      yaka,
      ustKolUzun,
      ustKolKisa,
      onKol,
      el,
      uyluk,
      baldir,
      ayakkabiTaban,
      ayakkabiUst,
      kisaSac,
      topuzSac,
      sporKep,
      bere,
      tribunKafa,
      tribunGovde,
      tribunAltVucut,
      tribunKol,
    ];
    this.olusturulanGeometriler.push(...tumGeometriler);

    return {
      kafa,
      boyun,
      ustGovde,
      pelvis,
      yaka,
      ustKolUzun,
      ustKolKisa,
      onKol,
      el,
      uyluk,
      baldir,
      ayakkabiTaban,
      ayakkabiUst,
      kisaSac,
      topuzSac,
      sporKep,
      bere,
      tribunKafa,
      tribunGovde,
      tribunAltVucut,
      tribunKol,
    };
  }

  private latheProfilOlustur(
    kesitler: Array<[number, number]>,
    radyalSegment = 18,
  ): THREE.LatheGeometry {
    const noktalar = kesitler.map(([yaricap, yukseklik]) => new THREE.Vector2(yaricap, yukseklik));
    return new THREE.LatheGeometry(noktalar, radyalSegment);
  }

  /**
   * 3B burun, kaş kemeri, elmacık kemiği, çene hattı ve kulaklara sahip anatomik kafa.
   * UV (0.5, 0.5) noktası +Z ön yüz merkezine hizalanır.
   */
  private anatomikKafaGeometrisiOlustur(): THREE.BufferGeometry {
    const kafa = new THREE.SphereGeometry(0.114, 28, 22);
    // Varsayılan SphereGeometry'de u=0.5, v=0.5 noktası +X'tedir; -90° Y dönüşü ile +Z'ye getirilir
    kafa.rotateY(-Math.PI * 0.5);

    const pos = kafa.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      let x = pos.getX(i) * 0.86;
      let y = pos.getY(i) * 1.07;
      let z = pos.getZ(i) * 0.96;

      // Alt yüz: yanaklardan çeneye doğru incelme ve öne hafif çene ucu
      if (y < -0.025) {
        const altFaktor = THREE.MathUtils.clamp((-y - 0.025) / 0.095, 0, 1);
        x *= 1.0 - altFaktor * 0.30;
        if (z > 0.01) {
          z += altFaktor * 0.010 * Math.exp(-Math.pow(x / 0.032, 2));
        } else {
          // Ense altı daralması
          z *= 1.0 - altFaktor * 0.14;
        }
      }

      // 3B Burun çıkıntısı (+Z önünde)
      if (z > 0.04 && y > -0.036 && y < 0.028 && Math.abs(x) < 0.028) {
        const yatay = Math.exp(-Math.pow(x / 0.013, 2));
        const dikeyNorm = (y + 0.032) / 0.058;
        const burunProfili = Math.sin(THREE.MathUtils.clamp(dikeyNorm, 0, 1) * Math.PI);
        const altUcu = Math.exp(-Math.pow((y + 0.016) / 0.013, 2));
        z += yatay * (burunProfili * 0.017 + altUcu * 0.013);
      }

      // Kaş kemeri ve hafif göz çukuru
      if (z > 0.04 && Math.abs(x) > 0.010 && Math.abs(x) < 0.056) {
        const kasKemeri = Math.exp(-Math.pow((y - 0.026) / 0.011, 2));
        const gozCukuru = Math.exp(-Math.pow((y - 0.010) / 0.012, 2));
        z += kasKemeri * 0.006 - gozCukuru * 0.005;
      }

      // Kulaklar (yanlarda ±X)
      if (Math.abs(x) > 0.072 && Math.abs(z) < 0.026 && y > -0.028 && y < 0.026) {
        const kulakBolge =
          Math.exp(-Math.pow(z / 0.014, 2)) * Math.exp(-Math.pow((y + 0.002) / 0.017, 2));
        x += Math.sign(x) * kulakBolge * 0.015;
      }

      pos.setXYZ(i, x, y, z);
    }

    kafa.computeVertexNormals();
    return kafa;
  }

  private ustGovdeAnatomikSekillendir(geo: THREE.BufferGeometry): void {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i) * 1.26;
      const y = pos.getY(i);
      let z = pos.getZ(i) * 0.78;

      // Göğüs pektoral kabarıklığı (+Z ön yüz)
      if (z > 0.02 && y > 0.24 && y < 0.44) {
        const yukariFaktor = Math.sin(((y - 0.24) / 0.20) * Math.PI);
        const lob = Math.exp(-Math.pow((Math.abs(x) - 0.068) / 0.052, 2));
        z += yukariFaktor * lob * 0.022;
      }

      // Sırt omurga oluğu ve kürek kemikleri (-Z arka yüz)
      if (z < -0.02 && y > 0.16 && y < 0.44) {
        const omurga = Math.exp(-Math.pow(x / 0.026, 2));
        z += omurga * 0.012;
      }

      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
  }

  private anatomikElGeometrisiOlustur(): THREE.BufferGeometry {
    const avuc = new THREE.SphereGeometry(0.036, 10, 8);
    avuc.scale(0.88, 1.35, 0.46);
    avuc.translate(0, -0.042, 0.004);

    const parmaklar = new THREE.CylinderGeometry(0.024, 0.015, 0.072, 8);
    parmaklar.scale(1.15, 1.0, 0.46);
    parmaklar.translate(0, -0.105, 0.006);

    const basParmak = new THREE.CapsuleGeometry(0.008, 0.028, 4, 6);
    basParmak.rotateZ(0.45);
    basParmak.translate(0.024, -0.050, 0.014);

    return this.bufferGeometrileriBirlestir([avuc, parmaklar, basParmak]);
  }

  private ayakkabiParcasiOlustur(tabanMi: boolean): THREE.BufferGeometry {
    if (tabanMi) {
      const taban = new THREE.BoxGeometry(0.094, 0.026, 0.255);
      taban.translate(0, 0.013, 0.055);
      return taban;
    }

    const arkaTopuk = new THREE.CylinderGeometry(0.044, 0.047, 0.062, 12);
    arkaTopuk.translate(0, 0.048, -0.024);

    const ortaSaya = new THREE.BoxGeometry(0.090, 0.052, 0.145);
    ortaSaya.translate(0, 0.046, 0.042);

    const burunKismi = new THREE.SphereGeometry(0.045, 12, 8);
    burunKismi.scale(0.98, 0.56, 1.35);
    burunKismi.translate(0, 0.038, 0.125);

    return this.bufferGeometrileriBirlestir([arkaTopuk, ortaSaya, burunKismi]);
  }

  private kisaSacGeometrisiOlustur(): THREE.BufferGeometry {
    const kubbe = new THREE.SphereGeometry(0.119, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
    kubbe.rotateY(-Math.PI * 0.5);
    kubbe.scale(0.87, 1.07, 0.99);
    // Yüzün (+Z) açık kalması için hafifçe arkaya/yukarı eğim ver
    kubbe.rotateX(-0.34);
    kubbe.translate(0, 0.014, -0.014);
    return kubbe;
  }

  private topuzSacGeometrisiOlustur(temelKisaSac: THREE.BufferGeometry): THREE.BufferGeometry {
    const kubbeKopya = temelKisaSac.clone();
    const topuz = new THREE.SphereGeometry(0.048, 12, 10);
    topuz.scale(0.92, 0.92, 1.08);
    topuz.translate(0, 0.045, -0.118);
    return this.bufferGeometrileriBirlestir([kubbeKopya, topuz]);
  }

  private sporKepGeometrisiOlustur(): THREE.BufferGeometry {
    const tac = new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    tac.rotateY(-Math.PI * 0.5);
    tac.scale(0.89, 0.94, 1.0);
    tac.translate(0, 0.024, -0.006);

    const siperlik = new THREE.CylinderGeometry(0.105, 0.115, 0.012, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
    siperlik.scale(0.86, 1.0, 1.25);
    siperlik.rotateX(0.16);
    siperlik.translate(0, 0.028, 0.072);

    return this.bufferGeometrileriBirlestir([tac, siperlik]);
  }

  private bereGeometrisiOlustur(): THREE.BufferGeometry {
    const kubbe = new THREE.SphereGeometry(0.121, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
    kubbe.rotateY(-Math.PI * 0.5);
    kubbe.scale(0.88, 1.12, 0.98);
    kubbe.rotateX(-0.22);
    kubbe.translate(0, 0.025, -0.008);

    const kenar = new THREE.TorusGeometry(0.104, 0.018, 8, 20);
    kenar.rotateX(Math.PI * 0.5 - 0.22);
    kenar.scale(0.88, 1.0, 0.98);
    kenar.translate(0, 0.022, -0.004);

    return this.bufferGeometrileriBirlestir([kubbe, kenar]);
  }

  private tribunOturanAltVucutOlustur(
    pelvis: THREE.BufferGeometry,
    uyluk: THREE.BufferGeometry,
    baldir: THREE.BufferGeometry,
    ayakkabi: THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    const parcalar: THREE.BufferGeometry[] = [];
    const altPelvis = pelvis.clone();
    altPelvis.translate(0, 0.05, 0);
    parcalar.push(altPelvis);

    for (const x of [-0.095, 0.095]) {
      const tUyluk = uyluk.clone();
      tUyluk.rotateX(-Math.PI * 0.48);
      tUyluk.translate(x, 0.05, 0.02);
      parcalar.push(tUyluk);

      const tBaldir = baldir.clone();
      tBaldir.translate(x, 0.04, 0.41);
      parcalar.push(tBaldir);

      const tAyakkabi = ayakkabi.clone();
      tAyakkabi.translate(x, -0.39, 0.41);
      parcalar.push(tAyakkabi);
    }

    return this.bufferGeometrileriBirlestir(parcalar);
  }

  private tribunKolGeometrisiOlustur(
    ustKol: THREE.BufferGeometry,
    onKol: THREE.BufferGeometry,
    el: THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    const k1 = ustKol.clone();
    const k2 = onKol.clone();
    k2.rotateX(-0.28);
    k2.translate(0, -0.25, 0.01);
    const k3 = el.clone();
    k3.rotateX(-0.28);
    k3.translate(0, -0.46, 0.07);
    return this.bufferGeometrileriBirlestir([k1, k2, k3]);
  }

  /**
   * Harici kütüphane kullanmadan uyumlu (position, normal, uv) BufferGeometry'leri birleştirir.
   */
  private bufferGeometrileriBirlestir(parcalar: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const duzenlenmis = parcalar.map((p) => {
      const kopya = p.index ? p.toNonIndexed() : p.clone();
      if (!kopya.attributes.normal) {
        kopya.computeVertexNormals();
      }
      if (!kopya.attributes.uv) {
        const sayac = kopya.attributes.position.count;
        kopya.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(sayac * 2), 2));
      }
      return kopya;
    });

    let toplamVertex = 0;
    for (const g of duzenlenmis) {
      toplamVertex += g.attributes.position.count;
    }

    const konumlar = new Float32Array(toplamVertex * 3);
    const normaller = new Float32Array(toplamVertex * 3);
    const uvler = new Float32Array(toplamVertex * 2);

    let ofset = 0;
    for (const g of duzenlenmis) {
      const pos = g.attributes.position.array as Float32Array;
      const norm = g.attributes.normal.array as Float32Array;
      const uv = g.attributes.uv.array as Float32Array;
      const adet = g.attributes.position.count;

      konumlar.set(pos, ofset * 3);
      normaller.set(norm, ofset * 3);
      uvler.set(uv, ofset * 2);
      ofset += adet;
      g.dispose();
    }

    const sonuc = new THREE.BufferGeometry();
    sonuc.setAttribute('position', new THREE.BufferAttribute(konumlar, 3));
    sonuc.setAttribute('normal', new THREE.BufferAttribute(normaller, 3));
    sonuc.setAttribute('uv', new THREE.BufferAttribute(uvler, 2));
    return sonuc;
  }

  // --- Dışa Açık Tribün InstancedMesh Erişicileri ---
  public tribunKafaGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.tribunKafa;
  }

  public tribunGovdeGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.tribunGovde;
  }

  public tribunAltVucutGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.tribunAltVucut;
  }

  public tribunKolGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.tribunKol;
  }

  public tribunKisaSacGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.kisaSac;
  }

  public tribunKepGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.sporKep;
  }

  public tribunTopuzSacGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.topuzSac;
  }

  public tribunBereGeometrisiGetir(): THREE.BufferGeometry {
    return this.geometriler.bere;
  }

  /**
   * Tribün seyircilerinin `instanceColor` ten renkleriyle çarpıldığında gerçekçi göz/kaş/dudak
   * görünümü veren beyaz bazlı ortak yüz dokusu.
   */
  public tribunOrtakYuzDokusuGetir(): THREE.CanvasTexture {
    if (this.tribunOrtakYuzDokusuCache) {
      return this.tribunOrtakYuzDokusuCache;
    }
    this.tribunOrtakYuzDokusuCache = this.yuzDokusuOlustur(0xffffff, '#2f1d14', 1.0, 'yok', false);
    return this.tribunOrtakYuzDokusuCache;
  }

  /**
   * Havuz kenarında, platformda veya güvertede ayakta duran/yürüyen tam eklemli gerçekçi insan oluşturur.
   * Tabanı tam yerel Y = 0 düzlemine basar (~1.72 m boy).
   */
  public ayaktaInsanOlustur(secenekler: InsanGorunumSecenekleri = {}): AnatomikInsanFiguru {
    return this.insanInsaEt(secenekler, false);
  }

  /**
   * Masa veya cankurtaran kulesi koltuğunda oturan tam eklemli gerçekçi insan oluşturur.
   * Yerel Y = 0 noktası oturak üst yüzeyidir.
   */
  public oturanInsanOlustur(secenekler: InsanGorunumSecenekleri = {}): AnatomikInsanFiguru {
    return this.insanInsaEt(secenekler, true);
  }

  private insanInsaEt(
    secenekler: InsanGorunumSecenekleri,
    oturanMi: boolean,
  ): AnatomikInsanFiguru {
    const ciltRengi = secenekler.ciltRengi ?? 0xdeb08c;
    const sacRengi = secenekler.sacRengi ?? 0x2a1b14;
    const ustAnaRenk = secenekler.ustAnaRenk ?? 0xf8fafc;
    const ustIkinciRenk = secenekler.ustIkinciRenk ?? GALATASARAY_RENKLERI.HEX_SARI_ANA;
    const pantolonRengi = secenekler.pantolonRengi ?? 0x0f172a;
    const ayakkabiRengi = secenekler.ayakkabiRengi ?? 0xf1f5f9;
    const gozRengi = secenekler.gozRengi ?? '#3b2416';
    const sakalTipi = secenekler.sakalTipi ?? 'yok';
    const sacTipi = secenekler.sacTipi ?? 'kisa';
    const gunesGozluguMu = secenekler.gunesGozluguMu ?? false;
    const kiyafetTipi = secenekler.kiyafetTipi ?? 'sade';
    const kisaKolMu = secenekler.kisaKolMu ?? true;
    const olcek = secenekler.olcek ?? 1.0;

    const ciltMat = this.standartMateryalAl(ciltRengi, 0.50, 0.03);
    const ustKolMat = kiyafetTipi === 'hakem_ceket' ? this.standartMateryalAl(ustAnaRenk, 0.56, 0.04) : this.standartMateryalAl(ustAnaRenk, 0.52, 0.04);
    const pantolonMat = this.standartMateryalAl(pantolonRengi, 0.68, 0.04);
    const ayakkabiMat = this.standartMateryalAl(ayakkabiRengi, 0.42, 0.08);
    const tabanMat = this.standartMateryalAl(0x111827, 0.72, 0.05);
    const sacMat = this.standartMateryalAl(sacRengi, 0.68, 0.04);
    const kepMat = this.standartMateryalAl(ustIkinciRenk, 0.45, 0.05);
    const yuzMat = this.yuzMateryaliAl(ciltRengi, gozRengi, sakalTipi, gunesGozluguMu);
    const kiyafetMat =
      kiyafetTipi === 'sade'
        ? ustKolMat
        : this.kiyafetMateryaliAl(kiyafetTipi, ustAnaRenk, ustIkinciRenk);

    const grup = new THREE.Group();
    grup.scale.setScalar(olcek);

    const kalcaY = oturanMi ? 0.055 : 0.84;

    const govdeGrubu = new THREE.Group();
    govdeGrubu.position.set(0, kalcaY, 0);
    grup.add(govdeGrubu);

    const pelvisMesh = this.meshYap(this.geometriler.pelvis, pantolonMat, 0, 0, 0);
    const ustGovdeMesh = this.meshYap(this.geometriler.ustGovde, kiyafetMat, 0, 0.01, 0);
    const yakaMesh = this.meshYap(this.geometriler.yaka, this.standartMateryalAl(ustIkinciRenk, 0.50, 0.04), 0, 0.51, 0);
    govdeGrubu.add(pelvisMesh, ustGovdeMesh, yakaMesh);

    // Boyun & Anatomik Kafa & Saç / Şapka
    const boyunPivoti = new THREE.Group();
    boyunPivoti.position.set(0, 0.51, 0);
    govdeGrubu.add(boyunPivoti);

    const boyunMesh = this.meshYap(this.geometriler.boyun, ciltMat, 0, 0, 0);
    const kafaMesh = this.meshYap(this.geometriler.kafa, yuzMat, 0, 0.195, 0.006);
    boyunPivoti.add(boyunMesh, kafaMesh);

    if (sacTipi === 'kisa') {
      boyunPivoti.add(this.meshYap(this.geometriler.kisaSac, sacMat, 0, 0.195, 0.006));
    } else if (sacTipi === 'topuz') {
      boyunPivoti.add(this.meshYap(this.geometriler.topuzSac, sacMat, 0, 0.195, 0.006));
    } else if (sacTipi === 'kep') {
      boyunPivoti.add(this.meshYap(this.geometriler.kisaSac, sacMat, 0, 0.195, 0.006));
      boyunPivoti.add(this.meshYap(this.geometriler.sporKep, kepMat, 0, 0.197, 0.006));
    } else if (sacTipi === 'bere') {
      boyunPivoti.add(this.meshYap(this.geometriler.bere, kepMat, 0, 0.196, 0.006));
    }

    // Eklemli Sol ve Sağ Kollar
    const kolKur = (taraf: -1 | 1): { omuz: THREE.Group; dirsek: THREE.Group; elNoktasi: THREE.Object3D } => {
      const omuz = new THREE.Group();
      omuz.position.set(taraf * 0.215, 0.445, 0);
      govdeGrubu.add(omuz);

      if (kisaKolMu) {
        omuz.add(this.meshYap(this.geometriler.ustKolKisa, ustKolMat, 0, 0, 0));
        omuz.add(this.meshYap(this.geometriler.ustKolUzun, ciltMat, 0, 0, 0));
      } else {
        omuz.add(this.meshYap(this.geometriler.ustKolUzun, ustKolMat, 0, 0, 0));
      }

      const dirsek = new THREE.Group();
      dirsek.position.set(0, -0.26, 0);
      omuz.add(dirsek);

      const onKolMat = kisaKolMu ? ciltMat : ustKolMat;
      dirsek.add(this.meshYap(this.geometriler.onKol, onKolMat, 0, 0, 0));
      dirsek.add(this.meshYap(this.geometriler.el, ciltMat, 0, -0.22, 0));

      const elNoktasi = new THREE.Object3D();
      elNoktasi.position.set(0, -0.28, 0.01);
      dirsek.add(elNoktasi);

      return { omuz, dirsek, elNoktasi };
    };

    const solKol = kolKur(-1);
    const sagKol = kolKur(1);

    // Eklemli Sol ve Sağ Bacaklar
    const bacakKur = (taraf: -1 | 1): { kalca: THREE.Group; diz: THREE.Group } => {
      const kalca = new THREE.Group();
      kalca.position.set(taraf * 0.098, 0, 0);
      grup.add(kalca);
      kalca.position.y = kalcaY;

      kalca.add(this.meshYap(this.geometriler.uyluk, pantolonMat, 0, 0, 0));

      const diz = new THREE.Group();
      diz.position.set(0, -0.40, 0);
      kalca.add(diz);

      // Şortlu cankurtaran hariç tam boy pantolon, cankurtaran çıplak baldırlı
      const baldirMat = kiyafetTipi === 'cankurtaran' ? ciltMat : pantolonMat;
      diz.add(this.meshYap(this.geometriler.baldir, baldirMat, 0, 0, 0));

      const ayakTaban = this.meshYap(this.geometriler.ayakkabiTaban, tabanMat, 0, -0.44, 0);
      const ayakUst = this.meshYap(this.geometriler.ayakkabiUst, ayakkabiMat, 0, -0.44, 0);
      diz.add(ayakTaban, ayakUst);

      return { kalca, diz };
    };

    const solBacak = bacakKur(-1);
    const sagBacak = bacakKur(1);

    if (oturanMi) {
      solBacak.kalca.rotation.x = -Math.PI * 0.47;
      solBacak.diz.rotation.x = Math.PI * 0.47;
      sagBacak.kalca.rotation.x = -Math.PI * 0.47;
      sagBacak.diz.rotation.x = Math.PI * 0.47;
    }

    return {
      grup,
      govdeGrubu,
      boyunPivoti,
      solOmuz: solKol.omuz,
      solDirsek: solKol.dirsek,
      solElNoktasi: solKol.elNoktasi,
      sagOmuz: sagKol.omuz,
      sagDirsek: sagKol.dirsek,
      sagElNoktasi: sagKol.elNoktasi,
      solKalca: solBacak.kalca,
      solDiz: solBacak.diz,
      sagKalca: sagBacak.kalca,
      sagDiz: sagBacak.diz,
    };
  }

  private meshYap(
    geometri: THREE.BufferGeometry,
    materyal: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometri, materyal);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private standartMateryalAl(
    renk: number,
    puruzluluk: number,
    metaliklik: number,
  ): THREE.MeshStandardMaterial {
    const anahtar = `${renk}_${puruzluluk.toFixed(2)}_${metaliklik.toFixed(2)}`;
    const mevcut = this.materyalOnbellegi.get(anahtar);
    if (mevcut) {
      return mevcut;
    }
    const yeni = new THREE.MeshStandardMaterial({
      color: renk,
      roughness: puruzluluk,
      metalness: metaliklik,
    });
    this.materyalOnbellegi.set(anahtar, yeni);
    this.olusturulanMateryaller.push(yeni);
    return yeni;
  }

  private yuzMateryaliAl(
    ciltRengi: number,
    gozRengi: string,
    sakalTipi: SakalTipi,
    gunesGozluguMu: boolean,
  ): THREE.MeshStandardMaterial {
    const anahtar = `${ciltRengi}_${gozRengi}_${sakalTipi}_${gunesGozluguMu ? 1 : 0}`;
    const mevcut = this.yuzMateryalOnbellegi.get(anahtar);
    if (mevcut) {
      return mevcut;
    }
    const doku = this.yuzDokusuOlustur(ciltRengi, gozRengi, 1.0, sakalTipi, gunesGozluguMu);
    const yeni = new THREE.MeshStandardMaterial({
      map: doku,
      roughness: 0.50,
      metalness: 0.03,
    });
    this.yuzMateryalOnbellegi.set(anahtar, yeni);
    this.olusturulanMateryaller.push(yeni);
    return yeni;
  }

  private kiyafetMateryaliAl(
    tip: KiyafetTipi,
    anaRenk: number,
    ikinciRenk: number,
  ): THREE.MeshStandardMaterial {
    const anahtar = `${tip}_${anaRenk}_${ikinciRenk}`;
    const mevcut = this.kiyafetMateryalOnbellegi.get(anahtar);
    if (mevcut) {
      return mevcut;
    }
    const doku = this.kiyafetDokusuOlustur(tip, anaRenk, ikinciRenk);
    const yeni = new THREE.MeshStandardMaterial({
      map: doku,
      roughness: 0.52,
      metalness: 0.05,
    });
    this.kiyafetMateryalOnbellegi.set(anahtar, yeni);
    this.olusturulanMateryaller.push(yeni);
    return yeni;
  }

  /**
   * Kafa UV merkezine (u=0.5, v=0.5 -> +Z ön yüz) tam oturan yüksek çözünürlüklü yüz dokusu.
   */
  private yuzDokusuOlustur(
    ciltHex: number,
    gozRengi: string,
    kasKalinlik: number,
    sakalTipi: SakalTipi,
    gunesGozluguMu: boolean,
  ): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 256;
    tuval.height = 256;
    const b = tuval.getContext('2d');
    if (!b) {
      throw new Error('Yüz dokusu tuval bağlamı oluşturulamadı.');
    }

    const r = (ciltHex >> 16) & 0xff;
    const g = (ciltHex >> 8) & 0xff;
    const bl = ciltHex & 0xff;
    b.fillStyle = `rgb(${r}, ${g}, ${bl})`;
    b.fillRect(0, 0, 256, 256);

    // Yanak allığı & göz çukuru/çene altı yumuşak gölgeleme
    const golgeR = Math.max(0, Math.round(r * 0.85));
    const golgeG = Math.max(0, Math.round(g * 0.80));
    const golgeB = Math.max(0, Math.round(bl * 0.78));
    b.fillStyle = `rgba(${golgeR}, ${golgeG}, ${golgeB}, 0.35)`;
    b.beginPath();
    b.ellipse(128, 138, 12, 5, 0, 0, Math.PI * 2);
    b.fill();

    // Doğal kirli sakal / bıyık
    if (sakalTipi === 'kirli') {
      b.fillStyle = 'rgba(38, 28, 24, 0.28)';
      b.beginPath();
      b.ellipse(128, 174, 24, 24, 0, 0, Math.PI);
      b.fill();
    } else if (sakalTipi === 'biyik') {
      b.fillStyle = 'rgba(42, 30, 24, 0.72)';
      b.beginPath();
      b.ellipse(128, 148, 12, 3.5, 0, 0, Math.PI * 2);
      b.fill();
    }

    // Kaşlar (cy ≈ 105)
    b.strokeStyle = '#261812';
    b.lineWidth = 2.6 * kasKalinlik;
    b.lineCap = 'round';
    for (const isaret of [-1, 1]) {
      const gx = 128 + isaret * 11;
      b.beginPath();
      b.moveTo(gx - isaret * 5, 108);
      b.quadraticCurveTo(gx, 103, gx + isaret * 6, 107);
      b.stroke();
    }

    // Gözler veya spor güneş gözlüğü (cy ≈ 116)
    if (gunesGozluguMu) {
      b.fillStyle = '#0f172a';
      b.strokeStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
      b.lineWidth = 2;
      for (const isaret of [-1, 1]) {
        const gx = 128 + isaret * 11;
        b.beginPath();
        b.ellipse(gx, 117, 7.5, 5.2, 0, 0, Math.PI * 2);
        b.fill();
        b.stroke();
      }
      b.beginPath();
      b.moveTo(123, 116);
      b.lineTo(133, 116);
      b.stroke();
    } else {
      for (const isaret of [-1, 1]) {
        const gx = 128 + isaret * 10.5;
        // Sklera (göz akı)
        b.fillStyle = '#f8fafc';
        b.beginPath();
        b.ellipse(gx, 117, 5.2, 3.2, 0, 0, Math.PI * 2);
        b.fill();

        // İris
        b.fillStyle = gozRengi;
        b.beginPath();
        b.arc(gx, 117, 2.5, 0, Math.PI * 2);
        b.fill();

        // Göz bebeği & kornea parıltısı
        b.fillStyle = '#090d16';
        b.beginPath();
        b.arc(gx, 117, 1.3, 0, Math.PI * 2);
        b.fill();

        b.fillStyle = '#ffffff';
        b.beginPath();
        b.arc(gx + 0.8, 116.2, 0.7, 0, Math.PI * 2);
        b.fill();

        // Üst kirpik / göz kapağı çizgisi
        b.strokeStyle = '#1e1410';
        b.lineWidth = 1.4;
        b.beginPath();
        b.moveTo(gx - 5.2, 117);
        b.quadraticCurveTo(gx, 113, gx + 5.2, 117);
        b.stroke();
      }
    }

    // Burun delikleri yumuşak gölgesi
    b.fillStyle = 'rgba(85, 48, 36, 0.42)';
    b.beginPath();
    b.arc(125.5, 138, 1.3, 0, Math.PI * 2);
    b.arc(130.5, 138, 1.3, 0, Math.PI * 2);
    b.fill();

    // Dudaklar ve ağız çizgisi (cy ≈ 157)
    b.fillStyle = 'rgba(178, 86, 82, 0.78)';
    b.beginPath();
    b.ellipse(128, 157, 7.5, 2.8, 0, 0, Math.PI * 2);
    b.fill();
    b.strokeStyle = 'rgba(98, 42, 42, 0.75)';
    b.lineWidth = 1.1;
    b.beginPath();
    b.moveTo(120.5, 157);
    b.lineTo(135.5, 157);
    b.stroke();

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.needsUpdate = true;
    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * Lathe üst gövde için kıyafet dokusu. Three.js LatheGeometry'de rotateY(-PI/2) sonrası
   * u = 0.75 ön merkez (+Z), u = 0.25 arka sırt, v = 1 boyun köküdür.
   */
  private kiyafetDokusuOlustur(
    tip: KiyafetTipi,
    anaHex: number,
    ikinciHex: number,
  ): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 256;
    tuval.height = 256;
    const b = tuval.getContext('2d');
    if (!b) {
      throw new Error('Kıyafet dokusu tuval bağlamı oluşturulamadı.');
    }

    const anaRenk = `#${anaHex.toString(16).padStart(6, '0')}`;
    const ikinciRenk = `#${ikinciHex.toString(16).padStart(6, '0')}`;
    b.fillStyle = anaRenk;
    b.fillRect(0, 0, 256, 256);

    // Ön merkez u ≈ 0.75 (x = 192) olacak şekilde LatheGeometry UV eşlemesi
    // Eğer göğüs ön yüzü u = 0.25 veya 0.75 noktasındaysa her iki çeyreği veya tam hizalı 192'yi kontrol edelim:
    // Not: LatheGeometry default phi=0..2PI; theta=phi; x = r*sin(phi), z = r*cos(phi).
    // rotateY(-PI/2) -> x' = -z = -r*cos(phi), z' = x = r*sin(phi).
    // Dolayısıyla +Z yönü sin(phi) = 1 -> phi = PI/2 -> u = 0.25 (x = 64) !!
    // Dikkat: SphereGeometry x=-cos, z=sin iken LatheGeometry x=r*sin, z=r*cos'tur.
    // Hesap doğrusu: u=0.25 -> cx = 64 ön merkez (+Z), cx = 192 arka sırt (-Z)!
    const onX = 64;

    if (tip === 'hakem_polo') {
      // Lacivert polo patı, düğmeler, sol göğüs kokartı ve boyun düdük kordonu
      b.fillStyle = '#0f172a';
      b.fillRect(onX - 6, 12, 12, 62);
      b.fillStyle = '#f8fafc';
      for (const dy of [28, 44, 60]) {
        b.beginPath();
        b.arc(onX, dy, 2.2, 0, Math.PI * 2);
        b.fill();
      }
      // Boyun kordonu
      b.strokeStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
      b.lineWidth = 3;
      b.beginPath();
      b.moveTo(onX - 18, 0);
      b.lineTo(onX, 118);
      b.lineTo(onX + 18, 0);
      b.stroke();
      // Kokart
      b.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
      b.beginPath();
      b.arc(onX + 26, 62, 10, 0, Math.PI * 2);
      b.fill();
    } else if (tip === 'hakem_ceket') {
      // Beyaz V gömlek + kravat + ceket yakası ve rozet
      b.fillStyle = '#f8fafc';
      b.beginPath();
      b.moveTo(onX - 24, 0);
      b.lineTo(onX + 24, 0);
      b.lineTo(onX, 92);
      b.closePath();
      b.fill();

      // GS Sarı-Kırmızı çizgili kravat
      b.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
      b.fillRect(onX - 4, 4, 8, 86);
      b.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
      b.fillRect(onX - 4, 24, 8, 8);
      b.fillRect(onX - 4, 52, 8, 8);

      // Altın hakem rozeti
      b.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
      b.beginPath();
      b.arc(onX + 26, 64, 7, 0, Math.PI * 2);
      b.fill();
    } else if (tip === 'gs_esofman') {
      // Fermuar + göğüs şeridi + GS sarı kol/omuz şeritleri
      b.fillStyle = ikinciRenk;
      b.fillRect(0, 74, 256, 14);
      b.strokeStyle = '#e2e8f0';
      b.lineWidth = 2.5;
      b.beginPath();
      b.moveTo(onX, 0);
      b.lineTo(onX, 250);
      b.stroke();

      // Sol göğüste GS kulüp arması
      b.fillStyle = '#111827';
      b.beginPath();
      b.arc(onX + 28, 52, 11, 0, Math.PI * 2);
      b.fill();
      b.strokeStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
      b.lineWidth = 2;
      b.stroke();
      b.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
      b.font = 'bold 10px Inter, sans-serif';
      b.textAlign = 'center';
      b.textBaseline = 'middle';
      b.fillText('GS', onX + 28, 52);
    } else if (tip === 'cankurtaran') {
      // Göğüste beyaz/sarı artı ve "CAN" şeridi + düdük kordonu
      b.fillStyle = '#f8fafc';
      b.fillRect(onX - 30, 52, 60, 26);
      b.fillStyle = anaRenk;
      b.fillRect(onX - 3, 56, 6, 18);
      b.fillRect(onX - 9, 62, 18, 6);

      b.strokeStyle = GALATASARAY_RENKLERI.SARI_ANA;
      b.lineWidth = 3;
      b.beginPath();
      b.moveTo(onX - 16, 0);
      b.lineTo(onX, 108);
      b.lineTo(onX + 16, 0);
      b.stroke();
    }

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.needsUpdate = true;
    this.olusturulanDokular.push(doku);
    return doku;
  }

  public temizle(): void {
    if (this.temizlendiMi) {
      return;
    }
    this.temizlendiMi = true;

    for (const geom of this.olusturulanGeometriler) {
      geom.dispose();
    }
    this.olusturulanGeometriler.length = 0;

    for (const mat of this.olusturulanMateryaller) {
      mat.dispose();
    }
    this.olusturulanMateryaller.length = 0;

    for (const doku of this.olusturulanDokular) {
      doku.dispose();
    }
    this.olusturulanDokular.length = 0;

    this.materyalOnbellegi.clear();
    this.yuzMateryalOnbellegi.clear();
    this.kiyafetMateryalOnbellegi.clear();
    this.tribunOrtakYuzDokusuCache = null;
  }
}
