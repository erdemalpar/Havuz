import * as THREE from 'three';
import {
  GALATASARAY_RENKLERI,
  type KaynakTemizlenebilir,
} from '../types/simulation';

const GUVERTE_UST_Y = 0.175;

type TaraftarRolu = 'atki' | 'bayrak' | 'beste';

interface TaraftarVerisi {
  x: number;
  y: number;
  z: number;
  tarafIsaret: -1 | 1;
  faz: number;
  hiz: number;
  olcek: number;
  rol: TaraftarRolu;
  altRolIndeks: number;
}

interface YuruyenHakem {
  grup: THREE.Group;
  solKol: THREE.Group;
  sagKol: THREE.Group;
  solBacak: THREE.Group;
  sagBacak: THREE.Group;
  sabitX: number;
  minZ: number;
  makZ: number;
  konumZ: number;
  yonZ: 1 | -1;
  hiz: number;
  adimFazi: number;
}

interface PuanHakemi {
  sagKol: THREE.Group;
  tabelaTuval: HTMLCanvasElement;
  tabelaBaglam: CanvasRenderingContext2D;
  tabelaDoku: THREE.CanvasTexture;
}

interface AntrenorFiguru {
  grup: THREE.Group;
  solKol: THREE.Group;
  sagKol: THREE.Group;
  baslangicX: number;
  baslangicZ: number;
  faz: number;
}

interface BesteNotaKaydi {
  temelX: number;
  temelY: number;
  temelZ: number;
  faz: number;
  hiz: number;
  tipIndeksi: 0 | 1 | 2;
  altIndeks: number;
}

/**
 * Tribünlerdeki çeşitli seyircileri (atkı sallayanlar, bayrak sallayanlar,
 * kafalarının üzerinde beste notaları yükselenler), havuz kenarı hakemlerini,
 * 5 puan hakemi masasını ve Galatasaraylı yüzme antrenörlerini yönetir.
 */
export class ArenaKalabalikVeHakemler implements KaynakTemizlenebilir {
  private readonly sahne: THREE.Scene;
  private readonly anaGrup: THREE.Group;
  private readonly olusturulanGeometriler: THREE.BufferGeometry[] = [];
  private readonly olusturulanMateryaller: THREE.Material[] = [];
  private readonly olusturulanDokular: THREE.Texture[] = [];

  private readonly taraftarlar: TaraftarVerisi[] = [];
  private readonly atkiIndeksleri: number[] = [];
  private readonly bayrakIndeksleri: number[] = [];
  private readonly besteNotalari: BesteNotaKaydi[] = [];

  private govdeInstanced!: THREE.InstancedMesh;
  private basInstanced!: THREE.InstancedMesh;
  private sapkaInstanced!: THREE.InstancedMesh;
  private solKolInstanced!: THREE.InstancedMesh;
  private sagKolInstanced!: THREE.InstancedMesh;
  private atkiInstanced!: THREE.InstancedMesh;
  private gonderInstanced!: THREE.InstancedMesh;
  private bayrakInstanced!: THREE.InstancedMesh;
  private readonly notaInstancedListesi: THREE.InstancedMesh[] = [];

  private readonly yuruyenHakemler: YuruyenHakem[] = [];
  private starterSagKol!: THREE.Group;
  private starterIsaretKalanSure = 0;

  private readonly puanHakemleri: PuanHakemi[] = [];
  private hakemPuanGosterimKalanSure = 0;

  private readonly antrenorler: AntrenorFiguru[] = [];

  // Kare başına GC baskısını sıfırlamak için yeniden kullanılan matematik nesneleri
  private readonly geciciMatris = new THREE.Matrix4();
  private readonly geciciKonum = new THREE.Vector3();
  private readonly geciciRotasyon = new THREE.Quaternion();
  private readonly geciciEuler = new THREE.Euler();
  private readonly geciciOlcek = new THREE.Vector3(1, 1, 1);

  private temizlendiMi = false;

  constructor(sahne: THREE.Scene) {
    this.sahne = sahne;
    this.anaGrup = new THREE.Group();
    this.anaGrup.name = 'arenaKalabalikVeHakemler';

    this.tribunSeyircileriniOlustur();
    this.havuzKenariHakemleriniOlustur();
    this.puanHakemleriMasasiniOlustur();
    this.yuzucuAntrenorleriniOlustur();

    this.guncelle(0.016, 0, 0.25);
    this.sahne.add(this.anaGrup);
  }

  /**
   * 2 tribünde farklı kıyafet/ten tiplerinde atkılı, bayraklı ve beste söyleyen
   * seyircileri ve yükselen müzik notalarını InstancedMesh ile kurar.
   */
  private tribunSeyircileriniOlustur(): void {
    const baslangicX = 13.25;
    const basamakDerinlik = 1.25;
    const basamakYukseklik = 0.52;
    const basamakSayisi = 5;
    const zBaslangic = -17.4;
    const zAdim = 2.08;
    const zAdet = 17;

    for (const tarafIsaret of [-1, 1] as const) {
      for (let b = 0; b < basamakSayisi; b += 1) {
        const siraY = GUVERTE_UST_Y + (b + 1) * basamakYukseklik + 0.08;
        const siraX = tarafIsaret * (baslangicX + b * basamakDerinlik + 0.55);

        for (let k = 0; k < zAdet; k += 1) {
          // Tribün doğallığı için koltukların %68'ini dengeli dağıt
          const secim = ((b * 11 + k * 7 + (tarafIsaret > 0 ? 3 : 0)) % 10);
          if (secim > 6) {
            continue;
          }

          const tohum = Math.sin((b * 29 + k * 13 + tarafIsaret * 19) * 12.9898) * 43758.5453;
          const rastgele = tohum - Math.floor(tohum);

          const rolIndeks = (b + k + (tarafIsaret > 0 ? 1 : 0)) % 3;
          const rol: TaraftarRolu =
            rolIndeks === 0 ? 'atki' : rolIndeks === 1 ? 'bayrak' : 'beste';

          const z = zBaslangic + k * zAdim + (rastgele - 0.5) * 0.42;
          const olcek = 0.93 + rastgele * 0.14;

          let altRolIndeks = 0;
          const taraftarIndeks = this.taraftarlar.length;
          if (rol === 'atki') {
            altRolIndeks = this.atkiIndeksleri.length;
            this.atkiIndeksleri.push(taraftarIndeks);
          } else if (rol === 'bayrak') {
            altRolIndeks = this.bayrakIndeksleri.length;
            this.bayrakIndeksleri.push(taraftarIndeks);
          } else {
            altRolIndeks = this.besteNotalari.length;
            const tipIndeksi = (this.besteNotalari.length % 3) as 0 | 1 | 2;
            this.besteNotalari.push({
              temelX: siraX,
              temelY: siraY + 1.05 * olcek,
              temelZ: z,
              faz: rastgele * Math.PI * 2,
              hiz: 0.58 + rastgele * 0.34,
              tipIndeksi,
              altIndeks: 0,
            });
          }

          this.taraftarlar.push({
            x: siraX,
            y: siraY,
            z,
            tarafIsaret,
            faz: rastgele * Math.PI * 2,
            hiz: 3.0 + rastgele * 2.4,
            olcek,
            rol,
            altRolIndeks,
          });
        }
      }
    }

    const toplamTaraftar = this.taraftarlar.length;

    const govdeGeometri = new THREE.BoxGeometry(0.38, 0.54, 0.24);
    const basGeometri = new THREE.SphereGeometry(0.135, 10, 10);
    const sapkaGeometri = new THREE.CylinderGeometry(0.145, 0.15, 0.09, 10);
    const kolGeometri = new THREE.CapsuleGeometry(0.052, 0.32, 4, 6);
    const atkiGeometri = new THREE.BoxGeometry(0.84, 0.14, 0.025);
    const gonderGeometri = new THREE.CylinderGeometry(0.014, 0.016, 1.05, 6);
    const bayrakGeometri = new THREE.PlaneGeometry(0.66, 0.44);
    bayrakGeometri.translate(0.33, 0, 0);

    this.olusturulanGeometriler.push(
      govdeGeometri,
      basGeometri,
      sapkaGeometri,
      kolGeometri,
      atkiGeometri,
      gonderGeometri,
      bayrakGeometri,
    );

    const standartBeyazMateryal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.05,
    });
    const atkiDokusu = this.gsAtkiDokusuOlustur();
    const atkiMateryali = new THREE.MeshStandardMaterial({
      map: atkiDokusu,
      roughness: 0.55,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const bayrakDokusu = this.gsBayrakDokusuOlustur();
    const bayrakMateryali = new THREE.MeshStandardMaterial({
      map: bayrakDokusu,
      roughness: 0.48,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const gonderMateryali = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.35,
      metalness: 0.5,
    });

    this.olusturulanMateryaller.push(
      standartBeyazMateryal,
      atkiMateryali,
      bayrakMateryali,
      gonderMateryali,
    );

    this.govdeInstanced = new THREE.InstancedMesh(govdeGeometri, standartBeyazMateryal, toplamTaraftar);
    this.basInstanced = new THREE.InstancedMesh(basGeometri, standartBeyazMateryal, toplamTaraftar);
    this.sapkaInstanced = new THREE.InstancedMesh(sapkaGeometri, standartBeyazMateryal, toplamTaraftar);
    this.solKolInstanced = new THREE.InstancedMesh(kolGeometri, standartBeyazMateryal, toplamTaraftar);
    this.sagKolInstanced = new THREE.InstancedMesh(kolGeometri, standartBeyazMateryal, toplamTaraftar);
    this.atkiInstanced = new THREE.InstancedMesh(atkiGeometri, atkiMateryali, Math.max(1, this.atkiIndeksleri.length));
    this.gonderInstanced = new THREE.InstancedMesh(gonderGeometri, gonderMateryali, Math.max(1, this.bayrakIndeksleri.length));
    this.bayrakInstanced = new THREE.InstancedMesh(bayrakGeometri, bayrakMateryali, Math.max(1, this.bayrakIndeksleri.length));

    this.govdeInstanced.name = 'tribunSeyirciGovdeleri';
    this.atkiInstanced.name = 'tribunSeyirciAtkilari';
    this.bayrakInstanced.name = 'tribunSeyirciBayraklari';

    const ciltPaleti = [0xf2c8a2, 0xe2aa80, 0xc68860, 0x9b6444, 0xead0b8];
    const formaPaleti = [
      GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      GALATASARAY_RENKLERI.HEX_SARI_ANA,
      0x7c0324,
      0xf8fafc,
      0x1e293b,
    ];
    const geciciRenk = new THREE.Color();

    for (let i = 0; i < toplamTaraftar; i += 1) {
      const cilt = ciltPaleti[(i * 3) % ciltPaleti.length];
      const forma = formaPaleti[(i * 5 + 1) % formaPaleti.length];
      const sapka = i % 2 === 0 ? GALATASARAY_RENKLERI.HEX_SARI_ANA : GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA;

      geciciRenk.setHex(forma);
      this.govdeInstanced.setColorAt(i, geciciRenk);
      this.solKolInstanced.setColorAt(i, geciciRenk);
      this.sagKolInstanced.setColorAt(i, geciciRenk);

      geciciRenk.setHex(cilt);
      this.basInstanced.setColorAt(i, geciciRenk);

      geciciRenk.setHex(sapka);
      this.sapkaInstanced.setColorAt(i, geciciRenk);
    }

    for (const inst of [
      this.govdeInstanced,
      this.basInstanced,
      this.sapkaInstanced,
      this.solKolInstanced,
      this.sagKolInstanced,
    ]) {
      if (inst.instanceColor) {
        inst.instanceColor.needsUpdate = true;
      }
    }

    this.anaGrup.add(
      this.govdeInstanced,
      this.basInstanced,
      this.sapkaInstanced,
      this.solKolInstanced,
      this.sagKolInstanced,
      this.atkiInstanced,
      this.gonderInstanced,
      this.bayrakInstanced,
    );

    // Beste söyleyen seyircilerin kafalarının üzerinde süzülen 3 çeşit müzik notası ('♪', '♫', '♬')
    this.besteNotaInstancedlariniKur();
  }

  private besteNotaInstancedlariniKur(): void {
    const semboller = ['♪', '♫', '♬'] as const;
    const renkler = [GALATASARAY_RENKLERI.SARI_ALTIN, '#ffffff', '#fb7185'] as const;

    // Her açıdan okunabilmesi için 2 çapraz düzlemden oluşan nota geometrisi
    const notaGeometri = this.caprazNotaGeometrisiOlustur(0.46, 0.46);
    this.olusturulanGeometriler.push(notaGeometri);

    const gruplanmisSayilar: [number, number, number] = [0, 0, 0];
    for (const kayit of this.besteNotalari) {
      kayit.altIndeks = gruplanmisSayilar[kayit.tipIndeksi];
      gruplanmisSayilar[kayit.tipIndeksi] += 1;
    }

    for (let t = 0; t < 3; t += 1) {
      const notaDokusu = this.muzikNotaDokusuOlustur(semboller[t], renkler[t]);
      const notaMateryali = new THREE.MeshBasicMaterial({
        map: notaDokusu,
        alphaTest: 0.25,
        side: THREE.DoubleSide,
      });
      this.olusturulanMateryaller.push(notaMateryali);

      const adet = Math.max(1, gruplanmisSayilar[t]);
      const inst = new THREE.InstancedMesh(notaGeometri, notaMateryali, adet);
      inst.name = `besteNotalari_${t}`;
      this.notaInstancedListesi.push(inst);
      this.anaGrup.add(inst);
    }
  }

  private caprazNotaGeometrisiOlustur(genislik: number, yukseklik: number): THREE.BufferGeometry {
    const hw = genislik * 0.5;
    const hh = yukseklik * 0.5;
    // İki dikey çapraz dörtgen (0° ve 90°) -> kameradan her açıda net nota görünümü
    const konumlar = new Float32Array([
      -hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0,
      0, -hh, -hw, 0, -hh, hw, 0, hh, hw, 0, hh, -hw,
    ]);
    const uvler = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
    ]);
    const indeksler = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(konumlar, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvler, 2));
    geom.setIndex(indeksler);
    geom.computeVertexNormals();
    return geom;
  }

  private muzikNotaDokusuOlustur(sembol: string, anaRenk: string): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 128;
    tuval.height = 128;
    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Beste nota dokusu oluşturulamadı.');
    }

    baglam.clearRect(0, 0, 128, 128);
    baglam.font = '900 84px "Apple Symbols", "Segoe UI Symbol", Inter, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';

    // Koyu kontur ile uzaktan net okunabilirlik
    baglam.strokeStyle = '#090d16';
    baglam.lineWidth = 10;
    baglam.strokeText(sembol, 64, 68);

    baglam.fillStyle = anaRenk;
    baglam.fillText(sembol, 64, 68);

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.needsUpdate = true;
    this.olusturulanDokular.push(doku);
    return doku;
  }

  private gsAtkiDokusuOlustur(): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 256;
    tuval.height = 64;
    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Galatasaray atkı dokusu oluşturulamadı.');
    }

    const blokSayisi = 6;
    const gen = 256 / blokSayisi;
    for (let i = 0; i < blokSayisi; i += 1) {
      baglam.fillStyle = i % 2 === 0 ? GALATASARAY_RENKLERI.SARI_ANA : GALATASARAY_RENKLERI.KIRMIZI_ANA;
      baglam.fillRect(i * gen, 0, gen + 1, 64);
    }
    baglam.fillStyle = '#ffffff';
    baglam.font = '800 22px Inter, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';
    baglam.fillText('1905  ★  GS', 128, 33);

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.needsUpdate = true;
    this.olusturulanDokular.push(doku);
    return doku;
  }

  private gsBayrakDokusuOlustur(): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 256;
    tuval.height = 170;
    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Galatasaray bayrak dokusu oluşturulamadı.');
    }

    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.fillRect(0, 0, 128, 170);
    baglam.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
    baglam.fillRect(128, 0, 128, 170);

    baglam.fillStyle = '#111827';
    baglam.beginPath();
    baglam.arc(128, 85, 38, 0, Math.PI * 2);
    baglam.fill();
    baglam.strokeStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.lineWidth = 4;
    baglam.stroke();

    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ALTIN;
    baglam.font = '900 32px Inter, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';
    baglam.fillText('GS', 128, 86);

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.needsUpdate = true;
    this.olusturulanDokular.push(doku);
    return doku;
  }

  /**
   * Havuz kenarlarında başhakem (starter) ve yürüyen kulvar/dönüş hakemlerini oluşturur.
   */
  private havuzKenariHakemleriniOlustur(): void {
    const beyazTisort = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });
    const lacivertPantolon = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72 });
    const ciltMateryal = new THREE.MeshStandardMaterial({ color: 0xdeb08c, roughness: 0.52 });
    const kornaMateryal = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KIRMIZI_VURGU,
      roughness: 0.35,
      metalness: 0.3,
    });
    this.olusturulanMateryaller.push(beyazTisort, lacivertPantolon, ciltMateryal, kornaMateryal);

    // 1. Çıkış Başhakemi (Starter) - Çıkış bloklarının sol yanında
    const basHakem = this.ayaktaInsanOlustur(beyazTisort, lacivertPantolon, ciltMateryal, beyazTisort);
    basHakem.grup.name = 'havuzBasHakemi';
    basHakem.grup.position.set(-9.15, GUVERTE_UST_Y, -16.15);
    basHakem.grup.rotation.y = Math.PI * 0.45;
    this.starterSagKol = basHakem.sagKol;

    const kornaGeometri = new THREE.CylinderGeometry(0.032, 0.045, 0.24, 8);
    this.olusturulanGeometriler.push(kornaGeometri);
    const kornaMesh = new THREE.Mesh(kornaGeometri, kornaMateryal);
    kornaMesh.position.set(0, -0.52, 0.08);
    kornaMesh.rotation.x = Math.PI * 0.5;
    this.starterSagKol.add(kornaMesh);
    this.anaGrup.add(basHakem.grup);

    // 2. 4 Yürüyen Kulvar / Stil Hakemi (sol ve sağ havuz kenarlarında devriye)
    const yuruyusTanimlari = [
      { x: -8.95, minZ: -13.0, makZ: -1.5, z: -9.0, yon: 1 as const },
      { x: -8.95, minZ: 1.5, makZ: 13.0, z: 6.0, yon: -1 as const },
      { x: 8.95, minZ: -13.0, makZ: -1.5, z: -4.0, yon: -1 as const },
      { x: 8.95, minZ: 1.5, makZ: 13.0, z: 9.0, yon: 1 as const },
    ];

    for (let i = 0; i < yuruyusTanimlari.length; i += 1) {
      const tanim = yuruyusTanimlari[i];
      const fig = this.ayaktaInsanOlustur(beyazTisort, lacivertPantolon, ciltMateryal, beyazTisort);
      fig.grup.name = `havuzKenarHakemi_${i + 1}`;
      fig.grup.position.set(tanim.x, GUVERTE_UST_Y, tanim.z);
      this.anaGrup.add(fig.grup);

      this.yuruyenHakemler.push({
        grup: fig.grup,
        solKol: fig.solKol,
        sagKol: fig.sagKol,
        solBacak: fig.solBacak,
        sagBacak: fig.sagBacak,
        sabitX: tanim.x,
        minZ: tanim.minZ,
        makZ: tanim.makZ,
        konumZ: tanim.z,
        yonZ: tanim.yon,
        hiz: 1.05 + i * 0.12,
        adimFazi: i * 1.4,
      });
    }

    // 3. Bitiş / Dönüş hakemi (+Z ucunda)
    const bitisHakemi = this.ayaktaInsanOlustur(beyazTisort, lacivertPantolon, ciltMateryal, beyazTisort);
    bitisHakemi.grup.name = 'havuzBitisHakemi';
    bitisHakemi.grup.position.set(-4.6, GUVERTE_UST_Y, 16.95);
    bitisHakemi.grup.rotation.y = Math.PI;
    this.anaGrup.add(bitisHakemi.grup);
  }

  /**
   * Sol güvertede (X = -10.9, Z = 10.5) 10m tramplen iniş bölgesini gören
   * örtülü Puan Veren Hakemler Masası ve 5 puan hakemini oluşturur.
   */
  private puanHakemleriMasasiniOlustur(): void {
    const masaGrubu = new THREE.Group();
    masaGrubu.name = 'puanVerenHakemlerMasasi';
    masaGrubu.position.set(-10.9, GUVERTE_UST_Y, 10.5);

    const masaUstMateryal = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45 });
    const ortuDokusu = this.hakemMasaOrtusuDokusuOlustur();
    const ortuMateryal = new THREE.MeshStandardMaterial({ map: ortuDokusu, roughness: 0.55 });
    const metalMateryal = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 });
    const lacivertCeket = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.62 });
    const beyazGomlek = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
    const ciltMateryal = new THREE.MeshStandardMaterial({ color: 0xdfb18a, roughness: 0.52 });

    this.olusturulanMateryaller.push(
      masaUstMateryal,
      ortuMateryal,
      metalMateryal,
      lacivertCeket,
      beyazGomlek,
      ciltMateryal,
    );

    const tablaGeometri = new THREE.BoxGeometry(0.92, 0.06, 5.4);
    const ortuOnGeometri = new THREE.BoxGeometry(0.04, 0.76, 5.36);
    const ayakGeometri = new THREE.CylinderGeometry(0.025, 0.025, 0.76, 8);
    const sandalyeOturakGeo = new THREE.BoxGeometry(0.42, 0.06, 0.42);
    const sandalyeSirtGeo = new THREE.BoxGeometry(0.06, 0.46, 0.42);
    const sapGeometri = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6);
    const tabelaGeometri = new THREE.BoxGeometry(0.04, 0.34, 0.46);

    this.olusturulanGeometriler.push(
      tablaGeometri,
      ortuOnGeometri,
      ayakGeometri,
      sandalyeOturakGeo,
      sandalyeSirtGeo,
      sapGeometri,
      tabelaGeometri,
    );

    const tablaMesh = new THREE.Mesh(tablaGeometri, masaUstMateryal);
    tablaMesh.position.set(0, 0.78, 0);
    const ortuOnMesh = new THREE.Mesh(ortuOnGeometri, ortuMateryal);
    ortuOnMesh.position.set(0.44, 0.39, 0);
    masaGrubu.add(tablaMesh, ortuOnMesh);

    for (const [ax, az] of [
      [-0.4, -2.5],
      [0.4, -2.5],
      [-0.4, 2.5],
      [0.4, 2.5],
    ] as const) {
      const ayak = new THREE.Mesh(ayakGeometri, metalMateryal);
      ayak.position.set(ax, 0.38, az);
      masaGrubu.add(ayak);
    }

    // 5 oturan puan hakemi (H1 .. H5) ve ellerinde puan tabelaları
    const govdeGeo = new THREE.BoxGeometry(0.38, 0.54, 0.28);
    const basGeo = new THREE.SphereGeometry(0.135, 10, 10);
    const bacakGeo = new THREE.CapsuleGeometry(0.065, 0.38, 4, 6);
    const kolGeo = new THREE.CapsuleGeometry(0.052, 0.34, 4, 6);
    this.olusturulanGeometriler.push(govdeGeo, basGeo, bacakGeo, kolGeo);

    for (let h = 0; h < 5; h += 1) {
      const z = -2.0 + h * 1.0;

      const oturak = new THREE.Mesh(sandalyeOturakGeo, lacivertCeket);
      oturak.position.set(-0.62, 0.46, z);
      const sirt = new THREE.Mesh(sandalyeSirtGeo, lacivertCeket);
      sirt.position.set(-0.82, 0.69, z);
      masaGrubu.add(oturak, sirt);

      const hakemGrup = new THREE.Group();
      hakemGrup.position.set(-0.58, 0.49, z);

      const govde = new THREE.Mesh(govdeGeo, lacivertCeket);
      govde.position.set(0, 0.30, 0);
      const bas = new THREE.Mesh(basGeo, ciltMateryal);
      bas.position.set(0, 0.72, 0);

      for (const bZ of [-0.10, 0.10]) {
        const bacak = new THREE.Mesh(bacakGeo, lacivertCeket);
        bacak.position.set(0.20, 0.02, bZ);
        bacak.rotation.z = Math.PI * 0.48;
        hakemGrup.add(bacak);
      }

      const solKol = new THREE.Mesh(kolGeo, beyazGomlek);
      solKol.position.set(0.14, 0.36, -0.22);
      solKol.rotation.z = Math.PI * 0.35;

      const sagKolPivot = new THREE.Group();
      sagKolPivot.position.set(0.06, 0.50, 0.22);
      const sagKolMesh = new THREE.Mesh(kolGeo, beyazGomlek);
      sagKolMesh.position.set(0.16, -0.14, 0);
      sagKolMesh.rotation.z = Math.PI * 0.3;

      const sapMesh = new THREE.Mesh(sapGeometri, metalMateryal);
      sapMesh.position.set(0.28, -0.02, 0);

      const tabelaTuval = document.createElement('canvas');
      tabelaTuval.width = 128;
      tabelaTuval.height = 128;
      const tabelaBaglam = tabelaTuval.getContext('2d');
      if (!tabelaBaglam) {
        throw new Error('Hakem puan tabelası tuval bağlamı oluşturulamadı.');
      }

      const tabelaDoku = new THREE.CanvasTexture(tabelaTuval);
      tabelaDoku.colorSpace = THREE.SRGBColorSpace;
      this.olusturulanDokular.push(tabelaDoku);

      const tabelaMateryal = new THREE.MeshStandardMaterial({
        map: tabelaDoku,
        roughness: 0.32,
      });
      this.olusturulanMateryaller.push(tabelaMateryal);

      const tabelaMesh = new THREE.Mesh(tabelaGeometri, tabelaMateryal);
      tabelaMesh.position.set(0.28, 0.26, 0);

      sagKolPivot.add(sagKolMesh, sapMesh, tabelaMesh);
      hakemGrup.add(govde, bas, solKol, sagKolPivot);
      masaGrubu.add(hakemGrup);

      const kayit: PuanHakemi = {
        sagKol: sagKolPivot,
        tabelaTuval,
        tabelaBaglam,
        tabelaDoku,
      };
      this.hakemTabelaPuanCiz(kayit, h + 1, null);
      this.puanHakemleri.push(kayit);
    }

    this.anaGrup.add(masaGrubu);
  }

  private hakemMasaOrtusuDokusuOlustur(): THREE.CanvasTexture {
    const tuval = document.createElement('canvas');
    tuval.width = 1024;
    tuval.height = 192;
    const baglam = tuval.getContext('2d');
    if (!baglam) {
      throw new Error('Hakem masa örtüsü dokusu oluşturulamadı.');
    }

    baglam.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
    baglam.fillRect(0, 0, 1024, 192);
    baglam.fillStyle = GALATASARAY_RENKLERI.SARI_ANA;
    baglam.fillRect(0, 0, 1024, 18);
    baglam.fillRect(0, 174, 1024, 18);

    baglam.fillStyle = '#ffffff';
    baglam.font = '800 44px Inter, sans-serif';
    baglam.textAlign = 'center';
    baglam.textBaseline = 'middle';
    baglam.fillText('GALATASARAY SK  •  HAKEM KURULU (H1 - H5)', 512, 98);

    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.needsUpdate = true;
    this.olusturulanDokular.push(doku);
    return doku;
  }

  private hakemTabelaPuanCiz(
    hakem: PuanHakemi,
    hakemNo: number,
    puan: number | null,
  ): void {
    const b = hakem.tabelaBaglam;
    b.fillStyle = '#0f172a';
    b.fillRect(0, 0, 128, 128);
    b.strokeStyle = GALATASARAY_RENKLERI.SARI_ANA;
    b.lineWidth = 8;
    b.strokeRect(4, 4, 120, 120);

    b.fillStyle = GALATASARAY_RENKLERI.KIRMIZI_ANA;
    b.fillRect(8, 8, 112, 32);
    b.fillStyle = '#ffffff';
    b.font = '800 20px Inter, sans-serif';
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    b.fillText(`H${hakemNo}`, 64, 24);

    b.fillStyle = puan !== null ? GALATASARAY_RENKLERI.SARI_ALTIN : '#94a3b8';
    b.font = '900 44px monospace';
    b.fillText(puan !== null ? puan.toFixed(1) : 'GS', 64, 82);

    hakem.tabelaDoku.needsUpdate = true;
  }

  /**
   * Sağ güvertede ve çıkış alanında Galatasaray eşofmanlı, elinde taktik panosu ve
   * kronometre tutan 4 adet Yüzücü Antrenörü oluşturur.
   */
  private yuzucuAntrenorleriniOlustur(): void {
    const gsCeket = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      roughness: 0.45,
    });
    const esofmanAlt = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KARBON_ANTRASIT,
      roughness: 0.68,
    });
    const cilt = new THREE.MeshStandardMaterial({ color: 0xdca580, roughness: 0.52 });
    const gsSapka = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_SARI_ANA,
      roughness: 0.42,
    });
    const panoMateryal = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });

    this.olusturulanMateryaller.push(gsCeket, esofmanAlt, cilt, gsSapka, panoMateryal);

    const panoGeometri = new THREE.BoxGeometry(0.24, 0.32, 0.025);
    this.olusturulanGeometriler.push(panoGeometri);

    const konumlar = [
      { x: 9.45, z: -12.5, rotY: -Math.PI * 0.5 },
      { x: 9.45, z: -2.5, rotY: -Math.PI * 0.5 },
      { x: 9.45, z: 7.5, rotY: -Math.PI * 0.5 },
      { x: 5.5, z: -18.2, rotY: 0 },
    ];

    for (let i = 0; i < konumlar.length; i += 1) {
      const k = konumlar[i];
      const fig = this.ayaktaInsanOlustur(gsCeket, esofmanAlt, cilt, gsSapka);
      fig.grup.name = `galatasarayAntrenoru_${i + 1}`;
      fig.grup.position.set(k.x, GUVERTE_UST_Y, k.z);
      fig.grup.rotation.y = k.rotY;

      const taktikPano = new THREE.Mesh(panoGeometri, panoMateryal);
      taktikPano.position.set(0, -0.46, 0.14);
      taktikPano.rotation.x = -Math.PI * 0.32;
      fig.solKol.add(taktikPano);

      this.anaGrup.add(fig.grup);
      this.antrenorler.push({
        grup: fig.grup,
        solKol: fig.solKol,
        sagKol: fig.sagKol,
        baslangicX: k.x,
        baslangicZ: k.z,
        faz: i * 1.6,
      });
    }
  }

  private ayaktaInsanOlustur(
    ustMateryal: THREE.Material,
    altMateryal: THREE.Material,
    ciltMateryal: THREE.Material,
    sapkaMateryal: THREE.Material,
  ): {
    grup: THREE.Group;
    solKol: THREE.Group;
    sagKol: THREE.Group;
    solBacak: THREE.Group;
    sagBacak: THREE.Group;
  } {
    const grup = new THREE.Group();

    const govdeGeo = new THREE.BoxGeometry(0.38, 0.56, 0.22);
    const basGeo = new THREE.SphereGeometry(0.135, 10, 10);
    const sapkaGeo = new THREE.CylinderGeometry(0.14, 0.145, 0.08, 10);
    const uzuvGeo = new THREE.CapsuleGeometry(0.056, 0.42, 4, 6);
    const bacakGeo = new THREE.CapsuleGeometry(0.068, 0.62, 4, 6);
    this.olusturulanGeometriler.push(govdeGeo, basGeo, sapkaGeo, uzuvGeo, bacakGeo);

    const solBacak = new THREE.Group();
    solBacak.position.set(-0.10, 0.78, 0);
    const solBacakMesh = new THREE.Mesh(bacakGeo, altMateryal);
    solBacakMesh.position.set(0, -0.39, 0);
    solBacak.add(solBacakMesh);

    const sagBacak = new THREE.Group();
    sagBacak.position.set(0.10, 0.78, 0);
    const sagBacakMesh = new THREE.Mesh(bacakGeo, altMateryal);
    sagBacakMesh.position.set(0, -0.39, 0);
    sagBacak.add(sagBacakMesh);

    const govde = new THREE.Mesh(govdeGeo, ustMateryal);
    govde.position.set(0, 1.06, 0);

    const bas = new THREE.Mesh(basGeo, ciltMateryal);
    bas.position.set(0, 1.48, 0);

    const sapka = new THREE.Mesh(sapkaGeo, sapkaMateryal);
    sapka.position.set(0, 1.59, 0);

    const solKol = new THREE.Group();
    solKol.position.set(-0.24, 1.28, 0);
    const solKolMesh = new THREE.Mesh(uzuvGeo, ustMateryal);
    solKolMesh.position.set(0, -0.24, 0);
    solKol.add(solKolMesh);

    const sagKol = new THREE.Group();
    sagKol.position.set(0.24, 1.28, 0);
    const sagKolMesh = new THREE.Mesh(uzuvGeo, ustMateryal);
    sagKolMesh.position.set(0, -0.24, 0);
    sagKol.add(sagKolMesh);

    grup.add(solBacak, sagBacak, govde, bas, sapka, solKol, sagKol);
    return { grup, solKol, sagKol, solBacak, sagBacak };
  }

  /**
   * Başhakemin elindeki kornayı yarış başlangıcında yukarı kaldırmasını tetikler.
   */
  public starterDudukCalTetikle(): void {
    this.starterIsaretKalanSure = 1.8;
  }

  /**
   * 5 hakemin elindeki puan tabelalarına yeni puanları yazıp havaya kaldırmasını sağlar.
   */
  public hakemMasasiPuanlariniGoster(puanlar: readonly number[]): void {
    this.hakemPuanGosterimKalanSure = 5.2;
    for (let h = 0; h < this.puanHakemleri.length; h += 1) {
      const puan = typeof puanlar[h] === 'number' ? puanlar[h] : 8.0;
      this.hakemTabelaPuanCiz(this.puanHakemleri[h], h + 1, puan);
    }
  }

  /**
   * Her karede seyircilerin atkı/bayrak sallamasını, yükselen beste notalarını,
   * yürüyen hakemleri, hakem masası tabelalarını ve antrenörleri animasyonlu günceller.
   */
  public guncelle(dt: number, gecenSure: number, coskuSeviyesi = 0.4): void {
    if (this.temizlendiMi) {
      return;
    }

    const sinirliDt = Math.min(Math.max(dt, 0), 0.05);
    const cosku = THREE.MathUtils.clamp(coskuSeviyesi, 0.15, 1.0);

    // 1. Tribün seyircileri (gövde, baş, şapka, kollar, atkılar, bayraklar, notalar)
    for (let i = 0; i < this.taraftarlar.length; i += 1) {
      const t = this.taraftarlar[i];
      const havuzaBakisY = t.tarafIsaret < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const salinimFazi = gecenSure * t.hiz * (0.75 + cosku * 0.55) + t.faz;
      const ziplama = Math.max(0, Math.sin(salinimFazi)) * 0.08 * cosku * t.olcek;

      // Gövde
      this.geciciKonum.set(t.x, t.y + 0.27 * t.olcek + ziplama, t.z);
      this.geciciEuler.set(0, havuzaBakisY, Math.sin(salinimFazi * 0.5) * 0.06);
      this.geciciRotasyon.setFromEuler(this.geciciEuler);
      this.geciciOlcek.setScalar(t.olcek);
      this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
      this.govdeInstanced.setMatrixAt(i, this.geciciMatris);

      // Baş & şapka
      this.geciciKonum.set(t.x, t.y + 0.67 * t.olcek + ziplama, t.z);
      this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
      this.basInstanced.setMatrixAt(i, this.geciciMatris);

      this.geciciKonum.set(t.x, t.y + 0.78 * t.olcek + ziplama, t.z);
      this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
      this.sapkaInstanced.setMatrixAt(i, this.geciciMatris);

      // Kollar & Rol aksesuarı
      const icYon = -t.tarafIsaret;
      if (t.rol === 'atki') {
        const yukariAci = 2.4 + Math.sin(salinimFazi) * 0.24;
        this.geciciEuler.set(0, havuzaBakisY, yukariAci);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.08, t.y + 0.66 * t.olcek + ziplama, t.z - 0.24);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.solKolInstanced.setMatrixAt(i, this.geciciMatris);

        this.geciciEuler.set(0, havuzaBakisY, -yukariAci);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.08, t.y + 0.66 * t.olcek + ziplama, t.z + 0.24);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.sagKolInstanced.setMatrixAt(i, this.geciciMatris);

        // Baş üstünde dönen/dalgalanan GS atkısı
        const atkiYatay = Math.sin(salinimFazi * 1.4) * 0.28;
        this.geciciEuler.set(atkiYatay, havuzaBakisY + Math.cos(salinimFazi) * 0.35, Math.sin(salinimFazi) * 0.22);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.16, t.y + 0.92 * t.olcek + ziplama + Math.sin(salinimFazi) * 0.08, t.z);
        this.geciciOlcek.setScalar(t.olcek);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.atkiInstanced.setMatrixAt(t.altRolIndeks, this.geciciMatris);
      } else if (t.rol === 'bayrak') {
        const sallama = Math.sin(salinimFazi * 1.25) * 0.42;
        this.geciciEuler.set(sallama, havuzaBakisY, 0.3);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.08, t.y + 0.45 * t.olcek + ziplama, t.z - 0.22);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.solKolInstanced.setMatrixAt(i, this.geciciMatris);

        this.geciciEuler.set(sallama, havuzaBakisY, -1.7);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.14, t.y + 0.62 * t.olcek + ziplama, t.z + 0.22);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.sagKolInstanced.setMatrixAt(i, this.geciciMatris);

        // Gönder + Dalgalanan GS bayrağı
        this.geciciEuler.set(sallama * 0.75, havuzaBakisY, 0.12);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.22, t.y + 1.10 * t.olcek + ziplama, t.z + 0.22);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.gonderInstanced.setMatrixAt(t.altRolIndeks, this.geciciMatris);

        this.geciciEuler.set(
          sallama * 0.75,
          havuzaBakisY + Math.sin(salinimFazi * 2.1) * 0.42,
          0.12,
        );
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.22, t.y + 1.38 * t.olcek + ziplama, t.z + 0.22);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.bayrakInstanced.setMatrixAt(t.altRolIndeks, this.geciciMatris);
      } else {
        // Beste söyleyenler: ritmik el kaldırma/alkış
        const tezahuratAci = 2.05 + Math.sin(salinimFazi * 1.6) * 0.48;
        this.geciciEuler.set(0, havuzaBakisY, tezahuratAci);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.10, t.y + 0.56 * t.olcek + ziplama, t.z - 0.22);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.solKolInstanced.setMatrixAt(i, this.geciciMatris);

        this.geciciEuler.set(0, havuzaBakisY, -tezahuratAci);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.10, t.y + 0.56 * t.olcek + ziplama, t.z + 0.22);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.sagKolInstanced.setMatrixAt(i, this.geciciMatris);
      }
    }

    // Beste notaları: kafaların üzerinden yükselip salınan ♪ ♫ ♬
    for (const kayit of this.besteNotalari) {
      const dongu = ((gecenSure * kayit.hiz * (0.75 + cosku * 0.5) + kayit.faz) % 1 + 1) % 1;
      const yukselis = dongu * 1.75;
      const salinimX = Math.sin(dongu * Math.PI * 3 + kayit.faz) * 0.14;
      const salinimZ = Math.cos(dongu * Math.PI * 2 + kayit.faz) * 0.18;
      const notaOlcek = Math.sin(dongu * Math.PI) * (0.75 + cosku * 0.45);

      this.geciciKonum.set(
        kayit.temelX + salinimX,
        kayit.temelY + yukselis,
        kayit.temelZ + salinimZ,
      );
      this.geciciEuler.set(0, dongu * 0.8 + kayit.faz, Math.sin(dongu * 4) * 0.16);
      this.geciciRotasyon.setFromEuler(this.geciciEuler);
      this.geciciOlcek.setScalar(Math.max(0.05, notaOlcek));
      this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);

      const inst = this.notaInstancedListesi[kayit.tipIndeksi];
      if (inst) {
        inst.setMatrixAt(kayit.altIndeks, this.geciciMatris);
      }
    }

    this.govdeInstanced.instanceMatrix.needsUpdate = true;
    this.basInstanced.instanceMatrix.needsUpdate = true;
    this.sapkaInstanced.instanceMatrix.needsUpdate = true;
    this.solKolInstanced.instanceMatrix.needsUpdate = true;
    this.sagKolInstanced.instanceMatrix.needsUpdate = true;
    this.atkiInstanced.instanceMatrix.needsUpdate = true;
    this.gonderInstanced.instanceMatrix.needsUpdate = true;
    this.bayrakInstanced.instanceMatrix.needsUpdate = true;
    for (const inst of this.notaInstancedListesi) {
      inst.instanceMatrix.needsUpdate = true;
    }

    // 2. Starter başhakemi kol animasyonu
    if (this.starterIsaretKalanSure > 0) {
      this.starterIsaretKalanSure = Math.max(0, this.starterIsaretKalanSure - sinirliDt);
      this.starterSagKol.rotation.x = THREE.MathUtils.lerp(
        this.starterSagKol.rotation.x,
        -2.75,
        0.22,
      );
    } else {
      this.starterSagKol.rotation.x = THREE.MathUtils.lerp(
        this.starterSagKol.rotation.x,
        -0.12,
        0.12,
      );
    }

    // 3. Yürüyen havuz kenarı hakemleri
    for (const h of this.yuruyenHakemler) {
      h.konumZ += h.yonZ * h.hiz * sinirliDt;
      if (h.konumZ >= h.makZ) {
        h.konumZ = h.makZ;
        h.yonZ = -1;
      } else if (h.konumZ <= h.minZ) {
        h.konumZ = h.minZ;
        h.yonZ = 1;
      }
      h.adimFazi += sinirliDt * 5.2;
      h.grup.position.set(h.sabitX, GUVERTE_UST_Y, h.konumZ);
      h.grup.rotation.y = h.yonZ > 0 ? 0 : Math.PI;

      const adimAci = Math.sin(h.adimFazi) * 0.42;
      h.solBacak.rotation.x = adimAci;
      h.sagBacak.rotation.x = -adimAci;
      h.solKol.rotation.x = -adimAci * 0.65;
      h.sagKol.rotation.x = adimAci * 0.65;
    }

    // 4. Puan veren hakemler masası tabelalarının havaya kaldırılması
    const hedefTabelaAci = this.hakemPuanGosterimKalanSure > 0 ? 2.55 : 0.25;
    if (this.hakemPuanGosterimKalanSure > 0) {
      this.hakemPuanGosterimKalanSure = Math.max(0, this.hakemPuanGosterimKalanSure - sinirliDt);
    }
    for (const hakem of this.puanHakemleri) {
      hakem.sagKol.rotation.z = THREE.MathUtils.lerp(
        hakem.sagKol.rotation.z,
        hedefTabelaAci,
        0.15,
      );
    }

    // 5. Galatasaray yüzme antrenörleri tempo/taktik animasyonu
    for (const a of this.antrenorler) {
      const hareket = Math.sin(gecenSure * (1.8 + cosku * 2.2) + a.faz);
      a.grup.position.z = a.baslangicZ + hareket * (0.18 * cosku);
      a.sagKol.rotation.x = -0.75 + Math.sin(gecenSure * 5.5 + a.faz) * (0.45 * cosku);
      a.solKol.rotation.x = -0.35 + Math.cos(gecenSure * 3.0 + a.faz) * 0.08;
    }
  }

  /**
   * Tüm kalabalık, hakem ve antrenör GPU kaynaklarını serbest bırakır.
   */
  public temizle(): void {
    if (this.temizlendiMi) {
      return;
    }
    this.temizlendiMi = true;

    this.sahne.remove(this.anaGrup);

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
  }
}

