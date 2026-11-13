import * as THREE from 'three';
import type {
  AltKureVerisi,
  CisimTipi,
  HacimOrnekNoktasi,
  KaynakTemizlenebilir,
  SuDarbesiVerisi,
  SuYuksekligiSorguFonksiyonu,
  YuzmeDurumModu,
} from '../types/simulation';

/**
 * Havuz içindeki tüm yüzen/batan cisimlerin ortak hidrostatik taban sınıfı.
 * Konum, yönelim, hız, hacim örnekleme noktaları ve GPU kaynak temizliğini yönetir.
 */
export abstract class SuCismiTaban implements KaynakTemizlenebilir {
  public readonly kokGrup: THREE.Group;
  public abstract readonly tip: CisimTipi;

  public toplamHacim: number;
  public yogunluk: number;
  public sinirlayiciYaricap: number;
  public hacimNoktalari: HacimOrnekNoktasi[];

  // Fizik durum vektörleri
  public readonly konum: THREE.Vector3;
  public readonly hiz: THREE.Vector3;
  public readonly yonelim: THREE.Quaternion;
  public readonly acisalHiz: THREE.Vector3;
  public tutuluyorMu: boolean;
  public fizikKilitliMi: boolean;
  public batanHacimOrani: number;

  protected constructor(
    toplamHacim: number,
    yogunluk: number,
    sinirlayiciYaricap: number,
    hacimNoktalari: HacimOrnekNoktasi[] = [],
  ) {
    this.kokGrup = new THREE.Group();
    this.toplamHacim = toplamHacim;
    this.yogunluk = yogunluk;
    this.sinirlayiciYaricap = sinirlayiciYaricap;
    this.hacimNoktalari = hacimNoktalari;

    this.konum = new THREE.Vector3(0, 0.05, 0);
    this.hiz = new THREE.Vector3();
    this.yonelim = new THREE.Quaternion();
    this.acisalHiz = new THREE.Vector3();
    this.tutuluyorMu = false;
    this.fizikKilitliMi = false;
    this.batanHacimOrani = 0;
  }

  /**
   * Cismin su ile etkileşimine bağlı eklem animasyonlarını günceller
   * ve su yüzeyine uygulanacak kesit/sıçrama darbelerini döndürür.
   */
  public abstract animasyonuGuncelle(
    dt: number,
    gecenSure: number,
    durumModu: YuzmeDurumModu,
    batanOran: number,
    suYuksekligiSorgula: SuYuksekligiSorguFonksiyonu,
  ): SuDarbesiVerisi[];

  /**
   * Su altı gölge ve kostik kesme hesabı için dünya uzayında alt küreleri döndürür.
   */
  public abstract altKureleriHesapla(): AltKureVerisi[];

  /**
   * Çarpışma ve atalet hesabı için cismin yerel sınırlayıcı kutu boyutlarını (en, boy, derinlik) döndürür.
   */
  public abstract yerelKutuBoyutlariGetir(): THREE.Vector3;

  /**
   * Verilen kütle için cismin yerel (x, y, z) eksenlerindeki yaklaşık atalet momentini hesaplar.
   */
  public yerelAtaletMomentiGetir(kutle: number): THREE.Vector3 {
    const boyut = this.yerelKutuBoyutlariGetir();
    const katsayi = kutle / 12;
    return new THREE.Vector3(
      Math.max(katsayi * (boyut.y * boyut.y + boyut.z * boyut.z), 0.2),
      Math.max(katsayi * (boyut.x * boyut.x + boyut.z * boyut.z), 0.2),
      Math.max(katsayi * (boyut.x * boyut.x + boyut.y * boyut.y), 0.2),
    );
  }

  /**
   * Fizik durumundaki konum ve yönelim bilgisini Three.js sahne grafiğine aktarır.
   */
  public donusumuSenkronizeEt(): void {
    this.kokGrup.position.copy(this.konum);
    this.kokGrup.quaternion.copy(this.yonelim);
    this.kokGrup.updateMatrixWorld(true);
  }

  /**
   * Cismi belirtilen başlangıç konumuna sıfır hız ve nötr yönelimle yerleştirir.
   */
  public konumuSifirla(hedefKonum: THREE.Vector3): void {
    this.konum.copy(hedefKonum);
    this.hiz.set(0, 0, 0);
    this.yonelim.identity();
    this.acisalHiz.set(0, 0, 0);
    this.tutuluyorMu = false;
    this.fizikKilitliMi = false;
    this.batanHacimOrani = 0;
    this.donusumuSenkronizeEt();
  }

  /**
   * Mesh oluşturma ve sahne grubuna ekleme işlemlerini tekilleştiren korunan yardımcı.
   */
  protected meshOlusturVeEkle(
    hedefGrup: THREE.Object3D,
    geometri: THREE.BufferGeometry,
    materyal: THREE.Material,
    konumX = 0,
    konumY = 0,
    konumZ = 0,
    rotasyonX = 0,
    rotasyonY = 0,
    rotasyonZ = 0,
  ): THREE.Mesh {
    const yeniMesh = new THREE.Mesh(geometri, materyal);
    yeniMesh.position.set(konumX, konumY, konumZ);
    yeniMesh.rotation.set(rotasyonX, rotasyonY, rotasyonZ);
    yeniMesh.castShadow = true;
    yeniMesh.receiveShadow = true;
    hedefGrup.add(yeniMesh);
    return yeniMesh;
  }

  /**
   * Kök grup altındaki tüm BufferGeometry ve Material örneklerini güvenli biçimde serbest bırakır.
   */
  public temizle(): void {
    const geometriler = new Set<THREE.BufferGeometry>();
    const materyaller = new Set<THREE.Material>();

    this.kokGrup.traverse((nesne) => {
      if (nesne instanceof THREE.Mesh) {
        if (nesne.geometry) {
          geometriler.add(nesne.geometry);
        }
        if (Array.isArray(nesne.material)) {
          for (const mat of nesne.material) {
            if (mat) {
              materyaller.add(mat);
            }
          }
        } else if (nesne.material) {
          materyaller.add(nesne.material);
        }
      }
    });

    for (const geometri of geometriler) {
      geometri.dispose();
    }
    for (const materyal of materyaller) {
      materyal.dispose();
    }

    this.kokGrup.clear();
  }
}
