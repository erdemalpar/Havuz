import * as THREE from 'three';
import { HAVUZ_SABITLERI } from '../types/simulation';
import {
  ORTAK_GLSL_SABITLERI,
  ORTAK_SU_OKUMA_GLSL,
  type OrtakOptikUniformlari,
} from './CausticsShader';

const SU_ALTI_CISIM_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDunyaKonum;
  varying vec3 vDunyaNormal;

  void main() {
    vec4 dunyaKonum4 = modelMatrix * vec4(position, 1.0);
    vDunyaKonum = dunyaKonum4.xyz;

    // Non-uniform ölçeklenmiş parçalarda (insan uzuvları, kutular) doğru dünya normali
    mat3 m = mat3(modelMatrix);
    vec3 olcekKare = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
    vDunyaNormal = normalize(m * (normal / max(olcekKare, vec3(0.0001))));

    gl_Position = projectionMatrix * viewMatrix * dunyaKonum4;
  }
`;

const SU_ALTI_CISIM_FRAGMENT_SHADER = /* glsl */ `
  ${ORTAK_GLSL_SABITLERI}
  ${ORTAK_SU_OKUMA_GLSL}

  uniform sampler2D uYukseklikDokusu;
  uniform sampler2D uKostikDokusu;
  uniform vec3 uIsikYonu;
  uniform float uKirilmaIndisi;
  uniform vec2 uKostikYariBoyut;
  uniform float uKirilmaPassiMi;
  uniform vec3 uTemelRenk;
  uniform float uPuruzluluk;
  uniform float uMetaliklik;

  varying vec3 vDunyaKonum;
  varying vec3 vDunyaNormal;

  void main() {
    vec3 normalYuzey = normalize(vDunyaNormal);
    vec3 gorusVektor = cameraPosition - vDunyaKonum;
    vec3 gorusYon = length(gorusVektor) > 0.0001
      ? normalize(gorusVektor)
      : vec3(0.0, 1.0, 0.0);

    vec4 suVeri = suVerisiOku(uYukseklikDokusu, vDunyaKonum.xz);
    float suY = suVeri.r;

    bool havuzIcindeMi =
      abs(vDunyaKonum.x) <= HAVUZ_MAK_X + 0.05 &&
      abs(vDunyaKonum.z) <= HAVUZ_MAK_Z + 0.05;
    bool suAltindaMi = havuzIcindeMi && (vDunyaKonum.y < suY);

    vec3 isikYon = normalize(uIsikYonu);
    float eta = 1.0 / max(uKirilmaIndisi, 1.0001);
    vec3 referansIsin = refract(isikYon, vec3(0.0, 1.0, 0.0), eta);
    vec3 suIciIsikYon = length(referansIsin) > 0.0001
      ? normalize(-referansIsin)
      : vec3(0.0, 1.0, 0.0);

    vec3 aktifIsikYon = suAltindaMi ? suIciIsikYon : -isikYon;

    // Lambert + hafif sarma (wrap) ile yumuşak hacimsel gölgeleme
    float hamNDotL = dot(normalYuzey, aktifIsikYon);
    float nDotL = max(0.0, hamNDotL);
    float yumusakDifuz = max(0.0, (hamNDotL + 0.18) / 1.18);

    // Blinn-Phong speküler ve çevre rim ışığı (ANGLE Metal zero-NaN güvenli)
    vec3 yarimToplam = aktifIsikYon + gorusYon;
    vec3 yarimVektor = length(yarimToplam) > 0.0001 ? normalize(yarimToplam) : normalYuzey;
    float puruz = clamp(uPuruzluluk, 0.05, 1.0);
    float spekulerUs = mix(180.0, 14.0, puruz);
    float spekulerYogunluk = mix(0.65, 0.10, puruz) * mix(1.0, 1.45, uMetaliklik);
    float spekuler = pow(max(0.0001, dot(normalYuzey, yarimVektor)), spekulerUs) * spekulerYogunluk;

    float fresnelKenar = pow(max(0.0001, 1.0 - max(0.0, dot(normalYuzey, gorusYon))), 3.2);
    vec3 difuzTaban = uTemelRenk * (1.0 - uMetaliklik * 0.65);
    vec3 spekulerRenk = mix(vec3(1.0, 0.98, 0.94), uTemelRenk, uMetaliklik);

    // Su yüzeyi ıslak menisküs bandı hesabı
    float yuzeyMesafesi = abs(vDunyaKonum.y - suY);
    float meniskusParilti = havuzIcindeMi
      ? (1.0 - smoothstep(0.0, 0.035, yuzeyMesafesi))
      : 0.0;
    float suUstuIslaklik = (havuzIcindeMi && !suAltindaMi)
      ? (1.0 - smoothstep(0.0, 0.065, vDunyaKonum.y - suY))
      : 0.0;

    vec3 lineerRenk = vec3(0.0);

    if (suAltindaMi) {
      float derinlik = max(0.0, suY - vDunyaKonum.y);

      // Havuz içi turkuaz dolgu ortam ışığı + alt taban yansıması
      vec3 suAltiOrtam = mix(vec3(0.10, 0.24, 0.34), vec3(0.24, 0.42, 0.50), normalYuzey.y * 0.5 + 0.5);
      vec3 temelAydinlatma =
        difuzTaban * (suAltiOrtam + vec3(0.95, 0.96, 0.92) * yumusakDifuz * 0.85) +
        spekulerRenk * spekuler * nDotL +
        vec3(0.18, 0.46, 0.58) * fresnelKenar * 0.32;

      // Cismin üst yüzeylerine gerçek zamanlı kostik ağları yansıt
      float tTaban = (HAVUZ_TABAN_Y - vDunyaKonum.y) / min(referansIsin.y, -0.05);
      vec3 tabanIzdusum = vDunyaKonum + referansIsin * tTaban;
      vec2 kostikUV = tabanXZdenKostikUVye(tabanIzdusum.xz, uKostikYariBoyut);

      vec3 cisimKostigi = vec3(0.0);
      if (kostikUV.x >= 0.0 && kostikUV.x <= 1.0 && kostikUV.y >= 0.0 && kostikUV.y <= 1.0) {
        vec4 kostikVeri = texture2D(uKostikDokusu, kostikUV);
        // Alpha kanalı CausticsShader tarafından gölgesiz ham kostik enerjisi olarak yazılır
        float hamKostik = max(kostikVeri.a, dot(kostikVeri.rgb, vec3(0.3333)));
        float odakDerinlikFaktoru = mix(0.30, 1.0, smoothstep(0.02, 0.65, derinlik));
        float kostikAcisi = max(0.0, dot(normalYuzey, suIciIsikYon));
        cisimKostigi = vec3(0.95, 1.0, 1.04) * hamKostik * kostikAcisi * odakDerinlikFaktoru * 1.1;
      }

      // Beer-Lambert su altı renk soğurulması (-2.60m derinlikte gerçekçi ama net görünüm)
      vec3 sogurulma = beerLambertSogurulma(derinlik);
      lineerRenk = (temelAydinlatma + (uTemelRenk * 0.85 + vec3(0.15)) * cisimKostigi) * sogurulma;

      // Derinlikle artan hafif su altı saçılımı
      float hacimSis = 1.0 - exp(-0.055 * derinlik);
      lineerRenk = mix(lineerRenk, vec3(0.025, 0.19, 0.31), hacimSis * 0.58);
    } else {
      // Su üstü aydınlatma + su çizgisine yakın ıslak kararma/parlama
      vec3 salonOrtam = mix(vec3(0.20, 0.25, 0.30), vec3(0.42, 0.50, 0.60), normalYuzey.y * 0.5 + 0.5);
      vec3 islakDifuzTaban = difuzTaban * mix(1.0, 0.76, suUstuIslaklik);
      float islakSpekuler = pow(max(0.0001, dot(normalYuzey, yarimVektor)), 110.0) * suUstuIslaklik * 0.55;

      lineerRenk =
        islakDifuzTaban * (salonOrtam + vec3(1.0, 0.97, 0.91) * yumusakDifuz * 0.95) +
        spekulerRenk * (spekuler * nDotL + islakSpekuler) +
        vec3(0.55, 0.72, 0.88) * fresnelKenar * 0.24;
    }

    // Su yüzeyini kesen hatta ıslak menisküs parıltısı
    lineerRenk += vec3(0.58, 0.86, 0.96) * meniskusParilti * 0.22;

    if (uKirilmaPassiMi > 0.5) {
      gl_FragColor = vec4(lineerRenk, 1.0);
      return;
    }

    gl_FragColor = vec4(lineerRenk, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function varsayilanUniformOlustur(): OrtakOptikUniformlari {
  const bosDoku = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  bosDoku.needsUpdate = true;

  return {
    uYukseklikDokusu: { value: bosDoku },
    uKostikDokusu: { value: bosDoku },
    uSuAltiGolgeDokusu: { value: bosDoku },
    uKirilmaDokusu: { value: bosDoku },
    uIsikYonu: { value: new THREE.Vector3(0.3, -0.9, 0.3).normalize() },
    uIsikGolgeMatrisi: { value: new THREE.Matrix4() },
    uKirilmaIndisi: { value: 1.333 },
    uKostikSiddeti: { value: 1.0 },
    uKostikYariBoyut: {
      value: new THREE.Vector2(
        HAVUZ_SABITLERI.KOSTIK_PROJEKSIYON_YARI_BOYUT_X,
        HAVUZ_SABITLERI.KOSTIK_PROJEKSIYON_YARI_BOYUT_Z,
      ),
    },
    uAltKureMerkezleri: {
      value: Array.from(
        { length: HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE },
        () => new THREE.Vector3(),
      ),
    },
    uAltKureYaricaplari: {
      value: new Float32Array(HAVUZ_SABITLERI.MAKSIMUM_ALT_KURE),
    },
    uAltKureSayisi: { value: 0 },
    uCisimMerkezi: { value: new THREE.Vector3() },
    uCisimYaricapi: { value: 0.5 },
    uEkranBoyutu: { value: new THREE.Vector2(1, 1) },
    uZaman: { value: 0 },
    uKirilmaPassiMi: { value: 0 },
    uGolgeKodlamaModu: { value: 0 },
  };
}

function temelRenkCikar(nesne: THREE.Object3D, materyal?: THREE.Material): THREE.Color {
  const kullaniciRenk = nesne.userData?.temelRenk as unknown;
  if (kullaniciRenk instanceof THREE.Color) {
    return kullaniciRenk.clone();
  }
  if (typeof kullaniciRenk === 'number' || typeof kullaniciRenk === 'string') {
    return new THREE.Color(kullaniciRenk);
  }

  if (materyal && 'color' in materyal) {
    const matRenk = (materyal as { color?: unknown }).color;
    if (matRenk instanceof THREE.Color) {
      return matRenk.clone();
    }
  }

  return new THREE.Color(0xd99472);
}

function puruzlulukCikar(nesne: THREE.Object3D, materyal?: THREE.Material): number {
  const kullaniciPuruz = nesne.userData?.puruzluluk as unknown;
  if (typeof kullaniciPuruz === 'number' && Number.isFinite(kullaniciPuruz)) {
    return THREE.MathUtils.clamp(kullaniciPuruz, 0.05, 1.0);
  }

  if (materyal && 'roughness' in materyal) {
    const matPuruz = (materyal as { roughness?: unknown }).roughness;
    if (typeof matPuruz === 'number' && Number.isFinite(matPuruz)) {
      return THREE.MathUtils.clamp(matPuruz, 0.05, 1.0);
    }
  }

  return 0.45;
}

function metaliklikCikar(nesne: THREE.Object3D, materyal?: THREE.Material): number {
  const kullaniciMetal = nesne.userData?.metalik as unknown;
  if (typeof kullaniciMetal === 'number' && Number.isFinite(kullaniciMetal)) {
    return THREE.MathUtils.clamp(kullaniciMetal, 0.0, 1.0);
  }

  if (materyal && 'metalness' in materyal) {
    const matMetal = (materyal as { metalness?: unknown }).metalness;
    if (typeof matMetal === 'number' && Number.isFinite(matMetal)) {
      return THREE.MathUtils.clamp(matMetal, 0.0, 1.0);
    }
  }

  return 0.04;
}

/**
 * Tekil bir mesh parçası için paylaşılan uniformlara bağlı su altı optiği ShaderMaterial oluşturur.
 */
export function suAltiCisimMateryaliOlustur(
  temelRenk: THREE.Color,
  puruzluluk: number,
  metaliklik: number,
  ortakUniformlar: OrtakOptikUniformlari,
  yuzeyYonu: THREE.Side = THREE.FrontSide,
): THREE.ShaderMaterial {
  const materyal = new THREE.ShaderMaterial({
    name: 'UnderwaterObjectShaderMateryali',
    uniforms: {
      uYukseklikDokusu: ortakUniformlar.uYukseklikDokusu,
      uKostikDokusu: ortakUniformlar.uKostikDokusu,
      uIsikYonu: ortakUniformlar.uIsikYonu,
      uKirilmaIndisi: ortakUniformlar.uKirilmaIndisi,
      uKostikYariBoyut: ortakUniformlar.uKostikYariBoyut,
      uKirilmaPassiMi: ortakUniformlar.uKirilmaPassiMi,
      uTemelRenk: { value: temelRenk },
      uPuruzluluk: { value: puruzluluk },
      uMetaliklik: { value: metaliklik },
    },
    vertexShader: SU_ALTI_CISIM_VERTEX_SHADER,
    fragmentShader: SU_ALTI_CISIM_FRAGMENT_SHADER,
    side: yuzeyYonu,
  });

  materyal.userData.suAltiOptikMateryaliMi = true;
  materyal.userData.ortakUniformReferansi = ortakUniformlar;
  return materyal;
}

/**
 * Verilen kök nesne altındaki tüm Mesh çocuklara su altı optik ShaderMaterial atar.
 * 7 yüzücü gibi çoklu alt gruplarda her parçanın renk/pürüzlülük/metalik özelliklerini
 * korur, aynı fiziksel özelliklere sahip materyalleri paylaşarak GPU durum değişimini azaltır
 * ve kullanılmayan eski materyalleri sızıntısız dispose eder.
 */
export function cisimlereSuAltiOptigiBagla(
  kokNesne: THREE.Object3D,
  ortakUniformlar?: OrtakOptikUniformlari,
  izlenenMateryaller?: Set<THREE.ShaderMaterial>,
): void {
  const aktifUniformlar = ortakUniformlar ?? varsayilanUniformOlustur();
  const eskiMateryaller = new Set<THREE.Material>();
  const yeniMateryaller = new Set<THREE.Material>();
  const donusumOnbellegi = new Map<string, THREE.ShaderMaterial>();

  const tekMateryalDonustur = (
    dugum: THREE.Mesh,
    kaynakMateryal?: THREE.Material,
  ): THREE.ShaderMaterial => {
    if (
      kaynakMateryal instanceof THREE.ShaderMaterial &&
      kaynakMateryal.userData?.suAltiOptikMateryaliMi === true &&
      kaynakMateryal.userData?.ortakUniformReferansi === aktifUniformlar
    ) {
      izlenenMateryaller?.add(kaynakMateryal);
      yeniMateryaller.add(kaynakMateryal);
      return kaynakMateryal;
    }

    if (kaynakMateryal) {
      eskiMateryaller.add(kaynakMateryal);
    }

    const temelRenk = temelRenkCikar(dugum, kaynakMateryal);
    const puruzluluk = puruzlulukCikar(dugum, kaynakMateryal);
    const metaliklik = metaliklikCikar(dugum, kaynakMateryal);
    const yuzeyYonu = kaynakMateryal?.side ?? THREE.FrontSide;
    const anahtar = `${temelRenk.r.toFixed(4)}_${temelRenk.g.toFixed(4)}_${temelRenk.b.toFixed(4)}_${puruzluluk.toFixed(3)}_${metaliklik.toFixed(3)}_${yuzeyYonu}`;

    const onbellekMateryal = donusumOnbellegi.get(anahtar);
    if (onbellekMateryal) {
      yeniMateryaller.add(onbellekMateryal);
      return onbellekMateryal;
    }

    const yeniMat = suAltiCisimMateryaliOlustur(
      temelRenk,
      puruzluluk,
      metaliklik,
      aktifUniformlar,
      yuzeyYonu,
    );
    donusumOnbellegi.set(anahtar, yeniMat);
    izlenenMateryaller?.add(yeniMat);
    yeniMateryaller.add(yeniMat);
    return yeniMat;
  };

  kokNesne.traverse((dugum) => {
    if (!(dugum instanceof THREE.Mesh)) {
      return;
    }

    const suAnkiMateryal = dugum.material;
    if (Array.isArray(suAnkiMateryal)) {
      dugum.material = suAnkiMateryal.map((parcaMat) =>
        tekMateryalDonustur(dugum, parcaMat),
      );
      return;
    }

    dugum.material = tekMateryalDonustur(dugum, suAnkiMateryal);
  });

  // Artık hiçbir mesh tarafından kullanılmayan eski standart materyalleri temizle
  for (const eskiMat of eskiMateryaller) {
    if (!yeniMateryaller.has(eskiMat)) {
      if (eskiMat instanceof THREE.ShaderMaterial) {
        izlenenMateryaller?.delete(eskiMat);
      }
      eskiMat.dispose();
    }
  }
}

/**
 * Dış modüller için UnderwaterObjectShader tanımı.
 */
export const UnderwaterObjectShader = {
  vertexShader: SU_ALTI_CISIM_VERTEX_SHADER,
  fragmentShader: SU_ALTI_CISIM_FRAGMENT_SHADER,
  materyalOlustur: suAltiCisimMateryaliOlustur,
  cisimlereBagla: cisimlereSuAltiOptigiBagla,
} as const;
