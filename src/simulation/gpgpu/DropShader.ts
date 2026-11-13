import * as THREE from 'three';
import { HAVUZ_SABITLERI, type SuDarbesiVerisi } from '../../types/simulation';

const TAM_EKRAN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DARBE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

const int MAKSIMUM_DARBE_SAYISI = ${HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI};

uniform sampler2D uSuDokusu;
uniform vec4 uDarbeler[MAKSIMUM_DARBE_SAYISI];
uniform int uDarbeSayisi;
uniform vec2 uUvOlcek;

varying vec2 vUv;

void main() {
  vec4 veri = texture2D(uSuDokusu, vUv);

  for (int indeks = 0; indeks < MAKSIMUM_DARBE_SAYISI; indeks++) {
    if (indeks >= uDarbeSayisi) {
      break;
    }

    vec4 darbe = uDarbeler[indeks];
    // Dikdörtgen havuzda dairesel ve santimetre ölçekli darbe profili için UV farkı ölçeklenir
    float mesafe = length((vUv - darbe.xy) * uUvOlcek);
    float etki = max(0.0, 1.0 - mesafe / max(darbe.z, 0.001));
    etki = 0.5 - cos(etki * 3.14159265) * 0.5;
    veri.r += etki * darbe.w;
  }

  veri.r = clamp(veri.r, -0.42, 0.42);
  gl_FragColor = veri;
}
`;

/**
 * GPGPU su yüksekliği haritasına tek pass içinde en fazla 24 adet deplasman darbesi
 * ekleyen fragment/vertex shader kapsülleyicisi.
 */
export class DropShader {
  private readonly materyal: THREE.ShaderMaterial;
  private readonly darbeVektorleri: THREE.Vector4[];

  constructor(
    uvOlcek: THREE.Vector2 = new THREE.Vector2(
      HAVUZ_SABITLERI.GENISLIK_X / 4.0,
      HAVUZ_SABITLERI.UZUNLUK_Z / 4.0,
    ),
  ) {
    this.darbeVektorleri = Array.from(
      { length: HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI },
      () => new THREE.Vector4(0, 0, 0.01, 0),
    );

    this.materyal = new THREE.ShaderMaterial({
      uniforms: {
        uSuDokusu: { value: null },
        uDarbeler: { value: this.darbeVektorleri },
        uDarbeSayisi: { value: 0 },
        uUvOlcek: { value: uvOlcek.clone() },
      },
      vertexShader: TAM_EKRAN_VERTEX_SHADER,
      fragmentShader: DARBE_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      blending: THREE.NoBlending,
      toneMapped: false,
      dithering: false,
    });
  }

  /**
   * Geçiş çizimi için dahili `ShaderMaterial` örneğini döndürür.
   */
  public materyalGetir(): THREE.ShaderMaterial {
    return this.materyal;
  }

  /**
   * Okunacak su dokusunu ve bu geçişte işlenecek darbe dilimini uniformlara aktarır.
   */
  public uniformlariGuncelle(
    suDokusu: THREE.Texture,
    darbeler: readonly SuDarbesiVerisi[],
    baslangicIndeksi: number,
    darbeAdedi: number,
  ): void {
    const sinirliAdet = Math.min(
      Math.max(0, darbeAdedi),
      HAVUZ_SABITLERI.MAKSIMUM_DARBE_SAYISI,
    );

    for (let indeks = 0; indeks < sinirliAdet; indeks++) {
      const darbe = darbeler[baslangicIndeksi + indeks];
      this.darbeVektorleri[indeks].set(
        darbe.uvX,
        darbe.uvZ,
        darbe.yaricap,
        darbe.kuvvet,
      );
    }

    this.materyal.uniforms.uSuDokusu.value = suDokusu;
    this.materyal.uniforms.uDarbeSayisi.value = sinirliAdet;
  }

  /**
   * GPU shader materyal kaynağını serbest bırakır.
   */
  public temizle(): void {
    this.materyal.dispose();
  }
}
