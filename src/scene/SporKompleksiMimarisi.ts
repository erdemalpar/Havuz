import * as THREE from 'three';
import { GALATASARAY_RENKLERI, KaynakTemizlenebilir } from '../types/simulation';

const SALON_YARI_X = 12.0;
const SALON_YARI_Z = 16.0;
const TAVAN_YUKSEKLIK_Y = 16.2;
const GUVERTE_UST_Y = 0.175;
const GUVERTE_KALINLIK = 0.26;
const HAVUZ_ACIKLIK_YARI_X = 4.35;
const HAVUZ_ACIKLIK_YARI_Z = 8.35;

/**
 * Galatasaray Spor Kompleksi (Natatorium) mimarisini yöneten sınıf:
 * 4 parçalı kaymaz taş güverte, Sarı-Kırmızı koreografili tribünler ve pankart
 * şeritleri, 16.2m yüksek tavanlı salon kabuğu, panoramik pencereler,
 * çelik çatı makasları, kulüp sancakları, LED projektörler, dijital skorboard
 * ve cankurtaran kulesi.
 */
export class SporKompleksiMimarisi implements KaynakTemizlenebilir {
  private readonly sahne: THREE.Scene;
  private readonly anaGrup: THREE.Group;
  private readonly olusturulanGeometriler: THREE.BufferGeometry[] = [];
  private readonly olusturulanMateryaller: THREE.Material[] = [];
  private readonly olusturulanDokular: THREE.Texture[] = [];

  private temizlendiMi = false;

  constructor(sahne: THREE.Scene) {
    this.sahne = sahne;
    this.anaGrup = new THREE.Group();
    this.anaGrup.name = 'sporKompleksiMimarisi';

    this.havuzGuvertesiOlustur();
    this.seyirciTribunleriOlustur();
    this.salonKabuguVePencerelerOlustur();
    this.catiMakaslariVeLedProjektorlerOlustur();
    this.kulupSancaklariOlustur();
    this.dijitalSkorboardOlustur();
    this.cankurtaranKulesiOlustur();

    this.sahne.add(this.anaGrup);
  }

  /**
   * Kutu geometrisinin UV koordinatlarını dünya boyutlarıyla ölçekler,
   * böylece farklı boyutlu güverte parçalarının taş derzleri kesintisiz birleşir.
   */
  private kutuMetrikUvUygula(
    geometri: THREE.BoxGeometry,
    genislik: number,
    yukseklik: number,
    derinlik: number,
    merkezX: number,
    merkezZ: number,
    olcek: number,
  ): void {
    const konum = geometri.attributes.position;
    const normal = geometri.attributes.normal;
    const uv = geometri.attributes.uv;

    for (let i = 0; i < konum.count; i += 1) {
      const lx = konum.getX(i);
      const ly = konum.getY(i);
      const lz = konum.getZ(i);
      const nx = Math.abs(normal.getX(i));
      const ny = Math.abs(normal.getY(i));

      if (ny > 0.5) {
        uv.setXY(i, (merkezX + lx) * olcek, (merkezZ + lz) * olcek);
      } else if (nx > 0.5) {
        uv.setXY(i, (lz + derinlik * 0.5) * olcek, (ly + yukseklik * 0.5) * olcek);
      } else {
        uv.setXY(i, (lx + genislik * 0.5) * olcek, (ly + yukseklik * 0.5) * olcek);
      }
    }
    uv.needsUpdate = true;
  }

  /**
   * Açık gri-bej kaymaz taş güverte dokusu üretir.
   */
  private guverteTasDokusuOlustur(): THREE.CanvasTexture {
    const boyut = 512;
    const tuval = document.createElement('canvas');
    tuval.width = boyut;
    tuval.height = boyut;

    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Güverte taş dokusu için 2B tuval bağlamı oluşturulamadı.');
    }

    baglam.fillStyle = '#c8c2b7';
    baglam.fillRect(0, 0, boyut, boyut);

    const karoSayisi = 4;
    const karoBoyutu = boyut / karoSayisi;
    for (let s = 0; s < karoSayisi; s += 1) {
      for (let k = 0; k < karoSayisi; k += 1) {
        const tohum = Math.sin((s * 17 + k * 31) * 12.9898) * 43758.5453;
        const sapma = (tohum - Math.floor(tohum) - 0.5) * 8;
        const r = Math.round(218 + sapma);
        const g = Math.round(213 + sapma);
        const b = Math.round(203 + sapma);

        baglam.fillStyle = `rgb(${r}, ${g}, ${b})`;
        baglam.fillRect(
          k * karoBoyutu + 2,
          s * karoBoyutu + 2,
          karoBoyutu - 4,
          karoBoyutu - 4,
        );
      }
    }

    for (let i = 0; i < 1600; i += 1) {
      const rx = ((Math.sin(i * 41.3) * 43758.5453) % 1 + 1) % 1;
      const ry = ((Math.sin(i * 93.7) * 29384.1234) % 1 + 1) % 1;
      baglam.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(90,85,78,0.06)';
      baglam.fillRect(rx * boyut, ry * boyut, 2, 2);
    }

    const doku = new THREE.CanvasTexture(tuval);
    doku.wrapS = THREE.RepeatWrapping;
    doku.wrapT = THREE.RepeatWrapping;
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    doku.needsUpdate = true;

    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * Ortadaki [-4.35, +4.35] x [-8.35, +8.35] havuz açıklığını boş bırakan
   * 4 parçalı kaymaz taş güverteyi Z-fighting olmadan oluşturur.
   */
  private havuzGuvertesiOlustur(): void {
    const guverteDokusu = this.guverteTasDokusuOlustur();
    const guverteMateryali = new THREE.MeshStandardMaterial({
      map: guverteDokusu,
      roughness: 0.74,
      metalness: 0.03,
    });
    this.olusturulanMateryaller.push(guverteMateryali);

    const merkezY = GUVERTE_UST_Y - GUVERTE_KALINLIK * 0.5;
    const tamGenislikX = SALON_YARI_X * 2;
    const ucDerinlikZ = SALON_YARI_Z - HAVUZ_ACIKLIK_YARI_Z;
    const yanGenislikX = SALON_YARI_X - HAVUZ_ACIKLIK_YARI_X;
    const yanUzunlukZ = HAVUZ_ACIKLIK_YARI_Z * 2;

    const parcalar = [
      {
        ad: 'guverteArka',
        genislik: tamGenislikX,
        derinlik: ucDerinlikZ,
        x: 0,
        z: -(HAVUZ_ACIKLIK_YARI_Z + ucDerinlikZ * 0.5),
      },
      {
        ad: 'guverteOn',
        genislik: tamGenislikX,
        derinlik: ucDerinlikZ,
        x: 0,
        z: HAVUZ_ACIKLIK_YARI_Z + ucDerinlikZ * 0.5,
      },
      {
        ad: 'guverteSol',
        genislik: yanGenislikX,
        derinlik: yanUzunlukZ,
        x: -(HAVUZ_ACIKLIK_YARI_X + yanGenislikX * 0.5),
        z: 0,
      },
      {
        ad: 'guverteSag',
        genislik: yanGenislikX,
        derinlik: yanUzunlukZ,
        x: HAVUZ_ACIKLIK_YARI_X + yanGenislikX * 0.5,
        z: 0,
      },
    ];

    for (const parca of parcalar) {
      const geometri = new THREE.BoxGeometry(parca.genislik, GUVERTE_KALINLIK, parca.derinlik);
      this.kutuMetrikUvUygula(
        geometri,
        parca.genislik,
        GUVERTE_KALINLIK,
        parca.derinlik,
        parca.x,
        parca.z,
        0.5,
      );
      this.olusturulanGeometriler.push(geometri);

      const mesh = new THREE.Mesh(geometri, guverteMateryali);
      mesh.name = parca.ad;
      mesh.position.set(parca.x, merkezY, parca.z);
      this.anaGrup.add(mesh);
    }
  }

  /**
   * İki uzun tribünün ön duvarı için Sarı-Kırmızı Galatasaray pankart/LED şerit dokusu üretir.
   */
  private tribunPankartDokusuOlustur(): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 2048;
    tuval.height = 128;

    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Tribün pankart dokusu için 2B tuval bağlamı oluşturulamadı.');
    }

    const gradyan = baglam.createLinearGradient(0, 0, 2048, 0);
    gradyan.addColorStop(0, GALATASARAY_RENKLERI.KIRMIZI_ANA);
    gradyan.addColorStop(0.5, '#7c0324');
    gradyan.addColorStop(1, GALATASARAY_RENKLERI.KIRMIZI_ANA);
    baglam.fillStyle = gradyan;
    baglam.fillRect(0, 0, 2048, 128);

    // Üst ve alt altın sarısı LED şeritler
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.fillRect(0, 0, 2048, 12);
    baglam.fillRect(0, 116, 2048, 12);

    // İki yarıya tekrar eden net kurumsal yazı
    baglam.fillStyle = '#ffffff';
    baglam.font = '800 44px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';

    const metin = 'GALATASARAY SPOR KULÜBÜ  •  OLİMPİK YÜZME KOMPLEKSİ  •  1905';
    baglam.fillText(metin, 1024, 65);

    const doku = new THREE.CanvasTexture(tuval);
    doku.wrapS = THREE.RepeatWrapping;
    doku.wrapT = THREE.ClampToEdgeWrapping;
    doku.repeat.set(2, 1);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    doku.needsUpdate = true;

    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * İki uzun kenarda (|X| > 6.2) çok basamaklı beton tribünleri, Sarı-Kırmızı
   * pankart şeritlerini, cam ve krom korkulukları ve Sarı-Kırmızı parçalı
   * koreografiye sahip 380 adet stadyum koltuğunu oluşturur.
   */
  private seyirciTribunleriOlustur(): void {
    const betonMateryal = new THREE.MeshStandardMaterial({
      color: 0x3f4c5e,
      roughness: 0.85,
      metalness: 0.06,
    });
    const kromMateryal = new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      roughness: 0.24,
      metalness: 0.85,
    });
    const camMateryal = new THREE.MeshStandardMaterial({
      color: 0xcbe7ff,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const koltukMateryal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.44,
      metalness: 0.06,
    });

    const pankartDokusu = this.tribunPankartDokusuOlustur();
    const pankartMateryali = new THREE.MeshStandardMaterial({
      map: pankartDokusu,
      emissiveMap: pankartDokusu,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.42,
      roughness: 0.35,
      metalness: 0.05,
    });

    this.olusturulanMateryaller.push(
      betonMateryal,
      kromMateryal,
      camMateryal,
      koltukMateryal,
      pankartMateryali,
    );

    const basamakSayisi = 5;
    const basamakDerinlik = 1.12;
    const basamakYukseklik = 0.52;
    const baslangicX = 6.25;
    const tribunUzunlukZ = 24.4;

    // 1. Basamaklı beton tribün blokları
    for (let b = 0; b < basamakSayisi; b += 1) {
      const toplamYukseklik = (b + 1) * basamakYukseklik;
      const genislik = b === basamakSayisi - 1 ? 1.27 : basamakDerinlik;
      const merkezX = baslangicX + b * basamakDerinlik + genislik * 0.5;
      const merkezY = GUVERTE_UST_Y + toplamYukseklik * 0.5;

      const basamakGeometri = new THREE.BoxGeometry(genislik, toplamYukseklik, tribunUzunlukZ);
      this.olusturulanGeometriler.push(basamakGeometri);

      for (const isaret of [-1, 1]) {
        const mesh = new THREE.Mesh(basamakGeometri, betonMateryal);
        mesh.name = `tribunBasamak_${isaret < 0 ? 'sol' : 'sag'}_${b + 1}`;
        mesh.position.set(isaret * merkezX, merkezY, 0);
        this.anaGrup.add(mesh);
      }
    }

    // 2. İki uzun tribün ön beton duvarında Galatasaray LED pankart şeridi (|X| = 6.24)
    const pankartGeometri = new THREE.PlaneGeometry(tribunUzunlukZ - 0.2, 0.48);
    this.olusturulanGeometriler.push(pankartGeometri);

    for (const isaret of [-1, 1]) {
      const pankartMesh = new THREE.Mesh(pankartGeometri, pankartMateryali);
      pankartMesh.name = `galatasarayTribunPankart_${isaret < 0 ? 'sol' : 'sag'}`;
      pankartMesh.position.set(isaret * 6.24, GUVERTE_UST_Y + 0.26, 0);
      pankartMesh.rotation.y = isaret < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      this.anaGrup.add(pankartMesh);
    }

    // 3. Tribün önü cam ve krom korkuluklar (|X| = 6.18)
    const korkulukX = 6.18;
    const korkulukYukseklik = 1.02;
    const camGeometri = new THREE.BoxGeometry(0.024, korkulukYukseklik - 0.12, tribunUzunlukZ - 0.1);
    const kupesteGeometri = new THREE.CylinderGeometry(0.026, 0.026, tribunUzunlukZ, 10);
    kupesteGeometri.rotateX(Math.PI * 0.5);
    const dikmeGeometri = new THREE.CylinderGeometry(0.02, 0.02, korkulukYukseklik, 8);

    this.olusturulanGeometriler.push(camGeometri, kupesteGeometri, dikmeGeometri);

    const dikmeSayisiPerTaraf = 11;
    const dikmeInstanced = new THREE.InstancedMesh(
      dikmeGeometri,
      kromMateryal,
      dikmeSayisiPerTaraf * 2,
    );
    const matris = new THREE.Matrix4();
    let dikmeIdx = 0;

    for (const isaret of [-1, 1]) {
      const camMesh = new THREE.Mesh(camGeometri, camMateryal);
      camMesh.position.set(
        isaret * korkulukX,
        GUVERTE_UST_Y + (korkulukYukseklik - 0.12) * 0.5 + 0.04,
        0,
      );

      const kupesteMesh = new THREE.Mesh(kupesteGeometri, kromMateryal);
      kupesteMesh.position.set(isaret * korkulukX, GUVERTE_UST_Y + korkulukYukseklik, 0);
      this.anaGrup.add(camMesh, kupesteMesh);

      for (let d = 0; d < dikmeSayisiPerTaraf; d += 1) {
        const z = -12.0 + d * 2.4;
        matris.makeTranslation(isaret * korkulukX, GUVERTE_UST_Y + korkulukYukseklik * 0.5, z);
        dikmeInstanced.setMatrixAt(dikmeIdx, matris);
        dikmeIdx += 1;
      }
    }
    dikmeInstanced.instanceMatrix.needsUpdate = true;
    this.anaGrup.add(dikmeInstanced);

    // 4. Galatasaray Sarı-Kırmızı parçalı koreografili 380 adet stadyum koltuğu
    const siraKoltukSayisi = 38;
    const toplamKoltuk = basamakSayisi * siraKoltukSayisi * 2;

    const oturakGeometri = new THREE.BoxGeometry(0.42, 0.06, 0.44);
    const sirtlikGeometri = new THREE.BoxGeometry(0.06, 0.42, 0.44);
    this.olusturulanGeometriler.push(oturakGeometri, sirtlikGeometri);

    const oturakInstanced = new THREE.InstancedMesh(oturakGeometri, koltukMateryal, toplamKoltuk);
    const sirtlikInstanced = new THREE.InstancedMesh(sirtlikGeometri, koltukMateryal, toplamKoltuk);
    oturakInstanced.name = 'galatasarayTribunOturaklari';
    sirtlikInstanced.name = 'galatasarayTribunSirtliklari';

    const gsKirmizi = new THREE.Color(GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA);
    const gsSari = new THREE.Color(GALATASARAY_RENKLERI.HEX_SARI_ANA);

    let koltukIdx = 0;
    const zBaslangic = -11.3;
    const zAdim = 0.61;

    for (const isaret of [-1, 1]) {
      for (let b = 0; b < basamakSayisi; b += 1) {
        const basamakUstY = GUVERTE_UST_Y + (b + 1) * basamakYukseklik;
        const siraMerkezX = isaret * (baslangicX + b * basamakDerinlik + 0.56);
        const sirtlikOfsetX = isaret * 0.18;

        for (let k = 0; k < siraKoltukSayisi; k += 1) {
          const z = zBaslangic + k * zAdim;

          matris.makeTranslation(siraMerkezX, basamakUstY + 0.08, z);
          oturakInstanced.setMatrixAt(koltukIdx, matris);

          matris.makeTranslation(siraMerkezX + sirtlikOfsetX, basamakUstY + 0.29, z);
          sirtlikInstanced.setMatrixAt(koltukIdx, matris);

          // Parçalı Sarı-Kırmızı tribün blok koreografisi
          const blokIndeksi = Math.floor(k / 6);
          const ortaSiraKaymasi = b >= 2 ? 1 : 0;
          const sariMi = (blokIndeksi + ortaSiraKaymasi) % 2 === 0;
          const koltukRengi = sariMi ? gsSari : gsKirmizi;

          oturakInstanced.setColorAt(koltukIdx, koltukRengi);
          sirtlikInstanced.setColorAt(koltukIdx, koltukRengi);
          koltukIdx += 1;
        }
      }
    }

    oturakInstanced.instanceMatrix.needsUpdate = true;
    sirtlikInstanced.instanceMatrix.needsUpdate = true;
    if (oturakInstanced.instanceColor) {
      oturakInstanced.instanceColor.needsUpdate = true;
    }
    if (sirtlikInstanced.instanceColor) {
      sirtlikInstanced.instanceColor.needsUpdate = true;
    }

    this.anaGrup.add(oturakInstanced, sirtlikInstanced);
  }

  /**
   * 16.2m yüksekliğe sahip 24m x 32m spor salonu duvar kabuğunu, taşıyıcı
   * kolonları ve Y = 9.6m kotundaki panoramik pencere dizilerini oluşturur.
   */
  private salonKabuguVePencerelerOlustur(): void {
    const duvarAltY = -0.10;
    const duvarYukseklik = TAVAN_YUKSEKLIK_Y - duvarAltY;
    const duvarMerkezY = (TAVAN_YUKSEKLIK_Y + duvarAltY) * 0.5;
    const genislikX = SALON_YARI_X * 2;
    const uzunlukZ = SALON_YARI_Z * 2;

    const duvarMateryali = new THREE.MeshStandardMaterial({
      color: 0x222d3e,
      roughness: 0.85,
      metalness: 0.08,
      side: THREE.FrontSide,
    });
    const tavanMateryali = new THREE.MeshStandardMaterial({
      color: 0x151e2c,
      roughness: 0.90,
      metalness: 0.05,
      side: THREE.FrontSide,
    });
    const kolonMateryali = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.72,
      metalness: 0.16,
    });
    const pencereCamMateryali = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      emissive: 0x93c5fd,
      emissiveIntensity: 0.52,
      roughness: 0.15,
      metalness: 0.08,
    });
    const pencereCerceveMateryali = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.55,
    });

    this.olusturulanMateryaller.push(
      duvarMateryali,
      tavanMateryali,
      kolonMateryali,
      pencereCamMateryali,
      pencereCerceveMateryali,
    );

    const duvarTanimlari = [
      {
        ad: 'salonDuvarArka',
        w: genislikX,
        h: duvarYukseklik,
        pos: [0, duvarMerkezY, -SALON_YARI_Z] as const,
        rotY: 0,
        materyal: duvarMateryali,
      },
      {
        ad: 'salonDuvarOn',
        w: genislikX,
        h: duvarYukseklik,
        pos: [0, duvarMerkezY, SALON_YARI_Z] as const,
        rotY: Math.PI,
        materyal: duvarMateryali,
      },
      {
        ad: 'salonDuvarSol',
        w: uzunlukZ,
        h: duvarYukseklik,
        pos: [-SALON_YARI_X, duvarMerkezY, 0] as const,
        rotY: Math.PI * 0.5,
        materyal: duvarMateryali,
      },
      {
        ad: 'salonDuvarSag',
        w: uzunlukZ,
        h: duvarYukseklik,
        pos: [SALON_YARI_X, duvarMerkezY, 0] as const,
        rotY: -Math.PI * 0.5,
        materyal: duvarMateryali,
      },
    ];

    for (const d of duvarTanimlari) {
      const geometri = new THREE.PlaneGeometry(d.w, d.h);
      this.olusturulanGeometriler.push(geometri);
      const mesh = new THREE.Mesh(geometri, d.materyal);
      mesh.name = d.ad;
      mesh.position.set(d.pos[0], d.pos[1], d.pos[2]);
      mesh.rotation.y = d.rotY;
      this.anaGrup.add(mesh);
    }

    const tavanGeometri = new THREE.PlaneGeometry(genislikX, uzunlukZ);
    this.olusturulanGeometriler.push(tavanGeometri);
    const tavanMesh = new THREE.Mesh(tavanGeometri, tavanMateryali);
    tavanMesh.name = 'salonTavan';
    tavanMesh.position.set(0, TAVAN_YUKSEKLIK_Y, 0);
    tavanMesh.rotation.x = Math.PI * 0.5;
    this.anaGrup.add(tavanMesh);

    // 16.2m tam boy taşıyıcı duvar kolonları
    const kolonGeometri = new THREE.BoxGeometry(0.45, TAVAN_YUKSEKLIK_Y - GUVERTE_UST_Y, 0.52);
    this.olusturulanGeometriler.push(kolonGeometri);

    const kolonZKonumlari = [-15.7, -12, -6, 0, 6, 12, 15.7];
    const kolonInstanced = new THREE.InstancedMesh(
      kolonGeometri,
      kolonMateryali,
      kolonZKonumlari.length * 2,
    );
    kolonInstanced.name = 'tasiyiciKolonlar';

    const matris = new THREE.Matrix4();
    const kolonMerkezY = (TAVAN_YUKSEKLIK_Y + GUVERTE_UST_Y) * 0.5;
    let kolonIdx = 0;

    for (const isaret of [-1, 1]) {
      for (const z of kolonZKonumlari) {
        matris.makeTranslation(isaret * (SALON_YARI_X - 0.22), kolonMerkezY, z);
        kolonInstanced.setMatrixAt(kolonIdx, matris);
        kolonIdx += 1;
      }
    }
    kolonInstanced.instanceMatrix.needsUpdate = true;
    this.anaGrup.add(kolonInstanced);

    // Y = 9.6m seviyesinde yükseltilmiş panoramik gündüz pencere dizileri
    const pencereGenislikZ = 5.1;
    const pencereYukseklik = 3.8;
    const pencereMerkezY = 9.6;
    const pencereCamGeometri = new THREE.PlaneGeometry(pencereGenislikZ, pencereYukseklik);
    const pencereCerceveGeometri = new THREE.BoxGeometry(
      0.08,
      pencereYukseklik + 0.16,
      pencereGenislikZ + 0.16,
    );
    const pencereKayitGeometri = new THREE.BoxGeometry(0.10, pencereYukseklik, 0.08);
    this.olusturulanGeometriler.push(
      pencereCamGeometri,
      pencereCerceveGeometri,
      pencereKayitGeometri,
    );

    const pencereZMerkezleri = [-9, -3, 3, 9];
    for (const isaret of [-1, 1]) {
      for (const z of pencereZMerkezleri) {
        const cerceveMesh = new THREE.Mesh(pencereCerceveGeometri, pencereCerceveMateryali);
        cerceveMesh.position.set(isaret * (SALON_YARI_X - 0.06), pencereMerkezY, z);

        const camMesh = new THREE.Mesh(pencereCamGeometri, pencereCamMateryali);
        camMesh.position.set(isaret * (SALON_YARI_X - 0.11), pencereMerkezY, z);
        camMesh.rotation.y = isaret < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

        const dikeyKayit = new THREE.Mesh(pencereKayitGeometri, pencereCerceveMateryali);
        dikeyKayit.position.set(isaret * (SALON_YARI_X - 0.12), pencereMerkezY, z);

        this.anaGrup.add(cerceveMesh, camMesh, dikeyKayit);
      }
    }
  }

  /**
   * 14.80m - 15.85m kotundaki çelik kafes çatı makaslarını ve
   * 14.60m kotuna asılı emissive LED arena projektörlerini oluşturur.
   */
  private catiMakaslariVeLedProjektorlerOlustur(): void {
    const celikMateryal = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.48,
      metalness: 0.72,
    });
    const projektorGovdeMateryal = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.65,
    });
    const ledDifuzorMateryal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf0f9ff,
      emissiveIntensity: 1.85,
      roughness: 0.2,
      metalness: 0.05,
    });

    this.olusturulanMateryaller.push(celikMateryal, projektorGovdeMateryal, ledDifuzorMateryal);

    const makasZKonumlari = [-12, -6, 0, 6, 12];
    const makasGenislik = SALON_YARI_X * 2 - 0.5;
    const altKirisY = 14.80;
    const ustKirisY = 15.85;
    const makasYukseklik = ustKirisY - altKirisY;

    const dikeyAdimlar = [-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10];
    const caprazAdimGenislik = 2.5;
    const caprazUzunluk = Math.hypot(caprazAdimGenislik, makasYukseklik);

    const yatayKirisGeometri = new THREE.BoxGeometry(makasGenislik, 0.18, 0.22);
    const dikmeCubukGeometri = new THREE.BoxGeometry(0.10, makasYukseklik, 0.10);
    const caprazCubukGeometri = new THREE.BoxGeometry(0.08, caprazUzunluk, 0.08);
    this.olusturulanGeometriler.push(yatayKirisGeometri, dikmeCubukGeometri, caprazCubukGeometri);

    const yatayInstanced = new THREE.InstancedMesh(
      yatayKirisGeometri,
      celikMateryal,
      makasZKonumlari.length * 2,
    );
    const dikmeInstanced = new THREE.InstancedMesh(
      dikmeCubukGeometri,
      celikMateryal,
      makasZKonumlari.length * dikeyAdimlar.length,
    );
    const caprazAdetPerMakas = dikeyAdimlar.length - 1;
    const caprazInstanced = new THREE.InstancedMesh(
      caprazCubukGeometri,
      celikMateryal,
      makasZKonumlari.length * caprazAdetPerMakas,
    );

    // 14.60m kotunda LED arena projektörleri
    const projektorXKonumlari = [-6.4, -3.8, -1.3, 1.3, 3.8, 6.4];
    const projektorGovdeGeometri = new THREE.BoxGeometry(0.68, 0.14, 0.46);
    const projektorLedGeometri = new THREE.BoxGeometry(0.58, 0.04, 0.38);
    this.olusturulanGeometriler.push(projektorGovdeGeometri, projektorLedGeometri);

    const toplamProjektor = makasZKonumlari.length * projektorXKonumlari.length;
    const projektorGovdeInstanced = new THREE.InstancedMesh(
      projektorGovdeGeometri,
      projektorGovdeMateryal,
      toplamProjektor,
    );
    const projektorLedInstanced = new THREE.InstancedMesh(
      projektorLedGeometri,
      ledDifuzorMateryal,
      toplamProjektor,
    );

    const matris = new THREE.Matrix4();
    const rotasyon = new THREE.Quaternion();
    const olcekBir = new THREE.Vector3(1, 1, 1);
    const konum = new THREE.Vector3();
    const yukariEksen = new THREE.Vector3(0, 1, 0);

    let yatayIdx = 0;
    let dikmeIdx = 0;
    let caprazIdx = 0;
    let projektorIdx = 0;

    for (const z of makasZKonumlari) {
      matris.makeTranslation(0, altKirisY, z);
      yatayInstanced.setMatrixAt(yatayIdx, matris);
      yatayIdx += 1;

      matris.makeTranslation(0, ustKirisY, z);
      yatayInstanced.setMatrixAt(yatayIdx, matris);
      yatayIdx += 1;

      for (let d = 0; d < dikeyAdimlar.length; d += 1) {
        const x = dikeyAdimlar[d];
        matris.makeTranslation(x, (altKirisY + ustKirisY) * 0.5, z);
        dikmeInstanced.setMatrixAt(dikmeIdx, matris);
        dikmeIdx += 1;

        if (d < dikeyAdimlar.length - 1) {
          const sonrakiX = dikeyAdimlar[d + 1];
          const ortaX = (x + sonrakiX) * 0.5;
          const dikeyYon = d % 2 === 0 ? makasYukseklik : -makasYukseklik;
          const caprazDogrultu = new THREE.Vector3(caprazAdimGenislik, dikeyYon, 0).normalize();
          rotasyon.setFromUnitVectors(yukariEksen, caprazDogrultu);
          konum.set(ortaX, (altKirisY + ustKirisY) * 0.5, z);
          matris.compose(konum, rotasyon, olcekBir);
          caprazInstanced.setMatrixAt(caprazIdx, matris);
          caprazIdx += 1;
        }
      }

      for (const px of projektorXKonumlari) {
        const egimAcisi = Math.atan2(-px * 0.26, 14.0);
        rotasyon.setFromAxisAngle(new THREE.Vector3(0, 0, 1), egimAcisi);

        konum.set(px, 14.64, z);
        matris.compose(konum, rotasyon, olcekBir);
        projektorGovdeInstanced.setMatrixAt(projektorIdx, matris);

        konum.set(px, 14.57, z);
        matris.compose(konum, rotasyon, olcekBir);
        projektorLedInstanced.setMatrixAt(projektorIdx, matris);
        projektorIdx += 1;
      }
    }

    yatayInstanced.instanceMatrix.needsUpdate = true;
    dikmeInstanced.instanceMatrix.needsUpdate = true;
    caprazInstanced.instanceMatrix.needsUpdate = true;
    projektorGovdeInstanced.instanceMatrix.needsUpdate = true;
    projektorLedInstanced.instanceMatrix.needsUpdate = true;

    this.anaGrup.add(
      yatayInstanced,
      dikmeInstanced,
      caprazInstanced,
      projektorGovdeInstanced,
      projektorLedInstanced,
    );
  }

  /**
   * Galatasaray kulüp sancakları için CanvasTexture üretir.
   */
  private kulupSancakDokusuOlustur(): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 256;
    tuval.height = 512;

    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Kulüp sancağı dokusu için 2B tuval bağlamı oluşturulamadı.');
    }

    // Dikey parçalı Sarı-Kırmızı zemin
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.fillRect(0, 0, 128, 512);

    baglam.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
    baglam.fillRect(128, 0, 128, 512);

    // Altın çerçeve
    baglam.strokeStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.lineWidth = 10;
    baglam.strokeRect(10, 10, 236, 492);

    // Merkez amblem madalyonu
    baglam.fillStyle = '#111827';
    baglam.beginPath();
    baglam.arc(128, 220, 72, 0, Math.PI * 2);
    baglam.fill();
    baglam.strokeStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.lineWidth = 6;
    baglam.stroke();

    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.font = '900 62px Inter, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';
    baglam.fillText('GS', 128, 222);

    // Yıldızlar ve 1905
    baglam.fillStyle = '#ffffff';
    baglam.font = '700 28px Inter, sans-serif';
    baglam.fillText('★ ★ ★ ★ ★', 128, 104);

    baglam.fillStyle = '#111827';
    baglam.fillRect(46, 336, 164, 56);
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.font = '800 32px Inter, sans-serif';
    baglam.fillText('1905', 128, 365);

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    doku.needsUpdate = true;

    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * Çatı makaslarının altında (Y ≈ 12.6m) Sarı-Kırmızı Galatasaray kulüp sancaklarını asar.
   */
  private kulupSancaklariOlustur(): void {
    const sancakDokusu = this.kulupSancakDokusuOlustur();
    const sancakMateryal = new THREE.MeshStandardMaterial({
      map: sancakDokusu,
      roughness: 0.48,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const kromAskiMateryal = new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      roughness: 0.25,
      metalness: 0.85,
    });
    this.olusturulanMateryaller.push(sancakMateryal, kromAskiMateryal);

    const sancakGeometri = new THREE.PlaneGeometry(1.5, 3.1);
    const cubukGeometri = new THREE.CylinderGeometry(0.025, 0.025, 1.7, 8);
    cubukGeometri.rotateZ(Math.PI * 0.5);
    const askiHalatGeometri = new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6);
    this.olusturulanGeometriler.push(sancakGeometri, cubukGeometri, askiHalatGeometri);

    const sancakZKonumlari = [-12, -6, 0, 6, 12];
    const sancakXKonumlari = [-7.8, 7.8];
    const sancakMerkezY = 12.6;

    for (const x of sancakXKonumlari) {
      for (const z of sancakZKonumlari) {
        const sancakMesh = new THREE.Mesh(sancakGeometri, sancakMateryal);
        sancakMesh.name = 'galatasarayKulupSancagi';
        sancakMesh.position.set(x, sancakMerkezY, z);
        sancakMesh.rotation.y = x < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

        const ustCubuk = new THREE.Mesh(cubukGeometri, kromAskiMateryal);
        ustCubuk.position.set(x, sancakMerkezY + 1.56, z);
        ustCubuk.rotation.y = Math.PI * 0.5;

        const solAski = new THREE.Mesh(askiHalatGeometri, kromAskiMateryal);
        solAski.position.set(x, sancakMerkezY + 1.92, z - 0.65);

        const sagAski = new THREE.Mesh(askiHalatGeometri, kromAskiMateryal);
        sagAski.position.set(x, sancakMerkezY + 1.92, z + 0.65);

        this.anaGrup.add(sancakMesh, ustCubuk, solAski, sagAski);
      }
    }
  }

  /**
   * Karşı uç duvarda (Z = +15.5, Y = 11.8) 10m kulesinin üstünde net okunan
   * Galatasaray SK temalı dijital LED skorboardu oluşturur.
   */
  private dijitalSkorboardOlustur(): void {
    const tuval = document.createElement('canvas');
    tuval.width = 1024;
    tuval.height = 512;

    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Dijital skorboard dokusu için 2B tuval bağlamı oluşturulamadı.');
    }

    // Koyu LED zemin
    baglam.fillStyle = '#090d16';
    baglam.fillRect(0, 0, 1024, 512);

    // Sarı-Kırmızı kurumsal başlık bandı
    const baslikGradyan = baglam.createLinearGradient(0, 0, 1024, 0);
    baslikGradyan.addColorStop(0, GALATASARAY_RENKLERI.KIRMIZI_ANA);
    baslikGradyan.addColorStop(0.5, '#7c0324');
    baslikGradyan.addColorStop(1, GALATASARAY_RENKLERI.KIRMIZI_ANA);
    baglam.fillStyle = baslikGradyan;
    baglam.fillRect(20, 18, 984, 72);

    baglam.strokeStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.lineWidth = 4;
    baglam.strokeRect(20, 18, 984, 72);

    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.font = '800 22px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';
    baglam.fillText(
      'GALATASARAY SK  •  OLİMPİK YÜZME TAKIMI  •  6 KULVAR & 10M TRAMPLEN',
      512,
      55,
    );

    // Alt bilgi şeridi
    baglam.fillStyle = '#cbd5e1';
    baglam.font = '600 19px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    baglam.fillText('100m SERBEST FİNAL   |   SU: 26.5°C   |   10M KULE ATLAMA', 512, 114);

    // 6 kulvar skor satırları
    const satirlar = [
      { kulvar: '1', kod: 'GS', isim: 'YILMAZ E.', derece: '00:48.04', sira: '3' },
      { kulvar: '2', kod: 'GS', isim: 'KAYA M.', derece: '00:47.76', sira: '2' },
      { kulvar: '3', kod: 'GS', isim: 'DEMİR A.', derece: '00:47.38', sira: '1' },
      { kulvar: '4', kod: 'GS', isim: 'ARSLAN K.', derece: '00:48.22', sira: '4' },
      { kulvar: '5', kod: 'GS', isim: 'ÖZTÜRK B.', derece: '00:48.55', sira: '5' },
      { kulvar: '6', kod: 'GS', isim: 'ÇELİK T.', derece: '00:48.89', sira: '6' },
    ];

    for (let i = 0; i < satirlar.length; i += 1) {
      const satir = satirlar[i];
      const y = 148 + i * 56;

      baglam.fillStyle = i % 2 === 0 ? 'rgba(169, 4, 50, 0.24)' : 'rgba(17, 24, 39, 0.78)';
      baglam.fillRect(28, y, 968, 46);

      // Kulvar numarası kutusu (Sarı / Kırmızı dönüşümlü)
      baglam.fillStyle =
        i % 2 === 0 ? GALATASARAY_RENKLERI.SARI_ANA : GALATASARAY_RENKLERI.KIRMIZI_ANA;
      baglam.fillRect(38, y + 6, 40, 34);
      baglam.fillStyle = i % 2 === 0 ? GALATASARAY_RENKLERI.KARBON_ANTRASIT : '#ffffff';
      baglam.font = '800 22px Inter, sans-serif';
      baglam.textAlign = 'center';
      baglam.fillText(satir.kulvar, 58, y + 24);

      // Takım ve sporcu
      baglam.fillStyle = '#f8fafc';
      baglam.font = '700 22px monospace';
      baglam.textAlign = 'left';
      baglam.fillText(`${satir.kod}  ${satir.isim}`, 104, y + 24);

      // Derece (LED altın sarısı)
      baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
      baglam.font = '800 26px monospace';
      baglam.textAlign = 'right';
      baglam.fillText(satir.derece, 885, y + 24);

      // Sıralama
      baglam.fillStyle = satir.sira === '1' ? GALATASARAY_RENKLERI.SARI_ANA : '#e2e8f0';
      baglam.font = '800 22px monospace';
      baglam.fillText(`#${satir.sira}`, 968, y + 24);
    }

    const skorDoku = new THREE.CanvasTexture(tuval);
    skorDoku.colorSpace = THREE.SRGBColorSpace;
    skorDoku.anisotropy = 4;
    skorDoku.needsUpdate = true;
    this.olusturulanDokular.push(skorDoku);

    const kasaMateryal = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KARBON_ANTRASIT,
      roughness: 0.42,
      metalness: 0.65,
    });
    const ekranMateryal = new THREE.MeshStandardMaterial({
      map: skorDoku,
      emissiveMap: skorDoku,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.82,
      roughness: 0.28,
      metalness: 0.05,
    });
    this.olusturulanMateryaller.push(kasaMateryal, ekranMateryal);

    const kasaGeometri = new THREE.BoxGeometry(8.8, 4.3, 0.28);
    const ekranGeometri = new THREE.PlaneGeometry(8.4, 4.05);
    const askiGeometri = new THREE.CylinderGeometry(0.055, 0.055, 2.8, 8);
    this.olusturulanGeometriler.push(kasaGeometri, ekranGeometri, askiGeometri);

    const skorboardZ = 15.5;
    const skorboardY = 11.8;

    const kasaMesh = new THREE.Mesh(kasaGeometri, kasaMateryal);
    kasaMesh.name = 'dijitalSkorboardKasa';
    kasaMesh.position.set(0, skorboardY, skorboardZ);

    const ekranMesh = new THREE.Mesh(ekranGeometri, ekranMateryal);
    ekranMesh.name = 'dijitalSkorboardEkran';
    ekranMesh.position.set(0, skorboardY, skorboardZ - 0.145);
    ekranMesh.rotation.y = Math.PI; // -Z yönüne, havuza bakar

    for (const askiX of [-3.4, 3.4]) {
      const aski = new THREE.Mesh(askiGeometri, kasaMateryal);
      aski.position.set(askiX, skorboardY + 3.2, skorboardZ);
      this.anaGrup.add(aski);
    }

    this.anaGrup.add(kasaMesh, ekranMesh);
  }

  /**
   * Sağ güverte kenarında beyaz yüksek cankurtaran kulesi ve kırmızı kurtarma şamandırası oluşturur.
   */
  private cankurtaranKulesiOlustur(): void {
    const kuleGrubu = new THREE.Group();
    kuleGrubu.name = 'cankurtaranKulesi';
    kuleGrubu.position.set(5.25, GUVERTE_UST_Y, -1.2);

    const beyazBoyaMateryal = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.34,
      metalness: 0.12,
    });
    const kirmiziSamandiraMateryal = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KIRMIZI_VURGU,
      roughness: 0.38,
      metalness: 0.06,
    });
    this.olusturulanMateryaller.push(beyazBoyaMateryal, kirmiziSamandiraMateryal);

    const ayakGeometri = new THREE.CylinderGeometry(0.025, 0.028, 1.56, 10);
    const platformGeometri = new THREE.BoxGeometry(0.68, 0.05, 0.68);
    const basamakGeometri = new THREE.BoxGeometry(0.06, 0.035, 0.56);
    const oturakGeometri = new THREE.BoxGeometry(0.48, 0.06, 0.48);
    const sirtlikGeometri = new THREE.BoxGeometry(0.06, 0.46, 0.48);
    const samandiraGeometri = new THREE.CapsuleGeometry(0.065, 0.46, 6, 10);
    this.olusturulanGeometriler.push(
      ayakGeometri,
      platformGeometri,
      basamakGeometri,
      oturakGeometri,
      sirtlikGeometri,
      samandiraGeometri,
    );

    const bacakKonumlari = [
      [-0.28, 0.78, -0.28],
      [-0.28, 0.78, 0.28],
      [0.28, 0.78, -0.28],
      [0.28, 0.78, 0.28],
    ] as const;

    for (const [x, y, z] of bacakKonumlari) {
      const bacak = new THREE.Mesh(ayakGeometri, beyazBoyaMateryal);
      bacak.position.set(x, y, z);
      kuleGrubu.add(bacak);
    }

    const platform = new THREE.Mesh(platformGeometri, beyazBoyaMateryal);
    platform.position.set(-0.08, 1.16, 0);

    const oturak = new THREE.Mesh(oturakGeometri, beyazBoyaMateryal);
    oturak.position.set(0.04, 1.56, 0);

    const sirtlik = new THREE.Mesh(sirtlikGeometri, beyazBoyaMateryal);
    sirtlik.position.set(0.26, 1.80, 0);

    for (let i = 0; i < 4; i += 1) {
      const basamak = new THREE.Mesh(basamakGeometri, beyazBoyaMateryal);
      basamak.position.set(0.28, 0.28 + i * 0.29, 0);
      kuleGrubu.add(basamak);
    }

    const samandira = new THREE.Mesh(samandiraGeometri, kirmiziSamandiraMateryal);
    samandira.position.set(0.06, 1.18, 0.34);
    samandira.rotation.z = THREE.MathUtils.degToRad(14);

    kuleGrubu.add(platform, oturak, sirtlik, samandira);
    this.anaGrup.add(kuleGrubu);
  }

  /**
   * Spor kompleksi mimarisinin oluşturduğu tüm sahne düğümlerini,
   * geometrileri, materyalleri ve dokuları temizler.
   */
  public temizle(): void {
    if (this.temizlendiMi) {
      return;
    }
    this.temizlendiMi = true;

    this.sahne.remove(this.anaGrup);

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
