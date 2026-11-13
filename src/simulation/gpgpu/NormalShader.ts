import * as THREE from 'three';
import { HAVUZ_SABITLERI } from '../../types/simulation';

const TAM_EKRAN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const NORMAL_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uSuDokusu;
uniform vec2 uTexelBoyutu;
uniform vec2 uDunyaTexelBoyutu;

varying vec2 vUv;

void main() {
  vec4 veri = texture2D(uSuDokusu, vUv);

  float hSol = texture2D(uSuDokusu, vUv - vec2(uTexelBoyutu.x, 0.0)).r;
  float hSag = texture2D(uSuDokusu, vUv + vec2(uTexelBoyutu.x, 0.0)).r;
  float hAlt = texture2D(uSuDokusu, vUv - vec2(0.0, uTexelBoyutu.y)).r;
  float hUst = texture2D(uSuDokusu, vUv + vec2(0.0, uTexelBoyutu.y)).r;

  // 256x512 kare texel yapısında (dx = dz = 0.03125m) her iki eksen için ayrı dünya adımı kullanılır
  float ikiTexelAraligiX = max(2.0 * uDunyaTexelBoyutu.x, 0.0001);
  float ikiTexelAraligiZ = max(2.0 * uDunyaTexelBoyutu.y, 0.0001);
  float dhx = (hSag - hSol) / ikiTexelAraligiX;
  float dhz = (hUst - hAlt) / ikiTexelAraligiZ;

  vec3 normal = normalize(vec3(-dhx, 1.0, -dhz));

  gl_FragColor = vec4(veri.r, veri.g, normal.x, normal.z);
}
`;

/**
 * Yükseklik haritasından merkezi sonlu farklarla su yüzeyi normalini hesaplayıp
 * `B` ve `A` kanallarına (`normal.x`, `normal.z`) yazan GPGPU shader kapsülleyicisi.
 */
export class NormalShader {
  private readonly materyal: THREE.ShaderMaterial;

  constructor(
    texelBoyutu: THREE.Vector2,
    dunyaTexelBoyutu: THREE.Vector2 | number = new THREE.Vector2(
      HAVUZ_SABITLERI.GENISLIK_X / HAVUZ_SABITLERI.GPGPU_COZUNURLUK_X,
      HAVUZ_SABITLERI.UZUNLUK_Z / HAVUZ_SABITLERI.GPGPU_COZUNURLUK_Z,
    ),
  ) {
    const dunyaTexelVektoru =
      typeof dunyaTexelBoyutu === 'number'
        ? new THREE.Vector2(dunyaTexelBoyutu, dunyaTexelBoyutu)
        : dunyaTexelBoyutu.clone();

    this.materyal = new THREE.ShaderMaterial({
      uniforms: {
        uSuDokusu: { value: null },
        uTexelBoyutu: { value: texelBoyutu.clone() },
        uDunyaTexelBoyutu: { value: dunyaTexelVektoru },
      },
      vertexShader: TAM_EKRAN_VERTEX_SHADER,
      fragmentShader: NORMAL_FRAGMENT_SHADER,
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
   * Normal hesabı için okunacak su dokusunu uniforma bağlar.
   */
  public uniformlariGuncelle(suDokusu: THREE.Texture): void {
    this.materyal.uniforms.uSuDokusu.value = suDokusu;
  }

  /**
   * GPU shader materyal kaynağını serbest bırakır.
   */
  public temizle(): void {
    this.materyal.dispose();
  }
}
