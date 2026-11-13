import * as THREE from 'three';

const TAM_EKRAN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const GUNCELLEME_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uSuDokusu;
uniform vec2 uTexelBoyutu;
uniform float uSonumleme;

varying vec2 vUv;

void main() {
  vec4 veri = texture2D(uSuDokusu, vUv);

  // 256x512 kare texel yapısında (dx = dz = 0.03125m) X ve Z komşu adımları eşit dünya aralığına karşılık gelir
  float sol = texture2D(uSuDokusu, vUv - vec2(uTexelBoyutu.x, 0.0)).r;
  float sag = texture2D(uSuDokusu, vUv + vec2(uTexelBoyutu.x, 0.0)).r;
  float alt = texture2D(uSuDokusu, vUv - vec2(0.0, uTexelBoyutu.y)).r;
  float ust = texture2D(uSuDokusu, vUv + vec2(0.0, uTexelBoyutu.y)).r;

  float ortalama = (sol + sag + alt + ust) * 0.25;
  veri.g += (ortalama - veri.r) * 1.95;
  veri.g *= uSonumleme;
  veri.r += veri.g;

  // Ortalama su seviyesinin zamanla kaymasını önleyen mikro geri çağırıcı terim
  veri.r *= 0.9995;

  veri.r = clamp(veri.r, -0.42, 0.42);
  veri.g = clamp(veri.g, -0.25, 0.25);

  gl_FragColor = veri;
}
`;

/**
 * 2B sığ su dalga denklemini sonlu farklar yöntemiyle bir zaman adımı ilerleten
 * GPGPU shader kapsülleyicisi.
 */
export class UpdateShader {
  private readonly materyal: THREE.ShaderMaterial;

  constructor(texelBoyutu: THREE.Vector2) {
    this.materyal = new THREE.ShaderMaterial({
      uniforms: {
        uSuDokusu: { value: null },
        uTexelBoyutu: { value: texelBoyutu.clone() },
        uSonumleme: { value: 0.985 },
      },
      vertexShader: TAM_EKRAN_VERTEX_SHADER,
      fragmentShader: GUNCELLEME_FRAGMENT_SHADER,
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
   * Okunacak su dokusunu ve sönümleme katsayısını shader uniformlarına atar.
   */
  public uniformlariGuncelle(suDokusu: THREE.Texture, sonumleme: number): void {
    this.materyal.uniforms.uSuDokusu.value = suDokusu;
    this.materyal.uniforms.uSonumleme.value = sonumleme;
  }

  /**
   * GPU shader materyal kaynağını serbest bırakır.
   */
  public temizle(): void {
    this.materyal.dispose();
  }
}
