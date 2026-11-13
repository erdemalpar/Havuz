import * as THREE from 'three';
import {
  GALATASARAY_RENKLERI,
  type KaynakTemizlenebilir,
} from '../types/simulation';
import {
  AnatomikInsanUretici,
  type AnatomikInsanFiguru,
  type InsanGorunumSecenekleri,
} from './AnatomikInsanUretici';

const GUVERTE_UST_Y = 0.175;

type TaraftarRolu = 'atki' | 'bayrak' | 'beste';
type BaslikKategorisi = 'kisa_sac' | 'topuz_sac' | 'kep' | 'bere';

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
  baslikKategori: BaslikKategorisi;
  baslikAltIndeks: number;
}

interface YuruyenHakem {
  figur: AnatomikInsanFiguru;
  sabitX: number;
  minZ: number;
  makZ: number;
  konumZ: number;
  yonZ: 1 | -1;
  hiz: number;
  adimFazi: number;
  havuzYonIsareti: -1 | 1;
}

interface PuanHakemi {
  figur: AnatomikInsanFiguru;
  faz: number;
  tabelaTuval: HTMLCanvasElement;
  tabelaBaglam: CanvasRenderingContext2D;
  tabelaDoku: THREE.CanvasTexture;
}

interface AntrenorFiguru {
  figur: AnatomikInsanFiguru;
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
 * Tribünlerdeki anatomik seyircileri (atkı sallayanlar, bayrak sallayanlar,
 * kafalarının üzerinde beste notaları yükselenler), havuz kenarı hakemlerini,
 * 5 puan hakemi masasını, Galatasaraylı yüzme antrenörlerini ve cankurtaranı yönetir.
 */
export class ArenaKalabalikVeHakemler implements KaynakTemizlenebilir {
  private readonly sahne: THREE.Scene;
  private readonly anaGrup: THREE.Group;
  private readonly insanUretici: AnatomikInsanUretici;
  private readonly olusturulanGeometriler: THREE.BufferGeometry[] = [];
  private readonly olusturulanMateryaller: THREE.Material[] = [];
  private readonly olusturulanDokular: THREE.Texture[] = [];

  private readonly taraftarlar: TaraftarVerisi[] = [];
  private readonly atkiIndeksleri: number[] = [];
  private readonly bayrakIndeksleri: number[] = [];
  private readonly besteNotalari: BesteNotaKaydi[] = [];

  private readonly kisaSacTaraftarlari: number[] = [];
  private readonly topuzSacTaraftarlari: number[] = [];
  private readonly kepTaraftarlari: number[] = [];
  private readonly bereTaraftarlari: number[] = [];

  private altVucutInstanced!: THREE.InstancedMesh;
  private govdeInstanced!: THREE.InstancedMesh;
  private basInstanced!: THREE.InstancedMesh;
  private kisaSacInstanced!: THREE.InstancedMesh;
  private topuzSacInstanced!: THREE.InstancedMesh;
  private kepInstanced!: THREE.InstancedMesh;
  private bereInstanced!: THREE.InstancedMesh;
  private solKolInstanced!: THREE.InstancedMesh;
  private sagKolInstanced!: THREE.InstancedMesh;
  private atkiInstanced!: THREE.InstancedMesh;
  private gonderInstanced!: THREE.InstancedMesh;
  private bayrakInstanced!: THREE.InstancedMesh;
  private readonly notaInstancedListesi: THREE.InstancedMesh[] = [];

  private readonly yuruyenHakemler: YuruyenHakem[] = [];
  private starterHakem!: AnatomikInsanFiguru;
  private bitisHakem!: AnatomikInsanFiguru;
  private starterIsaretKalanSure = 0;

  private readonly puanHakemleri: PuanHakemi[] = [];
  private hakemPuanGosterimKalanSure = 0;

  private readonly antrenorler: AntrenorFiguru[] = [];
  private cankurtaran!: AnatomikInsanFiguru;

  // Kare başına GC baskısını sıfırlamak için yeniden kullanılan matematik nesneleri
  private readonly geciciMatris = new THREE.Matrix4();
  private readonly geciciKonum = new THREE.Vector3();
  private readonly geciciRotasyon = new THREE.Quaternion();
  private readonly geciciEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly geciciOlcek = new THREE.Vector3(1, 1, 1);

  private temizlendiMi = false;

  constructor(sahne: THREE.Scene) {
    this.sahne = sahne;
    this.anaGrup = new THREE.Group();
    this.anaGrup.name = 'arenaKalabalikVeHakemler';
    this.insanUretici = new AnatomikInsanUretici();

    this.tribunSeyircileriniOlustur();
    this.havuzKenariHakemleriniOlustur();
    this.puanHakemleriMasasiniOlustur();
    this.yuzucuAntrenorleriniOlustur();
    this.cankurtaraniOlustur();

    this.guncelle(0.016, 0, 0.25);
    this.sahne.add(this.anaGrup);
  }

  /**
   * 2 tribünde anatomik vücutlu, çeşitli saç/kep/ten tiplerinde atkılı, bayraklı
   * ve beste söyleyen seyircileri InstancedMesh ile 60 FPS performansında kurar.
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
        // SporKompleksiMimarisi koltuk oturak üstü yüksekliğiyle birebir eşleşme
        const siraY = GUVERTE_UST_Y + (b + 1) * basamakYukseklik + 0.11;
        const siraX = tarafIsaret * (baslangicX + b * basamakDerinlik + 0.54);

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
          const olcek = 0.92 + rastgele * 0.15;

          const taraftarIndeks = this.taraftarlar.length;
          let altRolIndeks = 0;
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
              temelY: siraY + 1.02 * olcek,
              temelZ: z,
              faz: rastgele * Math.PI * 2,
              hiz: 0.58 + rastgele * 0.34,
              tipIndeksi,
              altIndeks: 0,
            });
          }

          // Başlık çeşitliliği: kısa saç (%35), topuz (%25), spor kep (%28), bere (%12)
          const baslikKura = (taraftarIndeks * 7 + b * 3 + k) % 20;
          let baslikKategori: BaslikKategorisi = 'kisa_sac';
          let baslikAltIndeks = 0;
          if (baslikKura < 7) {
            baslikKategori = 'kisa_sac';
            baslikAltIndeks = this.kisaSacTaraftarlari.length;
            this.kisaSacTaraftarlari.push(taraftarIndeks);
          } else if (baslikKura < 12) {
            baslikKategori = 'topuz_sac';
            baslikAltIndeks = this.topuzSacTaraftarlari.length;
            this.topuzSacTaraftarlari.push(taraftarIndeks);
          } else if (baslikKura < 18) {
            baslikKategori = 'kep';
            baslikAltIndeks = this.kepTaraftarlari.length;
            this.kepTaraftarlari.push(taraftarIndeks);
          } else {
            baslikKategori = 'bere';
            baslikAltIndeks = this.bereTaraftarlari.length;
            this.bereTaraftarlari.push(taraftarIndeks);
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
            baslikKategori,
            baslikAltIndeks,
          });
        }
      }
    }

    const toplamTaraftar = this.taraftarlar.length;

    const atkiGeometri = new THREE.BoxGeometry(0.84, 0.14, 0.024);
    const gonderGeometri = new THREE.CylinderGeometry(0.013, 0.016, 1.05, 8);
    const bayrakGeometri = new THREE.PlaneGeometry(0.68, 0.44);
    bayrakGeometri.translate(0.34, 0, 0);
    this.olusturulanGeometriler.push(atkiGeometri, gonderGeometri, bayrakGeometri);

    const kumasMateryal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.04,
    });
    const kafaYuzDokusu = this.insanUretici.tribunOrtakYuzDokusuGetir();
    const yuzMateryal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: kafaYuzDokusu,
      roughness: 0.52,
      metalness: 0.03,
    });
    const sacMateryal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.04,
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
      kumasMateryal,
      yuzMateryal,
      sacMateryal,
      atkiMateryali,
      bayrakMateryali,
      gonderMateryali,
    );

    this.altVucutInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunAltVucutGeometrisiGetir(),
      kumasMateryal,
      toplamTaraftar,
    );
    this.govdeInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunGovdeGeometrisiGetir(),
      kumasMateryal,
      toplamTaraftar,
    );
    this.basInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunKafaGeometrisiGetir(),
      yuzMateryal,
      toplamTaraftar,
    );
    this.kisaSacInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunKisaSacGeometrisiGetir(),
      sacMateryal,
      Math.max(1, this.kisaSacTaraftarlari.length),
    );
    this.topuzSacInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunTopuzSacGeometrisiGetir(),
      sacMateryal,
      Math.max(1, this.topuzSacTaraftarlari.length),
    );
    this.kepInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunKepGeometrisiGetir(),
      kumasMateryal,
      Math.max(1, this.kepTaraftarlari.length),
    );
    this.bereInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunBereGeometrisiGetir(),
      kumasMateryal,
      Math.max(1, this.bereTaraftarlari.length),
    );
    this.solKolInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunKolGeometrisiGetir(),
      kumasMateryal,
      toplamTaraftar,
    );
    this.sagKolInstanced = new THREE.InstancedMesh(
      this.insanUretici.tribunKolGeometrisiGetir(),
      kumasMateryal,
      toplamTaraftar,
    );
    this.atkiInstanced = new THREE.InstancedMesh(
      atkiGeometri,
      atkiMateryali,
      Math.max(1, this.atkiIndeksleri.length),
    );
    this.gonderInstanced = new THREE.InstancedMesh(
      gonderGeometri,
      gonderMateryali,
      Math.max(1, this.bayrakIndeksleri.length),
    );
    this.bayrakInstanced = new THREE.InstancedMesh(
      bayrakGeometri,
      bayrakMateryali,
      Math.max(1, this.bayrakIndeksleri.length),
    );

    this.govdeInstanced.name = 'tribunSeyirciGovdeleri';
    this.atkiInstanced.name = 'tribunSeyirciAtkilari';
    this.bayrakInstanced.name = 'tribunSeyirciBayraklari';

    const ciltPaleti = [0xf4cfb2, 0xe7b68e, 0xd49a72, 0xb87a56, 0xedd5c0];
    const pantolonPaleti = [0x0f172a, 0x1e293b, 0x1e3a5f, 0x334155, 0x111827];
    const formaPaleti = [
      GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
      GALATASARAY_RENKLERI.HEX_SARI_ANA,
      0x7c0324,
      0xf8fafc,
      0x1e293b,
    ];
    const sacPaleti = [0x1c1411, 0x3b2618, 0x6b4426, 0xa87c42, 0x9ca3af];
    const geciciRenk = new THREE.Color();

    for (let i = 0; i < toplamTaraftar; i += 1) {
      const cilt = ciltPaleti[(i * 3) % ciltPaleti.length];
      const pantolon = pantolonPaleti[(i * 2 + 1) % pantolonPaleti.length];
      const forma = formaPaleti[(i * 5 + 1) % formaPaleti.length];
      const t = this.taraftarlar[i];

      geciciRenk.setHex(pantolon);
      this.altVucutInstanced.setColorAt(i, geciciRenk);

      geciciRenk.setHex(forma);
      this.govdeInstanced.setColorAt(i, geciciRenk);
      this.solKolInstanced.setColorAt(i, geciciRenk);
      this.sagKolInstanced.setColorAt(i, geciciRenk);

      geciciRenk.setHex(cilt);
      this.basInstanced.setColorAt(i, geciciRenk);

      const sacRenk = sacPaleti[(i * 7) % sacPaleti.length];
      const sapkaRenk = i % 2 === 0 ? GALATASARAY_RENKLERI.HEX_SARI_ANA : GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA;

      if (t.baslikKategori === 'kisa_sac') {
        geciciRenk.setHex(sacRenk);
        this.kisaSacInstanced.setColorAt(t.baslikAltIndeks, geciciRenk);
      } else if (t.baslikKategori === 'topuz_sac') {
        geciciRenk.setHex(sacRenk);
        this.topuzSacInstanced.setColorAt(t.baslikAltIndeks, geciciRenk);
      } else if (t.baslikKategori === 'kep') {
        geciciRenk.setHex(sapkaRenk);
        this.kepInstanced.setColorAt(t.baslikAltIndeks, geciciRenk);
      } else {
        geciciRenk.setHex(sapkaRenk);
        this.bereInstanced.setColorAt(t.baslikAltIndeks, geciciRenk);
      }
    }

    for (const inst of [
      this.altVucutInstanced,
      this.govdeInstanced,
      this.basInstanced,
      this.kisaSacInstanced,
      this.topuzSacInstanced,
      this.kepInstanced,
      this.bereInstanced,
      this.solKolInstanced,
      this.sagKolInstanced,
    ]) {
      if (inst.instanceColor) {
        inst.instanceColor.needsUpdate = true;
      }
    }

    this.anaGrup.add(
      this.altVucutInstanced,
      this.govdeInstanced,
      this.basInstanced,
      this.kisaSacInstanced,
      this.topuzSacInstanced,
      this.kepInstanced,
      this.bereInstanced,
      this.solKolInstanced,
      this.sagKolInstanced,
      this.atkiInstanced,
      this.gonderInstanced,
      this.bayrakInstanced,
    );

    this.besteNotaInstancedlariniKur();
  }

  private besteNotaInstancedlariniKur(): void {
    const semboller = ['♪', '♫', '♬'] as const;
    const renkler = [GALATASARAY_RENKLERI.SARI_ALTIN, '#ffffff', '#fb7185'] as const;

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
   * Havuz kenarlarında eklemli gerçekçi başhakem (starter), 4 yürüyen kulvar hakemi
   * ve bitiş hakemini oluşturur.
   */
  private havuzKenariHakemleriniOlustur(): void {
    const kornaMateryal = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_KIRMIZI_VURGU,
      roughness: 0.35,
      metalness: 0.35,
    });
    const panoMateryal = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.2,
    });
    const kagitMateryal = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.65,
    });
    this.olusturulanMateryaller.push(kornaMateryal, panoMateryal, kagitMateryal);

    const kornaGeometri = new THREE.CylinderGeometry(0.024, 0.044, 0.22, 12);
    const kronometrePanoGeo = new THREE.BoxGeometry(0.20, 0.26, 0.016);
    const kagitGeo = new THREE.BoxGeometry(0.17, 0.22, 0.004);
    this.olusturulanGeometriler.push(kornaGeometri, kronometrePanoGeo, kagitGeo);

    // 1. Çıkış Başhakemi (Starter) - kır saçlı ve kep takmış deneyimli başhakem
    this.starterHakem = this.insanUretici.ayaktaInsanOlustur({
      ciltRengi: 0xdfb28c,
      sacRengi: 0x94a3b8,
      ustAnaRenk: 0xf8fafc,
      ustIkinciRenk: 0xf8fafc,
      pantolonRengi: 0x0f172a,
      ayakkabiRengi: 0xe2e8f0,
      sakalTipi: 'biyik',
      sacTipi: 'kep',
      kiyafetTipi: 'hakem_polo',
      kisaKolMu: true,
      olcek: 1.03,
    });
    this.starterHakem.grup.name = 'havuzBasHakemi';
    this.starterHakem.grup.position.set(-9.15, GUVERTE_UST_Y, -16.15);
    this.starterHakem.grup.rotation.y = Math.PI * 0.45;
    this.starterHakem.sagDirsek.rotation.x = -0.35;

    const kornaMesh = new THREE.Mesh(kornaGeometri, kornaMateryal);
    kornaMesh.position.set(0, 0.02, 0.09);
    kornaMesh.rotation.x = Math.PI * 0.48;
    this.starterHakem.sagElNoktasi.add(kornaMesh);
    this.anaGrup.add(this.starterHakem.grup);

    // 2. 4 Yürüyen Kulvar / Stil Hakemi (farklı yüz, saç/kep profilleriyle)
    const yuruyusTanimlari = [
      { x: -8.95, minZ: -13.0, makZ: -1.5, z: -9.0, yon: 1 as const, havuzYon: 1 as const },
      { x: -8.95, minZ: 1.5, makZ: 13.0, z: 6.0, yon: -1 as const, havuzYon: 1 as const },
      { x: 8.95, minZ: -13.0, makZ: -1.5, z: -4.0, yon: -1 as const, havuzYon: -1 as const },
      { x: 8.95, minZ: 1.5, makZ: 13.0, z: 9.0, yon: 1 as const, havuzYon: -1 as const },
    ];
    const hakemProfilleri: InsanGorunumSecenekleri[] = [
      { ciltRengi: 0xe8bc96, sacRengi: 0x2c1b12, sacTipi: 'topuz', sakalTipi: 'yok', olcek: 0.96 },
      { ciltRengi: 0xd9a178, sacRengi: 0x4b3222, sacTipi: 'kep', sakalTipi: 'kirli', olcek: 1.01 },
      { ciltRengi: 0xf1ccb0, sacRengi: 0x8a5b32, sacTipi: 'topuz', sakalTipi: 'yok', olcek: 0.95 },
      { ciltRengi: 0xc58962, sacRengi: 0x1a1412, sacTipi: 'kisa', sakalTipi: 'yok', olcek: 1.0 },
    ];

    for (let i = 0; i < yuruyusTanimlari.length; i += 1) {
      const tanim = yuruyusTanimlari[i];
      const profil = hakemProfilleri[i];
      const figur = this.insanUretici.ayaktaInsanOlustur({
        ...profil,
        ustAnaRenk: 0xf8fafc,
        ustIkinciRenk: i % 2 === 0 ? 0xf8fafc : 0x0f172a,
        pantolonRengi: 0x0f172a,
        ayakkabiRengi: 0xf8fafc,
        kiyafetTipi: 'hakem_polo',
        kisaKolMu: true,
      });
      figur.grup.name = `havuzKenarHakemi_${i + 1}`;
      figur.grup.position.set(tanim.x, GUVERTE_UST_Y, tanim.z);
      this.anaGrup.add(figur.grup);

      this.yuruyenHakemler.push({
        figur,
        sabitX: tanim.x,
        minZ: tanim.minZ,
        makZ: tanim.makZ,
        konumZ: tanim.z,
        yonZ: tanim.yon,
        hiz: 1.05 + i * 0.12,
        adimFazi: i * 1.4,
        havuzYonIsareti: tanim.havuzYon,
      });
    }

    // 3. Bitiş / Dönüş hakemi (+Z ucunda, elinde not panosu ile)
    this.bitisHakem = this.insanUretici.ayaktaInsanOlustur({
      ciltRengi: 0xe3b18a,
      sacRengi: 0x2f1f16,
      ustAnaRenk: 0xf8fafc,
      ustIkinciRenk: 0x0f172a,
      pantolonRengi: 0x0f172a,
      ayakkabiRengi: 0xe2e8f0,
      sakalTipi: 'yok',
      sacTipi: 'kisa',
      kiyafetTipi: 'hakem_polo',
      kisaKolMu: true,
      olcek: 0.99,
    });
    this.bitisHakem.grup.name = 'havuzBitisHakemi';
    this.bitisHakem.grup.position.set(-4.6, GUVERTE_UST_Y, 16.95);
    this.bitisHakem.grup.rotation.y = Math.PI;
    this.bitisHakem.solOmuz.rotation.x = -0.36;
    this.bitisHakem.solDirsek.rotation.x = -0.82;

    const bitisPano = new THREE.Mesh(kronometrePanoGeo, panoMateryal);
    const bitisKagit = new THREE.Mesh(kagitGeo, kagitMateryal);
    bitisKagit.position.z = 0.01;
    bitisPano.add(bitisKagit);
    bitisPano.position.set(0, 0.02, 0.08);
    bitisPano.rotation.x = -0.35;
    this.bitisHakem.solElNoktasi.add(bitisPano);

    this.anaGrup.add(this.bitisHakem.grup);
  }

  /**
   * Sol güvertede (X = -10.9, Z = 10.5) 10m tramplen iniş bölgesini gören
   * örtülü Puan Veren Hakemler Masası ve 5 gerçekçi oturan puan hakemini oluşturur.
   */
  private puanHakemleriMasasiniOlustur(): void {
    const masaGrubu = new THREE.Group();
    masaGrubu.name = 'puanVerenHakemlerMasasi';
    masaGrubu.position.set(-10.9, GUVERTE_UST_Y, 10.5);

    const masaUstMateryal = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45 });
    const ortuDokusu = this.hakemMasaOrtusuDokusuOlustur();
    const ortuMateryal = new THREE.MeshStandardMaterial({ map: ortuDokusu, roughness: 0.55 });
    const metalMateryal = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 });
    const sandalyeMateryal = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.58 });

    this.olusturulanMateryaller.push(
      masaUstMateryal,
      ortuMateryal,
      metalMateryal,
      sandalyeMateryal,
    );

    const tablaGeometri = new THREE.BoxGeometry(0.92, 0.06, 5.4);
    const ortuOnGeometri = new THREE.BoxGeometry(0.04, 0.76, 5.36);
    const ayakGeometri = new THREE.CylinderGeometry(0.025, 0.025, 0.76, 8);
    const sandalyeOturakGeo = new THREE.BoxGeometry(0.44, 0.055, 0.44);
    const sandalyeSirtGeo = new THREE.BoxGeometry(0.055, 0.48, 0.44);
    const sandalyeAyakGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.46, 6);
    const sapGeometri = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8);
    // Geniş yüzey (+Z / -Z) yerel okuma ekseninde -> kol havaya kalkınca (+X) havuza düz okunur
    const tabelaGeometri = new THREE.BoxGeometry(0.44, 0.32, 0.035);

    this.olusturulanGeometriler.push(
      tablaGeometri,
      ortuOnGeometri,
      ayakGeometri,
      sandalyeOturakGeo,
      sandalyeSirtGeo,
      sandalyeAyakGeo,
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

    const hakemProfilleri: InsanGorunumSecenekleri[] = [
      { ciltRengi: 0xdfb18a, sacRengi: 0x1e1612, sacTipi: 'kisa', sakalTipi: 'kirli' },
      { ciltRengi: 0xf1cbae, sacRengi: 0x4c2d1b, sacTipi: 'topuz', sakalTipi: 'yok' },
      { ciltRengi: 0xd49d74, sacRengi: 0x94a3b8, sacTipi: 'kisa', sakalTipi: 'biyik' },
      { ciltRengi: 0xebc29f, sacRengi: 0x6f4b2c, sacTipi: 'topuz', sakalTipi: 'yok' },
      { ciltRengi: 0xc88d65, sacRengi: 0x261a14, sacTipi: 'kisa', sakalTipi: 'yok' },
    ];

    for (let h = 0; h < 5; h += 1) {
      const z = -2.0 + h * 1.0;

      const oturak = new THREE.Mesh(sandalyeOturakGeo, sandalyeMateryal);
      oturak.position.set(-0.66, 0.46, z);
      const sirt = new THREE.Mesh(sandalyeSirtGeo, sandalyeMateryal);
      sirt.position.set(-0.86, 0.70, z);
      masaGrubu.add(oturak, sirt);

      for (const [sx, sz] of [
        [-0.84, z - 0.18],
        [-0.84, z + 0.18],
        [-0.48, z - 0.18],
        [-0.48, z + 0.18],
      ] as const) {
        const sAyak = new THREE.Mesh(sandalyeAyakGeo, metalMateryal);
        sAyak.position.set(sx, 0.23, sz);
        masaGrubu.add(sAyak);
      }

      const profil = hakemProfilleri[h];
      const figur = this.insanUretici.oturanInsanOlustur({
        ...profil,
        ustAnaRenk: 0x0f172a,
        ustIkinciRenk: GALATASARAY_RENKLERI.HEX_SARI_ANA,
        pantolonRengi: 0x0f172a,
        ayakkabiRengi: 0x111827,
        kiyafetTipi: 'hakem_ceket',
        kisaKolMu: false,
        olcek: 0.98,
      });
      figur.grup.name = `puanHakemi_${h + 1}`;
      // Sandalyeye oturup +X (masa ve havuz) yönüne bakacak biçimde hizala
      figur.grup.position.set(-0.66, 0.485, z);
      figur.grup.rotation.y = Math.PI * 0.5;

      // Sol el masanın üzerinde durur
      figur.solOmuz.rotation.x = -0.52;
      figur.solDirsek.rotation.x = -0.68;

      // Sağ el puan tabelasını tutar
      figur.sagOmuz.rotation.x = -0.45;
      figur.sagDirsek.rotation.x = -0.65;

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

      const tabelaTutucu = new THREE.Group();
      tabelaTutucu.position.set(0, 0.02, 0.02);
      // Kol yukarı kalktığında tabelanın tam dik durması için el bileği telafisi
      tabelaTutucu.rotation.x = 2.55;

      const sapMesh = new THREE.Mesh(sapGeometri, metalMateryal);
      sapMesh.position.set(0, 0.14, 0);
      const tabelaMesh = new THREE.Mesh(tabelaGeometri, tabelaMateryal);
      tabelaMesh.position.set(0, 0.36, 0);

      tabelaTutucu.add(sapMesh, tabelaMesh);
      figur.sagElNoktasi.add(tabelaTutucu);
      masaGrubu.add(figur.grup);

      const kayit: PuanHakemi = {
        figur,
        faz: h * 0.9,
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
   * kronometre tutan 4 adet gerçekçi Yüzücü Antrenörü oluşturur.
   */
  private yuzucuAntrenorleriniOlustur(): void {
    const panoMateryal = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35 });
    const kagitMateryal = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });
    const kronometreMat = new THREE.MeshStandardMaterial({
      color: GALATASARAY_RENKLERI.HEX_SARI_ANA,
      roughness: 0.3,
      metalness: 0.5,
    });
    this.olusturulanMateryaller.push(panoMateryal, kagitMateryal, kronometreMat);

    const panoGeometri = new THREE.BoxGeometry(0.24, 0.32, 0.018);
    const panoSayfaGeo = new THREE.BoxGeometry(0.20, 0.27, 0.004);
    const kronometreGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.015, 12);
    kronometreGeo.rotateX(Math.PI * 0.5);
    this.olusturulanGeometriler.push(panoGeometri, panoSayfaGeo, kronometreGeo);

    // 2. antrenör cankurtaran kulesi (9.35, -2.5) ile çakışmaması için Z = -6.2'ye alındı
    const konumlar = [
      { x: 9.45, z: -12.5, rotY: -Math.PI * 0.5 },
      { x: 9.45, z: -6.2, rotY: -Math.PI * 0.5 },
      { x: 9.45, z: 7.5, rotY: -Math.PI * 0.5 },
      { x: 5.5, z: -18.2, rotY: 0 },
    ];
    const antrenorProfilleri: InsanGorunumSecenekleri[] = [
      { ciltRengi: 0xdca580, sacRengi: 0x261812, sacTipi: 'kep', sakalTipi: 'kirli', olcek: 1.03 },
      { ciltRengi: 0xe6ba95, sacRengi: 0x4b301d, sacTipi: 'topuz', sakalTipi: 'yok', olcek: 0.97 },
      { ciltRengi: 0xc78d66, sacRengi: 0x1a1412, sacTipi: 'kisa', sakalTipi: 'biyik', olcek: 1.01 },
      { ciltRengi: 0xd9a27b, sacRengi: 0x6c4c2f, sacTipi: 'kep', sakalTipi: 'kirli', olcek: 1.0 },
    ];

    for (let i = 0; i < konumlar.length; i += 1) {
      const k = konumlar[i];
      const profil = antrenorProfilleri[i];
      const figur = this.insanUretici.ayaktaInsanOlustur({
        ...profil,
        ustAnaRenk: GALATASARAY_RENKLERI.HEX_KIRMIZI_ANA,
        ustIkinciRenk: GALATASARAY_RENKLERI.HEX_SARI_ANA,
        pantolonRengi: GALATASARAY_RENKLERI.HEX_KARBON_ANTRASIT,
        ayakkabiRengi: 0xf8fafc,
        kiyafetTipi: 'gs_esofman',
        kisaKolMu: false,
      });
      figur.grup.name = `galatasarayAntrenoru_${i + 1}`;
      figur.grup.position.set(k.x, GUVERTE_UST_Y, k.z);
      figur.grup.rotation.y = k.rotY;

      figur.solOmuz.rotation.x = -0.35;
      figur.solDirsek.rotation.x = -0.88;

      const taktikPano = new THREE.Mesh(panoGeometri, panoMateryal);
      const kagit = new THREE.Mesh(panoSayfaGeo, kagitMateryal);
      kagit.position.z = 0.011;
      taktikPano.add(kagit);
      taktikPano.position.set(0, 0.02, 0.08);
      taktikPano.rotation.x = -0.38;
      figur.solElNoktasi.add(taktikPano);

      const kronometre = new THREE.Mesh(kronometreGeo, kronometreMat);
      kronometre.position.set(0, 0.02, 0.03);
      figur.sagElNoktasi.add(kronometre);

      this.anaGrup.add(figur.grup);
      this.antrenorler.push({
        figur,
        baslangicX: k.x,
        baslangicZ: k.z,
        faz: i * 1.6,
      });
    }
  }

  /**
   * Sağ güvertedeki cankurtaran kulesi koltuğuna (9.39, GUVERTE_UST_Y + 1.59, -2.5)
   * güneş gözlüklü, kepli ve havuzu tarayan gerçekçi bir cankurtaran yerleştirir.
   */
  private cankurtaraniOlustur(): void {
    this.cankurtaran = this.insanUretici.oturanInsanOlustur({
      ciltRengi: 0xd99e74,
      sacRengi: 0x3b2618,
      ustAnaRenk: GALATASARAY_RENKLERI.HEX_KIRMIZI_VURGU,
      ustIkinciRenk: GALATASARAY_RENKLERI.HEX_SARI_ANA,
      pantolonRengi: GALATASARAY_RENKLERI.HEX_SARI_ANA,
      ayakkabiRengi: 0xf8fafc,
      sakalTipi: 'yok',
      sacTipi: 'kep',
      gunesGozluguMu: true,
      kiyafetTipi: 'cankurtaran',
      kisaKolMu: true,
      olcek: 1.0,
    });
    this.cankurtaran.grup.name = 'havuzCankurtarani';
    // Koltuk oturak üstü = GUVERTE_UST_Y + 1.56 + 0.03 = 1.765; havuza (-X) bakar
    this.cankurtaran.grup.position.set(9.39, GUVERTE_UST_Y + 1.59, -2.5);
    this.cankurtaran.grup.rotation.y = -Math.PI * 0.5;

    this.cankurtaran.solOmuz.rotation.x = -0.35;
    this.cankurtaran.solDirsek.rotation.x = -0.62;
    this.cankurtaran.sagOmuz.rotation.x = -0.40;
    this.cankurtaran.sagDirsek.rotation.x = -0.78;

    this.anaGrup.add(this.cankurtaran.grup);
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
   * Her karede seyircileri, atkıları, bayrakları, beste notalarını, yürüyen hakemleri,
   * puan hakemlerini, antrenörleri ve cankurtaranı animasyonlu günceller.
   */
  public guncelle(dt: number, gecenSure: number, coskuSeviyesi = 0.4): void {
    if (this.temizlendiMi) {
      return;
    }

    const sinirliDt = Math.min(Math.max(dt, 0), 0.05);
    const cosku = THREE.MathUtils.clamp(coskuSeviyesi, 0.15, 1.0);

    // 1. Tribün seyircileri (alt vücut, anatomik gövde, baş, saç/kep/bere, kollar, aksesuarlar)
    for (let i = 0; i < this.taraftarlar.length; i += 1) {
      const t = this.taraftarlar[i];
      const havuzaBakisY = t.tarafIsaret < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const cosY = Math.cos(havuzaBakisY);
      const sinY = Math.sin(havuzaBakisY);
      const salinimFazi = gecenSure * t.hiz * (0.75 + cosku * 0.55) + t.faz;
      const ziplama = Math.max(0, Math.sin(salinimFazi)) * 0.07 * cosku * t.olcek;
      const yanSalinim = Math.sin(salinimFazi * 0.5) * 0.055;

      // Alt vücut & ayakkabılar basamak koltuğuna oturur
      this.geciciKonum.set(t.x, t.y + ziplama * 0.20, t.z);
      this.geciciEuler.set(0, havuzaBakisY, 0);
      this.geciciRotasyon.setFromEuler(this.geciciEuler);
      this.geciciOlcek.setScalar(t.olcek);
      this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
      this.altVucutInstanced.setMatrixAt(i, this.geciciMatris);

      // Anatomik üst gövde (pelvis üstünden omuza)
      this.geciciKonum.set(t.x, t.y + 0.05 * t.olcek + ziplama, t.z);
      this.geciciEuler.set(0.05 * Math.sin(salinimFazi), havuzaBakisY, yanSalinim);
      this.geciciRotasyon.setFromEuler(this.geciciEuler);
      this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
      this.govdeInstanced.setMatrixAt(i, this.geciciMatris);

      // Baş ve saç/kep/bere aynı kafa merkezine hizalıdır
      this.geciciKonum.set(t.x, t.y + 0.72 * t.olcek + ziplama, t.z);
      this.geciciEuler.set(Math.sin(salinimFazi * 0.7) * 0.07, havuzaBakisY, yanSalinim * 0.8);
      this.geciciRotasyon.setFromEuler(this.geciciEuler);
      this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
      this.basInstanced.setMatrixAt(i, this.geciciMatris);

      if (t.baslikKategori === 'kisa_sac') {
        this.kisaSacInstanced.setMatrixAt(t.baslikAltIndeks, this.geciciMatris);
      } else if (t.baslikKategori === 'topuz_sac') {
        this.topuzSacInstanced.setMatrixAt(t.baslikAltIndeks, this.geciciMatris);
      } else if (t.baslikKategori === 'kep') {
        this.kepInstanced.setMatrixAt(t.baslikAltIndeks, this.geciciMatris);
      } else {
        this.bereInstanced.setMatrixAt(t.baslikAltIndeks, this.geciciMatris);
      }

      // Sol (-0.215) ve sağ (+0.215) omuz dünya konumları (YXZ rotasyon ile tam eklem hareketi)
      const omuzY = t.y + 0.49 * t.olcek + ziplama;
      const solOmuzX = t.x + (-0.215 * t.olcek) * cosY;
      const solOmuzZ = t.z - (-0.215 * t.olcek) * sinY;
      const sagOmuzX = t.x + (0.215 * t.olcek) * cosY;
      const sagOmuzZ = t.z - (0.215 * t.olcek) * sinY;
      const icYon = -t.tarafIsaret;

      if (t.rol === 'atki') {
        const yukariX = -2.35 + Math.sin(salinimFazi) * 0.22;
        this.geciciEuler.set(yukariX, havuzaBakisY, 0.28);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(solOmuzX, omuzY, solOmuzZ);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.solKolInstanced.setMatrixAt(i, this.geciciMatris);

        this.geciciEuler.set(yukariX, havuzaBakisY, -0.28);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(sagOmuzX, omuzY, sagOmuzZ);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.sagKolInstanced.setMatrixAt(i, this.geciciMatris);

        // Baş üstünde tutulan GS atkısı
        const atkiYatay = Math.sin(salinimFazi * 1.4) * 0.24;
        this.geciciEuler.set(atkiYatay, havuzaBakisY + Math.cos(salinimFazi) * 0.25, Math.sin(salinimFazi) * 0.20);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(
          t.x + icYon * 0.24 * t.olcek,
          t.y + 0.90 * t.olcek + ziplama + Math.sin(salinimFazi) * 0.08,
          t.z,
        );
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.atkiInstanced.setMatrixAt(t.altRolIndeks, this.geciciMatris);
      } else if (t.rol === 'bayrak') {
        const sallama = Math.sin(salinimFazi * 1.25) * 0.36;
        // Sol kol rahat tezahürat, sağ kol bayrak sapını tutar
        this.geciciEuler.set(-0.65 + sallama * 0.3, havuzaBakisY, 0.14);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(solOmuzX, omuzY, solOmuzZ);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.solKolInstanced.setMatrixAt(i, this.geciciMatris);

        this.geciciEuler.set(-1.92 + sallama * 0.65, havuzaBakisY, -0.15);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(sagOmuzX, omuzY, sagOmuzZ);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.sagKolInstanced.setMatrixAt(i, this.geciciMatris);

        // Gönder + Dalgalanan GS bayrağı sağ el ucunda
        this.geciciEuler.set(sallama * 0.65, havuzaBakisY, 0.10);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.32 * t.olcek, t.y + 1.08 * t.olcek + ziplama, t.z + (t.tarafIsaret < 0 ? -0.22 : 0.22));
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.gonderInstanced.setMatrixAt(t.altRolIndeks, this.geciciMatris);

        this.geciciEuler.set(
          sallama * 0.65,
          havuzaBakisY + Math.sin(salinimFazi * 2.1) * 0.38,
          0.10,
        );
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(t.x + icYon * 0.32 * t.olcek, t.y + 1.36 * t.olcek + ziplama, t.z + (t.tarafIsaret < 0 ? -0.22 : 0.22));
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.bayrakInstanced.setMatrixAt(t.altRolIndeks, this.geciciMatris);
      } else {
        // Beste söyleyenler: ritmik kol kaldırma/alkış
        const tezahuratX = -2.05 + Math.sin(salinimFazi * 1.6) * 0.42;
        this.geciciEuler.set(tezahuratX, havuzaBakisY, 0.22);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(solOmuzX, omuzY, solOmuzZ);
        this.geciciMatris.compose(this.geciciKonum, this.geciciRotasyon, this.geciciOlcek);
        this.solKolInstanced.setMatrixAt(i, this.geciciMatris);

        this.geciciEuler.set(tezahuratX, havuzaBakisY, -0.22);
        this.geciciRotasyon.setFromEuler(this.geciciEuler);
        this.geciciKonum.set(sagOmuzX, omuzY, sagOmuzZ);
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

    this.altVucutInstanced.instanceMatrix.needsUpdate = true;
    this.govdeInstanced.instanceMatrix.needsUpdate = true;
    this.basInstanced.instanceMatrix.needsUpdate = true;
    this.kisaSacInstanced.instanceMatrix.needsUpdate = true;
    this.topuzSacInstanced.instanceMatrix.needsUpdate = true;
    this.kepInstanced.instanceMatrix.needsUpdate = true;
    this.bereInstanced.instanceMatrix.needsUpdate = true;
    this.solKolInstanced.instanceMatrix.needsUpdate = true;
    this.sagKolInstanced.instanceMatrix.needsUpdate = true;
    this.atkiInstanced.instanceMatrix.needsUpdate = true;
    this.gonderInstanced.instanceMatrix.needsUpdate = true;
    this.bayrakInstanced.instanceMatrix.needsUpdate = true;
    for (const inst of this.notaInstancedListesi) {
      inst.instanceMatrix.needsUpdate = true;
    }

    // 2. Starter başhakemi & bitiş hakemi animasyonları
    if (this.starterIsaretKalanSure > 0) {
      this.starterIsaretKalanSure = Math.max(0, this.starterIsaretKalanSure - sinirliDt);
      this.starterHakem.sagOmuz.rotation.x = THREE.MathUtils.lerp(
        this.starterHakem.sagOmuz.rotation.x,
        -2.25,
        0.22,
      );
      this.starterHakem.sagDirsek.rotation.x = THREE.MathUtils.lerp(
        this.starterHakem.sagDirsek.rotation.x,
        -0.55,
        0.22,
      );
    } else {
      this.starterHakem.sagOmuz.rotation.x = THREE.MathUtils.lerp(
        this.starterHakem.sagOmuz.rotation.x,
        -0.14,
        0.12,
      );
      this.starterHakem.sagDirsek.rotation.x = THREE.MathUtils.lerp(
        this.starterHakem.sagDirsek.rotation.x,
        -0.28,
        0.12,
      );
    }
    this.starterHakem.boyunPivoti.rotation.y = Math.sin(gecenSure * 0.9) * 0.14;
    this.bitisHakem.boyunPivoti.rotation.y = Math.cos(gecenSure * 0.85) * 0.18;

    // 3. Yürüyen havuz kenarı hakemleri (kalça-diz-dirsek gerçekçi yürüyüş döngüsü)
    for (const h of this.yuruyenHakemler) {
      h.konumZ += h.yonZ * h.hiz * sinirliDt;
      if (h.konumZ >= h.makZ) {
        h.konumZ = h.makZ;
        h.yonZ = -1;
      } else if (h.konumZ <= h.minZ) {
        h.konumZ = h.minZ;
        h.yonZ = 1;
      }
      h.adimFazi += sinirliDt * 5.4;

      const yuruyusSekmesi = Math.abs(Math.cos(h.adimFazi)) * 0.016;
      h.figur.grup.position.set(h.sabitX, GUVERTE_UST_Y + yuruyusSekmesi, h.konumZ);
      h.figur.grup.rotation.y = h.yonZ > 0 ? 0 : Math.PI;

      // Yürürken başını havuz kulvarlarına doğru çevirir
      h.figur.boyunPivoti.rotation.y = h.yonZ * h.havuzYonIsareti * 0.38;

      const solSalinim = Math.sin(h.adimFazi);
      h.figur.solKalca.rotation.x = solSalinim * 0.38;
      h.figur.sagKalca.rotation.x = -solSalinim * 0.38;

      // Diz sadece geriye doğru doğal biçimde bükülür (+X rotasyon = ayak arkaya kıvrılır)
      h.figur.solDiz.rotation.x = Math.max(0, -Math.cos(h.adimFazi)) * 0.56 + 0.05;
      h.figur.sagDiz.rotation.x = Math.max(0, Math.cos(h.adimFazi)) * 0.56 + 0.05;

      h.figur.solOmuz.rotation.x = -solSalinim * 0.28;
      h.figur.sagOmuz.rotation.x = solSalinim * 0.28;
      h.figur.solDirsek.rotation.x = -0.22 - Math.max(0, solSalinim) * 0.22;
      h.figur.sagDirsek.rotation.x = -0.22 - Math.max(0, -solSalinim) * 0.22;
    }

    // 4. Puan veren hakemler masası tabelalarının omuz + dirsek eklemli kaldırılması
    const puanGosteriliyorMu = this.hakemPuanGosterimKalanSure > 0;
    const hedefOmuzX = puanGosteriliyorMu ? -2.20 : -0.45;
    const hedefDirsekX = puanGosteriliyorMu ? -0.35 : -0.65;
    if (puanGosteriliyorMu) {
      this.hakemPuanGosterimKalanSure = Math.max(0, this.hakemPuanGosterimKalanSure - sinirliDt);
    }
    for (const hakem of this.puanHakemleri) {
      hakem.figur.sagOmuz.rotation.x = THREE.MathUtils.lerp(
        hakem.figur.sagOmuz.rotation.x,
        hedefOmuzX,
        0.14,
      );
      hakem.figur.sagDirsek.rotation.x = THREE.MathUtils.lerp(
        hakem.figur.sagDirsek.rotation.x,
        hedefDirsekX,
        0.14,
      );
      hakem.figur.boyunPivoti.rotation.y = Math.sin(gecenSure * 0.8 + hakem.faz) * 0.14;
    }

    // 5. Galatasaray yüzme antrenörleri tempo/kronometre/taktik animasyonu
    for (const a of this.antrenorler) {
      const hareket = Math.sin(gecenSure * (1.8 + cosku * 2.2) + a.faz);
      a.figur.grup.position.z = a.baslangicZ + hareket * (0.16 * cosku);
      a.figur.sagOmuz.rotation.x = -0.72 + Math.sin(gecenSure * 5.2 + a.faz) * (0.38 * cosku);
      a.figur.sagDirsek.rotation.x = -0.42 - Math.abs(Math.sin(gecenSure * 5.2 + a.faz)) * 0.22;
      a.figur.solDirsek.rotation.x = -0.88 + Math.cos(gecenSure * 3.0 + a.faz) * 0.06;
      a.figur.boyunPivoti.rotation.y = Math.sin(gecenSure * 1.4 + a.faz) * 0.20;
    }

    // 6. Cankurtaran havuzu sağa-sola tarama hareketi
    this.cankurtaran.boyunPivoti.rotation.y = Math.sin(gecenSure * 0.55) * 0.42;
    this.cankurtaran.boyunPivoti.rotation.x = 0.12;
  }

  /**
   * Tüm kalabalık, hakem, antrenör ve cankurtaran GPU kaynaklarını serbest bırakır.
   */
  public temizle(): void {
    if (this.temizlendiMi) {
      return;
    }
    this.temizlendiMi = true;

    this.sahne.remove(this.anaGrup);
    this.insanUretici.temizle();

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
