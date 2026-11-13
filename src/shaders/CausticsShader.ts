import * as THREE from 'three';
import { HAVUZ_SABITLERI, kulvarMerkeziXGetir } from '../types/simulation';

/**
 * Tüm optik shader modülleri tarafından paylaşılan merkezi uniform sözleşmesi.
 */
export interface OrtakOptikUniformlari {
  [uniformAdi: string]: THREE.IUniform<unknown>;
  uYukseklikDokusu: THREE.IUniform<THREE.Texture>;
  uKostikDokusu: THREE.IUniform<THREE.Texture>;
  uSuAltiGolgeDokusu: THREE.IUniform<THREE.Texture>;
  uKirilmaDokusu: THREE.IUniform<THREE.Texture>;
  uIsikYonu: THREE.IUniform<THREE.Vector3>;
  uIsikGolgeMatrisi: THREE.IUniform<THREE.Matrix4>;
  uKirilmaIndisi: THREE.IUniform<number>;
  uKostikSiddeti: THREE.IUniform<number>;
  uKostikYariBoyut: THREE.IUniform<THREE.Vector2>;
  uAltKureMerkezleri: THREE.IUniform<THREE.Vector3[]>;
  uAltKureYaricaplari: THREE.IUniform<Float32Array>;
  uAltKureSayisi: THREE.IUniform<number>;
  uCisimMerkezi: THREE.IUniform<THREE.Vector3>;
  uCisimYaricapi: THREE.IUniform<number>;
  uEkranBoyutu: THREE.IUniform<THREE.Vector2>;
  uZaman: THREE.IUniform<number>;
  uKirilmaPassiMi: THREE.IUniform<number>;
  uGolgeKodlamaModu: THREE.IUniform<number>;
}

/**
 * Olimpik havuz sabitlerine dayalı ortak GLSL sabit blokları.
 * Tek noktadan yönetilerek tüm shader'larda koordinat tutarlılığı sağlar.
 */
export const ORTAK_GLSL_SABITLERI = /* glsl */ `
  const float HAVUZ_MIN_X = ${HAVUZ_SABITLERI.MIN_X.toFixed(2)};
  const float HAVUZ_MAK_X = ${HAVUZ_SABITLERI.MAK_X.toFixed(2)};
  const float HAVUZ_MIN_Z = ${HAVUZ_SABITLERI.MIN_Z.toFixed(2)};
  const float HAVUZ_MAK_Z = ${HAVUZ_SABITLERI.MAK_Z.toFixed(2)};
  const float HAVUZ_GENISLIK_X = ${HAVUZ_SABITLERI.GENISLIK_X.toFixed(2)};
  const float HAVUZ_UZUNLUK_Z = ${HAVUZ_SABITLERI.UZUNLUK_Z.toFixed(2)};
  const float HAVUZ_TABAN_Y = ${HAVUZ_SABITLERI.TABAN_Y.toFixed(2)};
  const float HAVUZ_DUVAR_UST_Y = ${HAVUZ_SABITLERI.DUVAR_UST_Y.toFixed(2)};
  const int KULVAR_SAYISI = ${HAVUZ_SABITLERI.KULVAR_SAYISI};
  const float TRAMPLEN_YUKSEKLIK_Y = ${HAVUZ_SABITLERI.TRAMPLEN_YUKSEKLIK_Y.toFixed(2)};
  const float TRAMPLEN_UC_Z = ${HAVUZ_SABITLERI.TRAMPLEN_UC_Z.toFixed(2)};
  const float TRAMPLEN_KULVAR_X = ${kulvarMerkeziXGetir(HAVUZ_SABITLERI.TRAMPLEN_KULVAR_INDEKSI).toFixed(4)};
  const float GOLGE_BOYUT = ${HAVUZ_SABITLERI.GOLGE_COZUNURLUK.toFixed(1)};
  const int MAKSIMUM_ALT_KURE_SAYISI = ${HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE};
`;

/**
 * GPGPU HeightfieldTexture okuma, dikdörtgen kostik UV dönüşümü ve Beer-Lambert fonksiyonları.
 */
export const ORTAK_SU_OKUMA_GLSL = /* glsl */ `
  vec2 dunyaXZdenSuUVye(vec2 dunyaXZ) {
    return (dunyaXZ - vec2(HAVUZ_MIN_X, HAVUZ_MIN_Z)) / vec2(HAVUZ_GENISLIK_X, HAVUZ_UZUNLUK_Z);
  }

  vec4 suVerisiOku(sampler2D yukseklikDokusu, vec2 dunyaXZ) {
    vec2 suUV = clamp(dunyaXZdenSuUVye(dunyaXZ), 0.002, 0.998);
    return texture2D(yukseklikDokusu, suUV);
  }

  vec3 suNormaliCoz(vec4 suVeri) {
    float dikeyBilesen = sqrt(max(0.0001, 1.0 - suVeri.b * suVeri.b - suVeri.a * suVeri.a));
    return normalize(vec3(suVeri.b, dikeyBilesen, suVeri.a));
  }

  vec2 tabanXZdenKostikUVye(vec2 tabanXZ, vec2 kostikYariBoyut) {
    return (tabanXZ / max(kostikYariBoyut, vec2(0.001))) * 0.5 + 0.5;
  }

  vec3 beerLambertSogurulma(float derinlik) {
    return exp(-vec3(0.38, 0.085, 0.035) * max(0.0, derinlik));
  }
`;

/**
 * Su altı gölge haritası (Pass 1) ve analitik alt küre kesme (caustic occlusion) fonksiyonları.
 * UnsignedByteType fallback durumunda yükseklik [-3.5, 3.5] aralığından çözülür.
 */
export const ORTAK_GOLGE_GLSL = /* glsl */ `
  float golgeYukseklikCoz(float hamDeger, float kodlamaModu) {
    return kodlamaModu > 0.5 ? (hamDeger * 7.0 - 3.5) : hamDeger;
  }

  float suAltiGolgeHaritasiOrnekle(
    sampler2D golgeDokusu,
    mat4 isikGolgeMatrisi,
    vec3 dunyaKonum,
    float kodlamaModu,
    float yumusaklikYaricapi
  ) {
    vec4 golgeKlip = isikGolgeMatrisi * vec4(dunyaKonum, 1.0);
    vec3 golgeNDC = golgeKlip.xyz / max(golgeKlip.w, 0.0001);
    vec2 merkezUV = golgeNDC.xy * 0.5 + 0.5;

    if (merkezUV.x < 0.0 || merkezUV.x > 1.0 || merkezUV.y < 0.0 || merkezUV.y > 1.0) {
      return 1.0;
    }

    vec2 pikselAdimi = vec2(yumusaklikYaricapi / max(GOLGE_BOYUT, 1.0));
    float toplamGorunurluk = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 ornekUV = clamp(merkezUV + vec2(float(i), float(j)) * pikselAdimi, 0.001, 0.999);
        vec4 golgeVeri = texture2D(golgeDokusu, ornekUV);
        if (golgeVeri.g > 0.5) {
          float cisimY = golgeYukseklikCoz(golgeVeri.r, kodlamaModu);
          // Nokta cismin ışığa bakan üst yüzeyinin altındaysa gölge içindedir
          float gecis = smoothstep(cisimY - 0.06, cisimY - 0.015, dunyaKonum.y);
          toplamGorunurluk += gecis;
        } else {
          toplamGorunurluk += 1.0;
        }
      }
    }

    return toplamGorunurluk / 9.0;
  }

  float altKureGolgeOraniHesapla(
    vec3 dunyaKonum,
    vec3 isigaDogruYon,
    vec3 altKureMerkezleri[MAKSIMUM_ALT_KURE_SAYISI],
    float altKureYaricaplari[MAKSIMUM_ALT_KURE_SAYISI],
    int altKureSayisi
  ) {
    float enKucukGorunurluk = 1.0;

    for (int i = 0; i < MAKSIMUM_ALT_KURE_SAYISI; i++) {
      if (i >= altKureSayisi) {
        break;
      }

      float r = altKureYaricaplari[i];
      if (r <= 0.001) {
        continue;
      }

      vec3 merkezeVektor = altKureMerkezleri[i] - dunyaKonum;
      float tProj = dot(merkezeVektor, isigaDogruYon);
      if (tProj > 0.0) {
        float dikMesafeKare = max(0.0, dot(merkezeVektor, merkezeVektor) - tProj * tProj);
        float dikMesafe = sqrt(dikMesafeKare);
        float kureGorunurlugu = smoothstep(r * 0.82, r * 1.18, dikMesafe);
        enKucukGorunurluk = min(enKucukGorunurluk, kureGorunurlugu);
      }
    }

    return enKucukGorunurluk;
  }
`;

const KOSTIK_VERTEX_SHADER = /* glsl */ `
  ${ORTAK_GLSL_SABITLERI}
  ${ORTAK_SU_OKUMA_GLSL}

  uniform sampler2D uYukseklikDokusu;
  uniform vec3 uIsikYonu;
  uniform float uKirilmaIndisi;
  uniform vec2 uKostikYariBoyut;

  varying vec3 vEskiKonum;
  varying vec3 vYeniKonum;
  varying vec3 vReferansIsin;
  varying vec2 vSuDunyaXZ;

  void main() {
    vSuDunyaXZ = position.xz;
    vec4 suVeri = suVerisiOku(uYukseklikDokusu, position.xz);
    float suY = suVeri.r;
    vec3 suNormal = suNormaliCoz(suVeri);

    vec3 suNoktasi = vec3(position.x, suY, position.z);
    float eta = 1.0 / max(uKirilmaIndisi, 1.0001);
    vec3 isikYon = normalize(uIsikYonu);

    vec3 referansIsin = refract(isikYon, vec3(0.0, 1.0, 0.0), eta);
    vec3 kirilanIsin = refract(isikYon, suNormal, eta);
    if (length(kirilanIsin) < 0.001) {
      kirilanIsin = referansIsin;
    }

    float tEski = (HAVUZ_TABAN_Y - suNoktasi.y) / min(referansIsin.y, -0.05);
    float tYeni = (HAVUZ_TABAN_Y - suNoktasi.y) / min(kirilanIsin.y, -0.05);

    vEskiKonum = suNoktasi + referansIsin * tEski;
    vYeniKonum = suNoktasi + kirilanIsin * tYeni;
    vReferansIsin = referansIsin;

    vec2 yariBoyut = max(uKostikYariBoyut, vec2(0.001));
    gl_Position = vec4(vYeniKonum.xz / yariBoyut, 0.0, 1.0);
  }
`;

const KOSTIK_FRAGMENT_SHADER = /* glsl */ `
  ${ORTAK_GLSL_SABITLERI}
  ${ORTAK_GOLGE_GLSL}

  uniform sampler2D uSuAltiGolgeDokusu;
  uniform mat4 uIsikGolgeMatrisi;
  uniform float uKostikSiddeti;
  uniform float uGolgeKodlamaModu;
  uniform vec2 uKostikYariBoyut;
  uniform vec3 uAltKureMerkezleri[MAKSIMUM_ALT_KURE_SAYISI];
  uniform float uAltKureYaricaplari[MAKSIMUM_ALT_KURE_SAYISI];
  uniform int uAltKureSayisi;

  varying vec3 vEskiKonum;
  varying vec3 vYeniKonum;
  varying vec3 vReferansIsin;
  varying vec2 vSuDunyaXZ;

  void main() {
    // Ekran uzayındaki Jacobyen alan oranı ile enerji korunumlu odak şiddeti
    float eskiAlan = length(dFdx(vEskiKonum)) * length(dFdy(vEskiKonum));
    float yeniAlan = length(dFdx(vYeniKonum)) * length(dFdy(vYeniKonum));
    float odak = clamp((eskiAlan / max(yeniAlan, 0.00003)) * 0.24, 0.0, 2.8);

    // Dikdörtgen olimpik havuz ve projeksiyon sınırlarında yumuşak kenar düşüşü
    float suKenarMaske =
      smoothstep(HAVUZ_MAK_X + 0.03, HAVUZ_MAK_X - 0.10, abs(vSuDunyaXZ.x)) *
      smoothstep(HAVUZ_MAK_Z + 0.03, HAVUZ_MAK_Z - 0.12, abs(vSuDunyaXZ.z));
    float projeksiyonKenarMaske =
      smoothstep(uKostikYariBoyut.x, max(0.1, uKostikYariBoyut.x - 0.28), abs(vYeniKonum.x)) *
      smoothstep(uKostikYariBoyut.y, max(0.1, uKostikYariBoyut.y - 0.34), abs(vYeniKonum.z));
    float havuzDisYumusaklik =
      smoothstep(uKostikYariBoyut.x + 0.06, max(0.1, uKostikYariBoyut.x - 0.24), abs(vEskiKonum.x)) *
      smoothstep(uKostikYariBoyut.y + 0.06, max(0.1, uKostikYariBoyut.y - 0.28), abs(vEskiKonum.z));
    float kenarMaskesi = suKenarMaske * projeksiyonKenarMaske * havuzDisYumusaklik;

    // Su altı gölge haritası ve alt küre kesme (caustic occlusion)
    float haritaGorunurluk = suAltiGolgeHaritasiOrnekle(
      uSuAltiGolgeDokusu,
      uIsikGolgeMatrisi,
      vYeniKonum,
      uGolgeKodlamaModu,
      1.35
    );
    vec3 guvenliIsik = length(vReferansIsin) > 0.0001
      ? normalize(-vReferansIsin)
      : vec3(0.0, 1.0, 0.0);
    float kureGorunurluk = altKureGolgeOraniHesapla(
      vYeniKonum,
      guvenliIsik,
      uAltKureMerkezleri,
      uAltKureYaricaplari,
      uAltKureSayisi
    );
    float gorunurluk = mix(0.08, 1.0, min(haritaGorunurluk, kureGorunurluk));

    float hamOdak = odak * uKostikSiddeti * kenarMaskesi;
    vec3 kostikRenk = vec3(0.95, 1.0, 1.04) * hamOdak * gorunurluk;

    // Alfa kanalı cisimlerin üst yüzeylerinde kullanılmak üzere gölgesiz ham kostik enerjisini taşır
    gl_FragColor = vec4(kostikRenk, hamOdak);
  }
`;

/**
 * Kostik projeksiyonu için 255x511 segmentli (256x512 köşe noktalı) 8m x 16m XZ düzlemi oluşturur.
 */
export function kostikIzgarasiOlustur(): THREE.PlaneGeometry {
  const segmentX = HAVUZ_SABITLERI.GPGPU_COZUNURLUK_X - 1;
  const segmentZ = HAVUZ_SABITLERI.GPGPU_COZUNURLUK_Z - 1;
  const geometri = new THREE.PlaneGeometry(
    HAVUZ_SABITLERI.GENISLIK_X,
    HAVUZ_SABITLERI.UZUNLUK_Z,
    segmentX,
    segmentZ,
  );
  geometri.rotateX(-Math.PI / 2);
  return geometri;
}

/**
 * Pass 2 için kostik ShaderMaterial nesnesini oluşturur.
 * MaxEquation karıştırması katlanmış odak çizgilerinin birbirini ezmesini ve patlamayı önler.
 */
export function kostikMateryaliOlustur(
  ortakUniformlar: OrtakOptikUniformlari,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'CausticsShaderMateryali',
    uniforms: {
      uYukseklikDokusu: ortakUniformlar.uYukseklikDokusu,
      uSuAltiGolgeDokusu: ortakUniformlar.uSuAltiGolgeDokusu,
      uIsikYonu: ortakUniformlar.uIsikYonu,
      uIsikGolgeMatrisi: ortakUniformlar.uIsikGolgeMatrisi,
      uKirilmaIndisi: ortakUniformlar.uKirilmaIndisi,
      uKostikSiddeti: ortakUniformlar.uKostikSiddeti,
      uKostikYariBoyut: ortakUniformlar.uKostikYariBoyut,
      uGolgeKodlamaModu: ortakUniformlar.uGolgeKodlamaModu,
      uAltKureMerkezleri: ortakUniformlar.uAltKureMerkezleri,
      uAltKureYaricaplari: ortakUniformlar.uAltKureYaricaplari,
      uAltKureSayisi: ortakUniformlar.uAltKureSayisi,
    },
    vertexShader: KOSTIK_VERTEX_SHADER,
    fragmentShader: KOSTIK_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendEquationAlpha: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
}

/**
 * Dış modüllerin erişebilmesi için CausticsShader tanımı.
 */
export const CausticsShader = {
  vertexShader: KOSTIK_VERTEX_SHADER,
  fragmentShader: KOSTIK_FRAGMENT_SHADER,
  izgaraOlustur: kostikIzgarasiOlustur,
  materyalOlustur: kostikMateryaliOlustur,
} as const;
