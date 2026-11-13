import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  dunyaXZdenUVye,
  HAVUZ_SABITLERI,
  type KaynakTemizlenebilir,
} from '../types/simulation';
import type { CisimYoneticisi } from '../entities/CisimYoneticisi';
import type { SuCismiTaban } from '../entities/SuCismiTaban';

export type SuDarbeGeriCagrisi = (
  uvX: number,
  uvZ: number,
  yaricap: number,
  kuvvet: number,
) => void;

interface SuTiklamaKaydi {
  pointerId: number;
  clientX: number;
  clientY: number;
  dunyaX: number;
  dunyaZ: number;
}

/**
 * Raycaster ile sahnedeki aktif cismi tutma/taşıma/fırlatma ve
 * su yüzeyi üzerinde tıklama/hover dalga etkileşimlerini yönetir.
 */
export class FareEtkilesimYoneticisi implements KaynakTemizlenebilir {
  private readonly kamera: THREE.PerspectiveCamera;
  private readonly domElemani: HTMLElement;
  private readonly orbitKontrolleri: OrbitControls;
  private readonly cisimYoneticisi: CisimYoneticisi;
  private readonly darbeGeriCagrisi: SuDarbeGeriCagrisi;

  private readonly raycaster = new THREE.Raycaster();
  private readonly isaretciNdc = new THREE.Vector2();
  private readonly suDuzlemi = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly suruklemeDuzlemi = new THREE.Plane();

  private readonly tutmaOfseti = new THREE.Vector3();
  private readonly geciciKesisim = new THREE.Vector3();
  private readonly geciciHedefKonum = new THREE.Vector3();
  private readonly geciciAnlikHiz = new THREE.Vector3();
  private readonly hesaplananAtisHizi = new THREE.Vector3();
  private readonly geciciKameraYonu = new THREE.Vector3();
  private readonly oncekiHoverNoktasi = new THREE.Vector3();

  private tutuluyor = false;
  private suruklenenCisim: SuCismiTaban | null = null;
  private aktifPointerId: number | null = null;
  private sonSuruklemeZamani = 0;
  private oncekiHoverNoktasiVarMi = false;
  private suTiklamaBaslangici: SuTiklamaKaydi | null = null;

  private readonly isaretciBasildiDinleyici: (olay: PointerEvent) => void;
  private readonly isaretciHareketDinleyici: (olay: PointerEvent) => void;
  private readonly isaretciBirakildiDinleyici: (olay: PointerEvent) => void;
  private readonly isaretciIptalDinleyici: (olay: PointerEvent) => void;

  constructor(
    kamera: THREE.PerspectiveCamera,
    domElemani: HTMLElement,
    orbitKontrolleri: OrbitControls,
    cisimYoneticisi: CisimYoneticisi,
    darbeGeriCagrisi: SuDarbeGeriCagrisi,
  ) {
    this.kamera = kamera;
    this.domElemani = domElemani;
    this.orbitKontrolleri = orbitKontrolleri;
    this.cisimYoneticisi = cisimYoneticisi;
    this.darbeGeriCagrisi = darbeGeriCagrisi;

    this.isaretciBasildiDinleyici = (olay) => this.isaretciBasildiIsle(olay);
    this.isaretciHareketDinleyici = (olay) => this.isaretciHareketIsle(olay);
    this.isaretciBirakildiDinleyici = (olay) => this.isaretciSonlandiIsle(olay, false);
    this.isaretciIptalDinleyici = (olay) => this.isaretciSonlandiIsle(olay, true);

    this.domElemani.addEventListener('pointerdown', this.isaretciBasildiDinleyici);
    this.domElemani.addEventListener('pointermove', this.isaretciHareketDinleyici, {
      passive: true,
    });
    this.domElemani.addEventListener('pointerup', this.isaretciBirakildiDinleyici);
    this.domElemani.addEventListener('pointercancel', this.isaretciIptalDinleyici);
  }

  private ndcGuncelle(olay: PointerEvent): boolean {
    const alan = this.domElemani.getBoundingClientRect();
    if (alan.width <= 0 || alan.height <= 0) {
      return false;
    }

    this.isaretciNdc.x = ((olay.clientX - alan.left) / alan.width) * 2 - 1;
    this.isaretciNdc.y = -((olay.clientY - alan.top) / alan.height) * 2 + 1;
    return true;
  }

  private havuzIcindeMi(x: number, z: number): boolean {
    const kenarPayi = 0.08;
    return (
      x >= HAVUZ_SABITLERI.MIN_X + kenarPayi &&
      x <= HAVUZ_SABITLERI.MAK_X - kenarPayi &&
      z >= HAVUZ_SABITLERI.MIN_Z + kenarPayi &&
      z <= HAVUZ_SABITLERI.MAK_Z - kenarPayi
    );
  }

  private isaretciBasildiIsle(olay: PointerEvent): void {
    if (olay.pointerType === 'mouse' && olay.button !== 0) {
      return;
    }
    if (!this.ndcGuncelle(olay)) {
      return;
    }

    this.raycaster.setFromCamera(this.isaretciNdc, this.kamera);

    const kesisenCisim = this.cisimYoneticisi.kesisenCismiBul(this.raycaster);

    if (kesisenCisim) {
      const kesisimler = this.raycaster.intersectObject(kesisenCisim.kokGrup, true);
      const isabetNoktasi =
        kesisimler.length > 0 ? kesisimler[0].point : kesisenCisim.konum;

      this.tutuluyor = true;
      this.suruklenenCisim = kesisenCisim;
      this.aktifPointerId = olay.pointerId;
      this.suTiklamaBaslangici = null;
      this.oncekiHoverNoktasiVarMi = false;

      kesisenCisim.tutuluyorMu = true;
      kesisenCisim.fizikKilitliMi = false;
      kesisenCisim.hiz.set(0, 0, 0);
      kesisenCisim.acisalHiz.multiplyScalar(0.15);
      this.orbitKontrolleri.enabled = false;

      // Kamera bakış yönüne dik sürükleme düzlemi kur (dikey kaldırmaya olanak tanır)
      this.kamera.getWorldDirection(this.geciciKameraYonu);
      this.suruklemeDuzlemi.setFromNormalAndCoplanarPoint(
        this.geciciKameraYonu.negate(),
        isabetNoktasi,
      );

      this.tutmaOfseti.copy(kesisenCisim.konum).sub(isabetNoktasi);
      this.hesaplananAtisHizi.set(0, 0, 0);
      this.sonSuruklemeZamani = performance.now();

      try {
        this.domElemani.setPointerCapture(olay.pointerId);
      } catch {
        // Sentetik olaylarda yakalama desteklenmeyebilir
      }
      return;
    }

    // Cisme isabet yoksa suya kısa tıklama ihtimalini izle (OrbitControls açık kalır)
    const suyaIsabet = this.raycaster.ray.intersectPlane(
      this.suDuzlemi,
      this.geciciKesisim,
    );
    if (suyaIsabet && this.havuzIcindeMi(this.geciciKesisim.x, this.geciciKesisim.z)) {
      this.suTiklamaBaslangici = {
        pointerId: olay.pointerId,
        clientX: olay.clientX,
        clientY: olay.clientY,
        dunyaX: this.geciciKesisim.x,
        dunyaZ: this.geciciKesisim.z,
      };
    } else {
      this.suTiklamaBaslangici = null;
    }
  }

  private isaretciHareketIsle(olay: PointerEvent): void {
    if (!this.ndcGuncelle(olay)) {
      return;
    }

    this.raycaster.setFromCamera(this.isaretciNdc, this.kamera);

    // 1. Tutulan cismi sürükleme düzleminde taşıma
    if (this.tutuluyor && this.suruklenenCisim && olay.pointerId === this.aktifPointerId) {
      const kesisimBulundu = this.raycaster.ray.intersectPlane(
        this.suruklemeDuzlemi,
        this.geciciKesisim,
      );
      if (!kesisimBulundu) {
        return;
      }

      const aktifCisim = this.suruklenenCisim;
      this.geciciHedefKonum.copy(this.geciciKesisim).add(this.tutmaOfseti);

      const kenarPayiX = 0.35;
      const kenarPayiZ = 0.55;
      this.geciciHedefKonum.x = THREE.MathUtils.clamp(
        this.geciciHedefKonum.x,
        HAVUZ_SABITLERI.MIN_X + kenarPayiX,
        HAVUZ_SABITLERI.MAK_X - kenarPayiX,
      );
      this.geciciHedefKonum.z = THREE.MathUtils.clamp(
        this.geciciHedefKonum.z,
        HAVUZ_SABITLERI.MIN_Z + kenarPayiZ,
        HAVUZ_SABITLERI.MAK_Z - kenarPayiZ,
      );
      this.geciciHedefKonum.y = THREE.MathUtils.clamp(
        this.geciciHedefKonum.y,
        HAVUZ_SABITLERI.TABAN_Y + 0.15,
        11.6,
      );

      const simdi = performance.now();
      const gecenDt = Math.max((simdi - this.sonSuruklemeZamani) / 1000, 0.004);

      this.geciciAnlikHiz
        .copy(this.geciciHedefKonum)
        .sub(aktifCisim.konum)
        .divideScalar(gecenDt)
        .clampLength(0, 7.5);

      this.hesaplananAtisHizi.lerp(this.geciciAnlikHiz, 0.45);

      aktifCisim.konum.copy(this.geciciHedefKonum);
      aktifCisim.hiz.copy(this.hesaplananAtisHizi);
      aktifCisim.donusumuSenkronizeEt();

      // Su yüzeyinden geçerken sürükleme iz dalgası (wake) üret
      const suKesitYakinligi = Math.abs(
        this.geciciHedefKonum.y - HAVUZ_SABITLERI.SU_SEVIYESI_Y,
      );
      const hizBuyuklugu = this.geciciAnlikHiz.length();

      if (suKesitYakinligi < aktifCisim.sinirlayiciYaricap + 0.14 && hizBuyuklugu > 0.12) {
        const uv = dunyaXZdenUVye(this.geciciHedefKonum.x, this.geciciHedefKonum.z);
        const kuvvet = -THREE.MathUtils.clamp(hizBuyuklugu * 0.012, 0.008, 0.042);
        this.darbeGeriCagrisi(
          THREE.MathUtils.clamp(uv.u, 0.03, 0.97),
          THREE.MathUtils.clamp(uv.v, 0.03, 0.97),
          0.022,
          kuvvet,
        );
      }

      this.sonSuruklemeZamani = simdi;
      return;
    }

    // 2. Fare tuşu basılı değilken (hover) su yüzeyi üzerinde ince iz dalgası
    if (!this.tutuluyor && olay.buttons === 0) {
      const suyaIsabet = this.raycaster.ray.intersectPlane(
        this.suDuzlemi,
        this.geciciKesisim,
      );

      if (suyaIsabet && this.havuzIcindeMi(this.geciciKesisim.x, this.geciciKesisim.z)) {
        if (this.oncekiHoverNoktasiVarMi) {
          const mesafe = Math.hypot(
            this.geciciKesisim.x - this.oncekiHoverNoktasi.x,
            this.geciciKesisim.z - this.oncekiHoverNoktasi.z,
          );
          if (mesafe > 0.018 && mesafe < 0.75) {
            const uv = dunyaXZdenUVye(this.geciciKesisim.x, this.geciciKesisim.z);
            const kuvvet = -THREE.MathUtils.clamp(mesafe * 0.06, 0.004, 0.015);
            this.darbeGeriCagrisi(
              THREE.MathUtils.clamp(uv.u, 0.03, 0.97),
              THREE.MathUtils.clamp(uv.v, 0.03, 0.97),
              0.013,
              kuvvet,
            );
          }
        }

        this.oncekiHoverNoktasi.copy(this.geciciKesisim);
        this.oncekiHoverNoktasiVarMi = true;
      } else {
        this.oncekiHoverNoktasiVarMi = false;
      }
    } else {
      this.oncekiHoverNoktasiVarMi = false;
    }
  }

  private isaretciSonlandiIsle(olay: PointerEvent, iptalEdildiMi: boolean): void {
    if (this.tutuluyor && this.suruklenenCisim && olay.pointerId === this.aktifPointerId) {
      const aktifCisim = this.suruklenenCisim;
      this.tutuluyor = false;
      this.suruklenenCisim = null;
      aktifCisim.tutuluyorMu = false;

      const beklemeSuresiMs = performance.now() - this.sonSuruklemeZamani;
      if (iptalEdildiMi || beklemeSuresiMs > 120) {
        aktifCisim.hiz.set(0, 0, 0);
      } else {
        aktifCisim.hiz.copy(this.hesaplananAtisHizi).clampLength(0, 6.5);
      }

      this.orbitKontrolleri.enabled = true;
      this.aktifPointerId = null;

      try {
        if (this.domElemani.hasPointerCapture(olay.pointerId)) {
          this.domElemani.releasePointerCapture(olay.pointerId);
        }
      } catch {
        // Pointer yakalama yoksa yoksay
      }
      return;
    }

    if (
      this.suTiklamaBaslangici !== null &&
      olay.pointerId === this.suTiklamaBaslangici.pointerId
    ) {
      if (!iptalEdildiMi) {
        const hareketPx = Math.hypot(
          olay.clientX - this.suTiklamaBaslangici.clientX,
          olay.clientY - this.suTiklamaBaslangici.clientY,
        );
        if (hareketPx < 6) {
          const uv = dunyaXZdenUVye(
            this.suTiklamaBaslangici.dunyaX,
            this.suTiklamaBaslangici.dunyaZ,
          );
          this.darbeGeriCagrisi(
            THREE.MathUtils.clamp(uv.u, 0.03, 0.97),
            THREE.MathUtils.clamp(uv.v, 0.03, 0.97),
            0.028,
            -0.13,
          );
        }
      }
      this.suTiklamaBaslangici = null;
    }
  }

  /**
   * Tüm DOM pointer olay dinleyicilerini kaldırır ve aktif sürükleme kilidini açar.
   */
  public temizle(): void {
    this.domElemani.removeEventListener('pointerdown', this.isaretciBasildiDinleyici);
    this.domElemani.removeEventListener('pointermove', this.isaretciHareketDinleyici);
    this.domElemani.removeEventListener('pointerup', this.isaretciBirakildiDinleyici);
    this.domElemani.removeEventListener('pointercancel', this.isaretciIptalDinleyici);

    if (this.tutuluyor) {
      this.tutuluyor = false;
      if (this.suruklenenCisim) {
        this.suruklenenCisim.tutuluyorMu = false;
        this.suruklenenCisim = null;
      }
      this.orbitKontrolleri.enabled = true;
    }
    this.aktifPointerId = null;
    this.suTiklamaBaslangici = null;
  }
}
