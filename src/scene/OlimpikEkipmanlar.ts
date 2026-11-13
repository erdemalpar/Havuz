import * as THREE from 'three';
import {
  GALATASARAY_RENKLERI,
  HAVUZ_SABITLERI,
  KaynakTemizlenebilir,
  kulvarMerkeziXGetir,
} from '../types/simulation';

/**
 * Galatasaray Yüzme Takımı temalı 5 FINA kulvar halatını, 6 numaralı atlayış
 * platformunu, 2 sırtüstü bayrak ipini, 4 paslanmaz çelik havuz merdivenini
 * ve 10m Olimpik Tramplen / Atlama Kulesini oluşturan modül.
 */
export class OlimpikEkipmanlar implements KaynakTemizlenebilir {
  private readonly sahne: THREE.Scene;
  private readonly anaGrup: THREE.Group;
  private readonly olusturulanGeometriler: THREE.BufferGeometry[] = [];
  private readonly olusturulanMateryaller: THREE.Material[] = [];
  private readonly olusturulanDokular: THREE.Texture[] = [];

  private readonly kromMateryal: THREE.MeshStandardMaterial;
  private readonly koyuKarbonMateryal: THREE.MeshStandardMaterial;
  private readonly gsKirmiziMateryal: THREE.MeshStandardMaterial;
  private readonly gsSariMateryal: THREE.MeshStandardMaterial;
  private readonly kuleBetonMateryal: THREE.MeshStandardMaterial;

  private temizlendiMi = false;

  constructor(sahne: THREE.Scene) {
    this.sahne = sahne;
    this.anaGrup = new THREE.Group();
    this.anaGrup.name = 'olimpikEkipmanlar';

    this.kromMateryal = new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      roughness: 0.22,
      metalness: 0.88,
    });
    this.koyuKarbonMateryal = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KARBON_ANTRASIT,
      roughness: 0.78,
      metalness: 0.16,
    });
    this.gsKirmiziMateryal = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      roughness: 0.36,
      metalness: 0.12,
    });
    this.gsSariMateryal = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_SARI_ANA,
      roughness: 0.34,
      metalness: 0.14,
    });
    this.kuleBetonMateryal = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.76,
      metalness: 0.10,
    });

    this.olusturulanMateryaller.push(
      this.kromMateryal,
      this.koyuKarbonMateryal,
      this.gsKirmiziMateryal,
      this.gsSariMateryal,
      this.kuleBetonMateryal,
    );

    this.finaKulvarHalatlariOlustur();
    this.atlayisPlatformlariOlustur();
    this.sirtustuBayrakIpleriOlustur();
    this.havuzMerdivenleriOlustur();
    this.onMetreTramplenKulesiOlustur();

    this.sahne.add(this.anaGrup);
  }

  /**
   * 6 kulvarı ayıran 5 adet FINA kulvar halatını InstancedMesh disk yüzdürücülerle oluşturur:
   * uçlarda 2.5m Galatasaray Kırmızısı, ortada dönüşümlü Sarı ve Kırmızı segmentler.
   */
  private finaKulvarHalatlariOlustur(): void {
    const { GENISLIK_X, MIN_X, MIN_Z, MAK_Z, KULVAR_SAYISI } = HAVUZ_SABITLERI;
    const halatSayisi = KULVAR_SAYISI - 1;
    const kulvarGenisligi = GENISLIK_X / KULVAR_SAYISI;

    const baslangicZ = MIN_Z + 0.06;
    const bitisZ = MAK_Z - 0.06;
    const diskAraligi = 0.066;
    const halatBasiDisk = Math.floor((bitisZ - baslangicZ) / diskAraligi) + 1;
    const toplamDisk = halatSayisi * halatBasiDisk;

    const diskGeometri = new THREE.CylinderGeometry(0.056, 0.056, 0.044, 12);
    diskGeometri.rotateX(Math.PI * 0.5);
    this.olusturulanGeometriler.push(diskGeometri);

    const diskMateryali = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.34,
      metalness: 0.06,
    });
    this.olusturulanMateryaller.push(diskMateryali);

    const diskInstanced = new THREE.InstancedMesh(diskGeometri, diskMateryali, toplamDisk);
    diskInstanced.name = 'galatasarayKulvarDiskleri';

    const kirmiziRenk = new THREE.Color(GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA);
    const sariRenk = new THREE.Color(GALATASARAY_RENKLERI.HEX_SARI_ANA);

    const halatUzunluk = MAK_Z - MIN_Z - 0.04;
    const telGeometri = new THREE.CylinderGeometry(0.008, 0.008, halatUzunluk, 6);
    telGeometri.rotateX(Math.PI * 0.5);
    this.olusturulanGeometriler.push(telGeometri);

    const ankrajGeometri = new THREE.CylinderGeometry(0.042, 0.042, 0.03, 12);
    ankrajGeometri.rotateX(Math.PI * 0.5);
    this.olusturulanGeometriler.push(ankrajGeometri);

    const telInstanced = new THREE.InstancedMesh(telGeometri, this.kromMateryal, halatSayisi);
    const ankrajInstanced = new THREE.InstancedMesh(
      ankrajGeometri,
      this.kromMateryal,
      halatSayisi * 2,
    );
    telInstanced.name = 'kulvarGergiTelleri';
    ankrajInstanced.name = 'kulvarDuvarAnkrajlari';

    const geciciMatris = new THREE.Matrix4();
    const kirmiziSinirZ = MAK_Z - 2.5;
    let diskIndeksi = 0;

    for (let h = 0; h < halatSayisi; h += 1) {
      const halatX = MIN_X + (h + 1) * kulvarGenisligi;

      geciciMatris.makeTranslation(halatX, 0.01, 0);
      telInstanced.setMatrixAt(h, geciciMatris);

      geciciMatris.makeTranslation(halatX, 0.01, MIN_Z + 0.015);
      ankrajInstanced.setMatrixAt(h * 2, geciciMatris);

      geciciMatris.makeTranslation(halatX, 0.01, MAK_Z - 0.015);
      ankrajInstanced.setMatrixAt(h * 2 + 1, geciciMatris);

      for (let d = 0; d < halatBasiDisk; d += 1) {
        const z = baslangicZ + d * diskAraligi;
        geciciMatris.makeTranslation(halatX, 0.01, z);
        diskInstanced.setMatrixAt(diskIndeksi, geciciMatris);

        let diskRengi: THREE.Color;
        if (Math.abs(z) >= kirmiziSinirZ) {
          diskRengi = kirmiziRenk;
        } else {
          const segmentIndeksi = Math.floor((z + kirmiziSinirZ) / 0.48);
          diskRengi = segmentIndeksi % 2 === 0 ? sariRenk : kirmiziRenk;
        }
        diskInstanced.setColorAt(diskIndeksi, diskRengi);
        diskIndeksi += 1;
      }
    }

    diskInstanced.instanceMatrix.needsUpdate = true;
    if (diskInstanced.instanceColor) {
      diskInstanced.instanceColor.needsUpdate = true;
    }
    telInstanced.instanceMatrix.needsUpdate = true;
    ankrajInstanced.instanceMatrix.needsUpdate = true;

    this.anaGrup.add(diskInstanced, telInstanced, ankrajInstanced);
  }

  /**
   * Belirtilen kulvar numarası (1..6) için Sarı-Kırmızı parçalı Galatasaray
   * tasarımlı plaka CanvasTexture üretir.
   */
  private kulvarNumaraDokusuOlustur(kulvarNumarasi: number): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 256;
    tuval.height = 256;

    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Kulvar numarası dokusu için 2B tuval bağlamı oluşturulamadı.');
    }

    // Parçalı Sarı - Kırmızı Galatasaray zemini
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.fillRect(0, 0, 128, 256);

    baglam.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
    baglam.fillRect(128, 0, 128, 256);

    // Koyu çerçeve ve merkez dairesel rozet
    baglam.strokeStyle = GALATASARAY_RENKLERI.KARBON_ANTRASIT;
    baglam.lineWidth = 14;
    baglam.strokeRect(7, 7, 242, 242);

    baglam.fillStyle = 'rgba(17, 24, 39, 0.86)';
    baglam.beginPath();
    baglam.arc(128, 128, 76, 0, Math.PI * 2);
    baglam.fill();

    baglam.strokeStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.lineWidth = 5;
    baglam.stroke();

    baglam.fillStyle = '#ffffff';
    baglam.font = '800 112px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';
    baglam.fillText(String(kulvarNumarasi), 128, 134);

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    doku.needsUpdate = true;

    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * Z = CIKIS_BLOK_Z (-8.35) çıkış kenarında 6 kulvar için koyu antrasit-kırmızı
   * vurgulu ve Galatasaray numaralı atlayış platformları oluşturur.
   */
  private atlayisPlatformlariOlustur(): void {
    const platformZ = HAVUZ_SABITLERI.CIKIS_BLOK_Z;
    const guverteY = 0.175;

    const kaideGeometri = new THREE.BoxGeometry(0.42, 0.36, 0.44);
    const yanSeritGeometri = new THREE.BoxGeometry(0.44, 0.06, 0.46);
    const ustTabakaGeometri = new THREE.BoxGeometry(0.54, 0.055, 0.56);
    const ayakTakozuGeometri = new THREE.BoxGeometry(0.34, 0.075, 0.10);
    const onTutamacYatayGeometri = new THREE.CylinderGeometry(0.014, 0.014, 0.44, 10);
    onTutamacYatayGeometri.rotateZ(Math.PI * 0.5);
    const yanTutamacGeometri = new THREE.CylinderGeometry(0.013, 0.013, 0.14, 8);
    const sirtustuBarGeometri = new THREE.CylinderGeometry(0.014, 0.014, 0.46, 10);
    sirtustuBarGeometri.rotateZ(Math.PI * 0.5);
    const numaraPlakaGeometri = new THREE.PlaneGeometry(0.24, 0.24);

    this.olusturulanGeometriler.push(
      kaideGeometri,
      yanSeritGeometri,
      ustTabakaGeometri,
      ayakTakozuGeometri,
      onTutamacYatayGeometri,
      yanTutamacGeometri,
      sirtustuBarGeometri,
      numaraPlakaGeometri,
    );

    const kaymazUstMateryal = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.92,
      metalness: 0.08,
    });
    this.olusturulanMateryaller.push(kaymazUstMateryal);

    for (let k = 0; k < HAVUZ_SABITLERI.KULVAR_SAYISI; k += 1) {
      const merkezX = kulvarMerkeziXGetir(k);
      const kulvarNo = k + 1;

      const blokGrubu = new THREE.Group();
      blokGrubu.name = `atlayisPlatformu_${kulvarNo}`;
      blokGrubu.position.set(merkezX, guverteY, platformZ);

      // Koyu antrasit ana kaide ve kırmızı alt vurgu kemeri
      const kaideMesh = new THREE.Mesh(kaideGeometri, this.koyuKarbonMateryal);
      kaideMesh.position.set(0, 0.18, -0.02);

      const altVurguMesh = new THREE.Mesh(yanSeritGeometri, this.gsKirmiziMateryal);
      altVurguMesh.position.set(0, 0.032, -0.02);

      // +Z (havuza) doğru eğimli kaymaz üst tabaka (üst kot ~0.58m)
      const ustTabaka = new THREE.Mesh(ustTabakaGeometri, kaymazUstMateryal);
      ustTabaka.position.set(0, 0.39, 0.05);
      ustTabaka.rotation.x = THREE.MathUtils.degToRad(9);

      // Arka ayak dayama takozu (Galatasaray Kırmızısı)
      const ayakTakozu = new THREE.Mesh(ayakTakozuGeometri, this.gsKirmiziMateryal);
      ayakTakozu.position.set(0, 0.455, -0.14);
      ayakTakozu.rotation.x = THREE.MathUtils.degToRad(34);

      // Ön tutamaç barı ve yan destek ayakları
      const onTutamac = new THREE.Mesh(onTutamacYatayGeometri, this.kromMateryal);
      onTutamac.position.set(0, 0.31, 0.34);

      const solDestek = new THREE.Mesh(yanTutamacGeometri, this.kromMateryal);
      solDestek.position.set(-0.21, 0.33, 0.29);
      solDestek.rotation.x = THREE.MathUtils.degToRad(52);

      const sagDestek = new THREE.Mesh(yanTutamacGeometri, this.kromMateryal);
      sagDestek.position.set(0.21, 0.33, 0.29);
      sagDestek.rotation.x = THREE.MathUtils.degToRad(52);

      const sirtustuBar = new THREE.Mesh(sirtustuBarGeometri, this.kromMateryal);
      sirtustuBar.position.set(0, 0.18, 0.33);

      // Sarı-Kırmızı kulvar numarası plakaları
      const numaraDokusu = this.kulvarNumaraDokusuOlustur(kulvarNo);
      const plakaMateryali = new THREE.MeshStandardMaterial({
        map: numaraDokusu,
        roughness: 0.34,
        metalness: 0.08,
      });
      this.olusturulanMateryaller.push(plakaMateryali);

      const onNumaraPlakasi = new THREE.Mesh(numaraPlakaGeometri, plakaMateryali);
      onNumaraPlakasi.position.set(0, 0.20, 0.205);

      const arkaNumaraPlakasi = new THREE.Mesh(numaraPlakaGeometri, plakaMateryali);
      arkaNumaraPlakasi.position.set(0, 0.20, -0.245);
      arkaNumaraPlakasi.rotation.y = Math.PI;

      blokGrubu.add(
        kaideMesh,
        altVurguMesh,
        ustTabaka,
        ayakTakozu,
        onTutamac,
        solDestek,
        sagDestek,
        sirtustuBar,
        onNumaraPlakasi,
        arkaNumaraPlakasi,
      );

      this.anaGrup.add(blokGrubu);
    }
  }

  /**
   * Z = -5.0 ve Z = +5.0 hizalarında Y = 1.95 m yüksekliğinde
   * Sarı-Kırmızı sıralı Galatasaray üçgen flamalı sırtüstü dönüş bayrak iplerini oluşturur.
   */
  private sirtustuBayrakIpleriOlustur(): void {
    const bayrakZKonumlari = [-5.0, 5.0];
    const ipYuksekligiY = 1.95;
    const direkX = 4.55;
    const guverteY = 0.175;
    const direkBoyu = ipYuksekligiY + 0.12 - guverteY;

    const direkGeometri = new THREE.CylinderGeometry(0.032, 0.036, direkBoyu, 12);
    const flansGeometri = new THREE.CylinderGeometry(0.085, 0.095, 0.03, 14);
    const ipGeometri = new THREE.CylinderGeometry(0.007, 0.007, direkX * 2, 8);
    ipGeometri.rotateZ(Math.PI * 0.5);

    this.olusturulanGeometriler.push(direkGeometri, flansGeometri, ipGeometri);

    const direkInstanced = new THREE.InstancedMesh(direkGeometri, this.kromMateryal, 4);
    const flansInstanced = new THREE.InstancedMesh(flansGeometri, this.kromMateryal, 4);
    const ipInstanced = new THREE.InstancedMesh(ipGeometri, this.kromMateryal, 2);

    const geciciMatris = new THREE.Matrix4();
    let direkIndeksi = 0;

    for (let zIdx = 0; zIdx < bayrakZKonumlari.length; zIdx += 1) {
      const z = bayrakZKonumlari[zIdx];

      geciciMatris.makeTranslation(0, ipYuksekligiY, z);
      ipInstanced.setMatrixAt(zIdx, geciciMatris);

      for (const isaret of [-1, 1]) {
        const x = isaret * direkX;
        geciciMatris.makeTranslation(x, guverteY + direkBoyu * 0.5, z);
        direkInstanced.setMatrixAt(direkIndeksi, geciciMatris);

        geciciMatris.makeTranslation(x, guverteY + 0.015, z);
        flansInstanced.setMatrixAt(direkIndeksi, geciciMatris);
        direkIndeksi += 1;
      }
    }

    direkInstanced.instanceMatrix.needsUpdate = true;
    flansInstanced.instanceMatrix.needsUpdate = true;
    ipInstanced.instanceMatrix.needsUpdate = true;

    const flamaGeometri = new THREE.BufferGeometry();
    const flamaKoseler = new Float32Array([
      -0.11, 0.0, 0.0,
      0.11, 0.0, 0.0,
      0.0, -0.28, 0.0,
    ]);
    const flamaNormaller = new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]);
    flamaGeometri.setAttribute('position', new THREE.BufferAttribute(flamaKoseler, 3));
    flamaGeometri.setAttribute('normal', new THREE.BufferAttribute(flamaNormaller, 3));
    this.olusturulanGeometriler.push(flamaGeometri);

    const flamaMateryali = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.52,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.olusturulanMateryaller.push(flamaMateryali);

    const flamaBaslangicX = -4.16;
    const flamaAralikX = 0.26;
    const ipBasiFlamaSayisi = 33;
    const toplamFlama = ipBasiFlamaSayisi * bayrakZKonumlari.length;

    const flamaInstanced = new THREE.InstancedMesh(flamaGeometri, flamaMateryali, toplamFlama);
    flamaInstanced.name = 'galatasarayDonusBayraklari';

    const sariRenk = new THREE.Color(GALATASARAY_RENKLERI.HEX_SARI_ANA);
    const kirmiziRenk = new THREE.Color(GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA);

    let flamaIndeksi = 0;
    for (const z of bayrakZKonumlari) {
      for (let i = 0; i < ipBasiFlamaSayisi; i += 1) {
        const x = flamaBaslangicX + i * flamaAralikX;
        geciciMatris.makeTranslation(x, ipYuksekligiY, z);
        flamaInstanced.setMatrixAt(flamaIndeksi, geciciMatris);
        flamaInstanced.setColorAt(flamaIndeksi, i % 2 === 0 ? sariRenk : kirmiziRenk);
        flamaIndeksi += 1;
      }
    }

    flamaInstanced.instanceMatrix.needsUpdate = true;
    if (flamaInstanced.instanceColor) {
      flamaInstanced.instanceColor.needsUpdate = true;
    }

    this.anaGrup.add(direkInstanced, flansInstanced, ipInstanced, flamaInstanced);
  }

  /**
   * Uzun havuz duvarlarının uçlarında (X = ±4.0, Z = ±6.75)
   * 4 adet paslanmaz çelik havuz merdiveni oluşturur.
   */
  private havuzMerdivenleriOlustur(): void {
    const kolEgrisi = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.07, -1.35, 0),
      new THREE.Vector3(-0.07, 0.42, 0),
      new THREE.Vector3(0.06, 0.80, 0),
      new THREE.Vector3(0.32, 0.80, 0),
      new THREE.Vector3(0.46, 0.42, 0),
      new THREE.Vector3(0.46, 0.175, 0),
    ]);
    const kolGeometri = new THREE.TubeGeometry(kolEgrisi, 28, 0.022, 10, false);
    const basamakGeometri = new THREE.BoxGeometry(0.11, 0.032, 0.48);
    const pedGeometri = new THREE.BoxGeometry(0.085, 0.008, 0.42);
    const flansGeometri = new THREE.CylinderGeometry(0.048, 0.052, 0.02, 12);

    this.olusturulanGeometriler.push(kolGeometri, basamakGeometri, pedGeometri, flansGeometri);

    const merdivenKonumlari = [
      { x: 4.0, z: -6.75, rotasyonY: 0 },
      { x: 4.0, z: 6.75, rotasyonY: 0 },
      { x: -4.0, z: -6.75, rotasyonY: Math.PI },
      { x: -4.0, z: 6.75, rotasyonY: Math.PI },
    ];

    const basamakYukseklikleri = [-0.20, -0.52, -0.84, -1.16];
    const kolYariAraligiZ = 0.25;

    for (let m = 0; m < merdivenKonumlari.length; m += 1) {
      const konum = merdivenKonumlari[m];
      const merdivenGrubu = new THREE.Group();
      merdivenGrubu.name = `havuzMerdiveni_${m + 1}`;
      merdivenGrubu.position.set(konum.x, 0, konum.z);
      merdivenGrubu.rotation.y = konum.rotasyonY;

      for (const zOfset of [-kolYariAraligiZ, kolYariAraligiZ]) {
        const kolMesh = new THREE.Mesh(kolGeometri, this.kromMateryal);
        kolMesh.position.z = zOfset;

        const flansMesh = new THREE.Mesh(flansGeometri, this.kromMateryal);
        flansMesh.position.set(0.46, 0.185, zOfset);

        merdivenGrubu.add(kolMesh, flansMesh);
      }

      for (const basamakY of basamakYukseklikleri) {
        const basamakMesh = new THREE.Mesh(basamakGeometri, this.kromMateryal);
        basamakMesh.position.set(-0.07, basamakY, 0);

        const pedMesh = new THREE.Mesh(pedGeometri, this.koyuKarbonMateryal);
        pedMesh.position.set(-0.07, basamakY + 0.018, 0);

        merdivenGrubu.add(basamakMesh, pedMesh);
      }

      this.anaGrup.add(merdivenGrubu);
    }
  }

  /**
   * Kule ön cephesi için "GALATASARAY • 10M" sarı-kırmızı dikey tabela CanvasTexture üretir.
   */
  private kuleTabelaDokusuOlustur(): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 256;
    tuval.height = 768;

    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('10m kule tabelası dokusu için 2B tuval bağlamı oluşturulamadı.');
    }

    // Parçalı Sarı - Kırmızı arka plan
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.fillRect(0, 0, 128, 768);

    baglam.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
    baglam.fillRect(128, 0, 128, 768);

    // Koyu orta sütun şeridi
    baglam.fillStyle = 'rgba(17, 24, 39, 0.88)';
    baglam.fillRect(18, 22, 220, 724);

    baglam.strokeStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.lineWidth = 6;
    baglam.strokeRect(24, 28, 208, 712);

    // Üst sarı-kırmızı vurgu bandı
    baglam.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
    baglam.fillRect(34, 42, 188, 78);
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.font = '800 30px Inter, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';
    baglam.fillText('1905 • GS', 128, 82);

    // Dikey harf dizilimi ile "GALATASARAY"
    const harfler = 'GALATASARAY';
    baglam.fillStyle = '#ffffff';
    baglam.font = '800 32px Inter, sans-serif';
    for (let i = 0; i < harfler.length; i += 1) {
      baglam.fillText(harfler[i], 128, 162 + i * 36);
    }

    // Alt "10M" rozeti
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.fillRect(34, 578, 188, 134);
    baglam.fillStyle = GALATASARAY_RENKLERI.KARBON_ANTRASIT;
    baglam.font = '900 72px Inter, sans-serif';
    baglam.fillText('10M', 128, 648);

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    doku.needsUpdate = true;

    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * Havuzun +Z ucunda (Z = +9.55 taşıyıcı kolonlar) 5.0m, 7.5m ara katları,
   * 10.0m ana platformu, TRAMPLEN_UC_Z (+7.25) ucuna uzanan kaymaz tramplen
   * tahtası, arka tırmanma merdivenleri ve Galatasaray 10M tabelasını oluşturur.
   */
  private onMetreTramplenKulesiOlustur(): void {
    const tramplenX = kulvarMerkeziXGetir(HAVUZ_SABITLERI.TRAMPLEN_KULVAR_INDEKSI);
    const ustY = HAVUZ_SABITLERI.TRAMPLEN_YUKSEKLIK_Y; // 10.0m
    const guverteY = 0.175;

    const kuleGrubu = new THREE.Group();
    kuleGrubu.name = 'onMetreTramplenKulesi';

    const kolonOnZ = 9.55;
    const kolonArkaZ = 11.45;
    const kolonYariX = 0.90;
    const kolonYukseklik = ustY - guverteY;
    const kolonMerkezY = guverteY + kolonYukseklik * 0.5;

    // 1. Taşıyıcı ana betonarme/antrasit kule kolonları
    const kolonGeometri = new THREE.BoxGeometry(0.34, kolonYukseklik, 0.36);
    const bagKirisGeometri = new THREE.BoxGeometry(kolonYariX * 2 + 0.34, 0.28, 0.32);
    const yanBagGeometri = new THREE.BoxGeometry(0.28, 0.28, kolonArkaZ - kolonOnZ);
    this.olusturulanGeometriler.push(kolonGeometri, bagKirisGeometri, yanBagGeometri);

    for (const xOfset of [-kolonYariX, kolonYariX]) {
      const onKolon = new THREE.Mesh(kolonGeometri, this.kuleBetonMateryal);
      onKolon.position.set(tramplenX + xOfset, kolonMerkezY, kolonOnZ);

      const arkaKolon = new THREE.Mesh(kolonGeometri, this.kuleBetonMateryal);
      arkaKolon.position.set(tramplenX + xOfset, kolonMerkezY, kolonArkaZ);

      kuleGrubu.add(onKolon, arkaKolon);
    }

    // Kat hizalarında yatay taşıyıcı kirişler
    for (const katY of [3.0, 5.0, 7.5, 9.75]) {
      const onKiris = new THREE.Mesh(bagKirisGeometri, this.koyuKarbonMateryal);
      onKiris.position.set(tramplenX, katY - 0.16, kolonOnZ);
      kuleGrubu.add(onKiris);

      for (const xOfset of [-kolonYariX, kolonYariX]) {
        const yanKiris = new THREE.Mesh(yanBagGeometri, this.kuleBetonMateryal);
        yanKiris.position.set(tramplenX + xOfset, katY - 0.16, (kolonOnZ + kolonArkaZ) * 0.5);
        kuleGrubu.add(yanKiris);
      }
    }

    // 2. 5.0m, 7.5m Ara Katlar ve 10.0m Ana Üst Platform
    const katTanimlari = [
      { ad: 'kat5m', ustKotY: 5.0, onZ: 7.85, arkaZ: 11.65 },
      { ad: 'kat7_5m', ustKotY: 7.5, onZ: 7.65, arkaZ: 11.65 },
      { ad: 'kat10m', ustKotY: 9.92, onZ: 7.75, arkaZ: 11.65 },
    ];

    const platformGenislik = 2.18;
    const platformKalinlik = 0.26;
    const korkulukYukseklik = 1.04;
    const korkulukDikmeGeometri = new THREE.CylinderGeometry(0.018, 0.018, korkulukYukseklik, 8);
    this.olusturulanGeometriler.push(korkulukDikmeGeometri);

    for (const kat of katTanimlari) {
      const uzunluk = kat.arkaZ - kat.onZ;
      const merkezZ = (kat.onZ + kat.arkaZ) * 0.5;

      const tabliyeGeometri = new THREE.BoxGeometry(platformGenislik, platformKalinlik, uzunluk);
      const seritGeometri = new THREE.BoxGeometry(platformGenislik + 0.02, 0.07, uzunluk + 0.02);
      const kupesteGeometri = new THREE.CylinderGeometry(0.022, 0.022, uzunluk, 8);
      kupesteGeometri.rotateX(Math.PI * 0.5);
      const araKorkulukGeometri = new THREE.CylinderGeometry(0.014, 0.014, uzunluk, 8);
      araKorkulukGeometri.rotateX(Math.PI * 0.5);

      this.olusturulanGeometriler.push(
        tabliyeGeometri,
        seritGeometri,
        kupesteGeometri,
        araKorkulukGeometri,
      );

      const tabliyeMesh = new THREE.Mesh(tabliyeGeometri, this.kuleBetonMateryal);
      tabliyeMesh.name = kat.ad;
      tabliyeMesh.position.set(tramplenX, kat.ustKotY - platformKalinlik * 0.5, merkezZ);

      // Platform kenarında Galatasaray Kırmızı-Sarı alın bandı
      const alinSeridi = new THREE.Mesh(
        seritGeometri,
        kat.ad === 'kat10m' ? this.gsSariMateryal : this.gsKirmiziMateryal,
      );
      alinSeridi.position.set(tramplenX, kat.ustKotY - 0.06, merkezZ);

      kuleGrubu.add(tabliyeMesh, alinSeridi);

      // İki yan krom güvenlik korkuluğu
      for (const xOfset of [-platformGenislik * 0.5 + 0.05, platformGenislik * 0.5 - 0.05]) {
        const x = tramplenX + xOfset;
        const kupeste = new THREE.Mesh(kupesteGeometri, this.kromMateryal);
        kupeste.position.set(x, kat.ustKotY + korkulukYukseklik, merkezZ);

        const araBorusu = new THREE.Mesh(araKorkulukGeometri, this.kromMateryal);
        araBorusu.position.set(x, kat.ustKotY + korkulukYukseklik * 0.52, merkezZ);
        kuleGrubu.add(kupeste, araBorusu);

        for (let i = 0; i <= 4; i += 1) {
          const dikmeZ = kat.onZ + 0.06 + ((uzunluk - 0.12) * i) / 4;
          const dikme = new THREE.Mesh(korkulukDikmeGeometri, this.kromMateryal);
          dikme.position.set(x, kat.ustKotY + korkulukYukseklik * 0.5, dikmeZ);
          kuleGrubu.add(dikme);
        }
      }
    }

    // 3. Y = 10.0m, X = tramplenX ekseninde Z = +7.25m ucuna uzanan kaymaz Tramplen Tahtası
    const ucZ = HAVUZ_SABITLERI.TRAMPLEN_UC_Z; // 7.25
    const tahtaArkaZ = 9.65;
    const tahtaUzunluk = tahtaArkaZ - ucZ; // 2.40m
    const tahtaMerkezZ = (ucZ + tahtaArkaZ) * 0.5;
    const tahtaGenislik = 0.54;
    const tahtaKalinlik = 0.06;

    const tahtaGeometri = new THREE.BoxGeometry(tahtaGenislik, tahtaKalinlik, tahtaUzunluk);
    const yanProfilGeometri = new THREE.BoxGeometry(0.026, tahtaKalinlik + 0.01, tahtaUzunluk);
    const ucSeritGeometri = new THREE.BoxGeometry(tahtaGenislik + 0.02, tahtaKalinlik + 0.012, 0.06);
    const fulcrumSilindirGeometri = new THREE.CylinderGeometry(0.065, 0.065, tahtaGenislik + 0.14, 16);
    fulcrumSilindirGeometri.rotateZ(Math.PI * 0.5);
    const fulcrumAyakGeometri = new THREE.BoxGeometry(0.08, 0.12, 0.14);

    this.olusturulanGeometriler.push(
      tahtaGeometri,
      yanProfilGeometri,
      ucSeritGeometri,
      fulcrumSilindirGeometri,
      fulcrumAyakGeometri,
    );

    const tramplenTahtasi = new THREE.Mesh(tahtaGeometri, this.koyuKarbonMateryal);
    tramplenTahtasi.name = 'onMetreTramplenTahtasi';
    tramplenTahtasi.position.set(tramplenX, ustY - tahtaKalinlik * 0.5, tahtaMerkezZ);

    const solProfil = new THREE.Mesh(yanProfilGeometri, this.gsSariMateryal);
    solProfil.position.set(tramplenX - tahtaGenislik * 0.5 - 0.012, ustY - tahtaKalinlik * 0.5, tahtaMerkezZ);

    const sagProfil = new THREE.Mesh(yanProfilGeometri, this.gsKirmiziMateryal);
    sagProfil.position.set(tramplenX + tahtaGenislik * 0.5 + 0.012, ustY - tahtaKalinlik * 0.5, tahtaMerkezZ);

    const ucSerit = new THREE.Mesh(ucSeritGeometri, this.gsSariMateryal);
    ucSerit.position.set(tramplenX, ustY - tahtaKalinlik * 0.5, ucZ + 0.03);

    // Tramplen altı yaylanma dayanak silindiri (fulcrum) ve destek ayakları
    const fulcrumZ = 8.42;
    const fulcrumSilindir = new THREE.Mesh(fulcrumSilindirGeometri, this.gsKirmiziMateryal);
    fulcrumSilindir.position.set(tramplenX, ustY - tahtaKalinlik - 0.055, fulcrumZ);

    for (const xOfset of [-0.28, 0.28]) {
      const ayak = new THREE.Mesh(fulcrumAyakGeometri, this.kromMateryal);
      ayak.position.set(tramplenX + xOfset, ustY - 0.11, fulcrumZ);
      kuleGrubu.add(ayak);
    }

    // 10m tramplen tahtası yan krom destek korkulukları (Z ∈ [7.85, 9.65])
    const tahtaKorkulukUzunluk = 1.80;
    const tahtaKorkulukMerkezZ = 8.75;
    const tahtaKupesteGeometri = new THREE.CylinderGeometry(0.018, 0.018, tahtaKorkulukUzunluk, 8);
    tahtaKupesteGeometri.rotateX(Math.PI * 0.5);
    const tahtaDikmeGeometri = new THREE.CylinderGeometry(0.016, 0.016, 0.88, 8);
    this.olusturulanGeometriler.push(tahtaKupesteGeometri, tahtaDikmeGeometri);

    for (const xOfset of [-0.42, 0.42]) {
      const x = tramplenX + xOfset;
      const kupeste = new THREE.Mesh(tahtaKupesteGeometri, this.kromMateryal);
      kupeste.position.set(x, ustY + 0.82, tahtaKorkulukMerkezZ);
      kuleGrubu.add(kupeste);

      for (const dz of [7.88, 8.75, 9.60]) {
        const dikme = new THREE.Mesh(tahtaDikmeGeometri, this.kromMateryal);
        dikme.position.set(x, ustY + 0.38, dz);
        kuleGrubu.add(dikme);
      }
    }

    kuleGrubu.add(tramplenTahtasi, solProfil, sagProfil, ucSerit, fulcrumSilindir);

    // 4. Arka tarafta güverteden 10m platformuna çıkan zikzak merdivenler ve korkuluklar
    this.kuleArkaMerdivenleriOlustur(kuleGrubu, tramplenX, guverteY);

    // 5. Kule ön cephesi "GALATASARAY • 10M" Sarı-Kırmızı dikey tabela
    const tabelaDokusu = this.kuleTabelaDokusuOlustur();
    const tabelaMateryal = new THREE.MeshStandardMaterial({
      map: tabelaDokusu,
      emissiveMap: tabelaDokusu,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.22,
      roughness: 0.34,
      metalness: 0.08,
    });
    this.olusturulanMateryaller.push(tabelaMateryal);

    const tabelaKasaGeometri = new THREE.BoxGeometry(1.38, 3.85, 0.08);
    const tabelaYuzGeometri = new THREE.PlaneGeometry(1.30, 3.76);
    this.olusturulanGeometriler.push(tabelaKasaGeometri, tabelaYuzGeometri);

    const tabelaKasa = new THREE.Mesh(tabelaKasaGeometri, this.koyuKarbonMateryal);
    tabelaKasa.position.set(tramplenX, 2.55, kolonOnZ - 0.16);

    const tabelaYuz = new THREE.Mesh(tabelaYuzGeometri, tabelaMateryal);
    tabelaYuz.name = 'galatasarayOnMetreTabelasi';
    tabelaYuz.position.set(tramplenX, 2.55, kolonOnZ - 0.205);
    tabelaYuz.rotation.y = Math.PI; // -Z (havuza ve başlangıç kamerasına) bakar

    kuleGrubu.add(tabelaKasa, tabelaYuz);
    this.anaGrup.add(kuleGrubu);
  }

  /**
   * 10m tramplen kulesinin arkasında güverteden 5.0m, 7.5m ve 10.0m katlarına
   * çıkan çelik merdiven basamaklarını, ara sahanlıkları ve krom korkulukları ekler.
   */
  private kuleArkaMerdivenleriOlustur(
    kuleGrubu: THREE.Group,
    tramplenX: number,
    guverteY: number,
  ): void {
    const merdivenKollar = [
      { altY: guverteY, ustY: 5.0, altZ: 14.25, ustZ: 11.65, x: tramplenX + 0.46 },
      { altY: 5.0, ustY: 7.5, altZ: 11.65, ustZ: 13.15, x: tramplenX - 0.46 },
      { altY: 7.5, ustY: 9.92, altZ: 13.15, ustZ: 11.65, x: tramplenX + 0.46 },
    ];

    const toplamBasamak = 14 + 9 + 9;
    const basamakGeometri = new THREE.BoxGeometry(0.76, 0.045, 0.24);
    const sahanlikGeometri = new THREE.BoxGeometry(2.18, 0.18, 0.90);
    this.olusturulanGeometriler.push(basamakGeometri, sahanlikGeometri);

    const basamakInstanced = new THREE.InstancedMesh(
      basamakGeometri,
      this.koyuKarbonMateryal,
      toplamBasamak,
    );
    basamakInstanced.name = 'kuleMerdivenBasamaklari';

    const matris = new THREE.Matrix4();
    let basamakIdx = 0;

    for (const kol of merdivenKollar) {
      const basamakAdet = kol.altY < 1.0 ? 14 : 9;
      const dx = kol.x;
      const dy = kol.ustY - kol.altY;
      const dz = kol.ustZ - kol.altZ;
      const egimUzunlugu = Math.hypot(dy, dz);
      const dogrultu = new THREE.Vector3(0, dy, dz).normalize();
      const egimRotasyon = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        dogrultu,
      );

      for (let b = 0; b < basamakAdet; b += 1) {
        const t = (b + 0.5) / basamakAdet;
        matris.makeTranslation(dx, kol.altY + dy * t, kol.altZ + dz * t);
        basamakInstanced.setMatrixAt(basamakIdx, matris);
        basamakIdx += 1;
      }

      // Yan çelik taşıyıcı kirişler ve krom korkuluk boruları
      const kirisGeometri = new THREE.BoxGeometry(0.06, 0.14, egimUzunlugu);
      const korkulukGeometri = new THREE.CylinderGeometry(0.016, 0.016, egimUzunlugu, 8);
      korkulukGeometri.rotateX(Math.PI * 0.5);
      this.olusturulanGeometriler.push(kirisGeometri, korkulukGeometri);

      const ortaY = (kol.altY + kol.ustY) * 0.5;
      const ortaZ = (kol.altZ + kol.ustZ) * 0.5;

      for (const xOfset of [-0.40, 0.40]) {
        const kiris = new THREE.Mesh(kirisGeometri, this.kuleBetonMateryal);
        kiris.position.set(dx + xOfset, ortaY - 0.05, ortaZ);
        kiris.quaternion.copy(egimRotasyon);

        const korkuluk = new THREE.Mesh(korkulukGeometri, this.kromMateryal);
        korkuluk.position.set(dx + xOfset, ortaY + 0.88, ortaZ);
        korkuluk.quaternion.copy(egimRotasyon);

        kuleGrubu.add(kiris, korkuluk);
      }
    }

    basamakInstanced.instanceMatrix.needsUpdate = true;

    // 7.5m arka dönüş sahanlığı (Z = 13.45)
    const sahanlik = new THREE.Mesh(sahanlikGeometri, this.kuleBetonMateryal);
    sahanlik.position.set(tramplenX, 7.41, 13.55);

    kuleGrubu.add(basamakInstanced, sahanlik);
  }

  /**
   * Olimpik ekipmanlar tarafından oluşturulan tüm sahne nesnelerini,
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
