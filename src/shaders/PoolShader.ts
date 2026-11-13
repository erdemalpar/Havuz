import * as THREE from 'three';
import {
  ORTAK_GLSL_SABITLERI,
  ORTAK_GOLGE_GLSL,
  ORTAK_SU_OKUMA_GLSL,
  type OrtakOptikUniformlari,
} from './CausticsShader';

/**
 * Tabandaki 6 kulvar FINA T-çizgileri ve uç duvarlardaki sarı/siyah dokunma plakalarını
 * hem PoolShader hem de WaterSurfaceShader kırılma/yansıma yedeği için ortak olarak üretir.
 */
export const ORTAK_FINA_DESEN_GLSL = /* glsl */ `
  vec3 finaHavuzDeseniUygula(vec3 dunyaKonum, vec3 dunyaNormal, vec3 karoRenk) {
    float kulvarGenisligi = HAVUZ_GENISLIK_X / float(KULVAR_SAYISI);
    float yerX = clamp(dunyaKonum.x, HAVUZ_MIN_X + 0.001, HAVUZ_MAK_X - 0.001) - HAVUZ_MIN_X;
    float kulvarFaz = fract(yerX / kulvarGenisligi) - 0.5;
    float merkezUzaklikX = abs(kulvarFaz) * kulvarGenisligi;

    vec3 sonucRenk = karoRenk;

    // 1. Havuz tabanında 6 kulvar boyunca uzanan koyu lacivert FINA çizgileri ve T dönüş işaretleri
    if (dunyaNormal.y > 0.7 && dunyaKonum.y < HAVUZ_TABAN_Y + 0.08) {
      float anaCizgiX = 1.0 - smoothstep(0.118, 0.132, merkezUzaklikX);
      float anaCizgiZ = 1.0 - smoothstep(6.78, 6.82, abs(dunyaKonum.z));
      float anaCizgiMaske = anaCizgiX * anaCizgiZ;

      float tBaslikX = 1.0 - smoothstep(0.47, 0.49, merkezUzaklikX);
      float tBaslikZ = smoothstep(6.78, 6.82, abs(dunyaKonum.z)) *
        (1.0 - smoothstep(7.03, 7.07, abs(dunyaKonum.z)));
      float tMaske = tBaslikX * tBaslikZ;

      float cizgiMaske = clamp(max(anaCizgiMaske, tMaske), 0.0, 1.0);
      vec3 cizgiSeramik = vec3(0.018, 0.032, 0.085) * (0.82 + 0.30 * karoRenk);
      sonucRenk = mix(sonucRenk, cizgiSeramik, cizgiMaske);
    }

    // 2. İki uç duvarda (Z = -8.0 ve Z = +8.0) her kulvar merkezinde Galatasaray Sarı-Kırmızı dokunma plakaları
    if (abs(dunyaNormal.z) > 0.7 && abs(dunyaKonum.z) > HAVUZ_MAK_Z - 0.08) {
      float plakaX = 1.0 - smoothstep(0.55, 0.57, merkezUzaklikX);
      float plakaY = smoothstep(-0.83, -0.81, dunyaKonum.y) *
        (1.0 - smoothstep(0.09, 0.11, dunyaKonum.y));
      float plakaMaske = clamp(plakaX * plakaY, 0.0, 1.0);

      if (plakaMaske > 0.001) {
        float disCerceve = max(
          smoothstep(0.49, 0.51, merkezUzaklikX),
          max(
            smoothstep(0.03, 0.05, dunyaKonum.y),
            1.0 - smoothstep(-0.78, -0.76, dunyaKonum.y)
          )
        );

        float dikeyHedef = (1.0 - smoothstep(0.11, 0.13, merkezUzaklikX)) *
          smoothstep(-0.69, -0.67, dunyaKonum.y) *
          (1.0 - smoothstep(-0.11, -0.09, dunyaKonum.y));
        float yatayHedef = (1.0 - smoothstep(0.35, 0.37, merkezUzaklikX)) *
          (1.0 - smoothstep(0.05, 0.07, abs(dunyaKonum.y + 0.39)));

        float olukDesen = step(0.78, fract((dunyaKonum.y + 2.0) * 14.0)) * 0.55;
        float kirmiziOrani = clamp(max(disCerceve, max(max(dikeyHedef, yatayHedef), olukDesen)), 0.0, 1.0);

        // Galatasaray Sarısı (#FDB912 -> lineer sRGB) ve Koyu Galatasaray Kırmızısı (#A90432 -> lineer sRGB)
        vec3 gsSari = vec3(0.98, 0.48, 0.004);
        vec3 gsKirmizi = vec3(0.39, 0.002, 0.03);
        vec3 plakaRenk = mix(gsSari, gsKirmizi, kirmiziOrani);

        sonucRenk = mix(sonucRenk, plakaRenk, plakaMaske);
      }
    }

    return sonucRenk;
  }
`;

const HAVUZ_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDunyaKonum;
  varying vec3 vDunyaNormal;
  varying vec2 vUv;

  void main() {
    vec4 dunyaKonum4 = modelMatrix * vec4(position, 1.0);
    vDunyaKonum = dunyaKonum4.xyz;

    // Ölçeklenmiş eksenlerde bile doğru dünya normali için sütun kare uzunluklarına bölünür
    mat3 m = mat3(modelMatrix);
    vec3 olcekKare = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
    vDunyaNormal = normalize(m * (normal / max(olcekKare, vec3(0.0001))));
    vUv = uv;

    gl_Position = projectionMatrix * viewMatrix * dunyaKonum4;
  }
`;

const HAVUZ_FRAGMENT_SHADER = /* glsl */ `
  ${ORTAK_GLSL_SABITLERI}
  ${ORTAK_SU_OKUMA_GLSL}
  ${ORTAK_GOLGE_GLSL}
  ${ORTAK_FINA_DESEN_GLSL}

  uniform sampler2D uKaroDokusu;
  uniform sampler2D uYukseklikDokusu;
  uniform sampler2D uKostikDokusu;
  uniform sampler2D uSuAltiGolgeDokusu;
  uniform mat4 uIsikGolgeMatrisi;
  uniform vec3 uIsikYonu;
  uniform float uKirilmaIndisi;
  uniform vec2 uKostikYariBoyut;
  uniform float uGolgeKodlamaModu;
  uniform float uKirilmaPassiMi;
  uniform vec3 uAltKureMerkezleri[MAKSIMUM_ALT_KURE_SAYISI];
  uniform float uAltKureYaricaplari[MAKSIMUM_ALT_KURE_SAYISI];
  uniform int uAltKureSayisi;

  varying vec3 vDunyaKonum;
  varying vec3 vDunyaNormal;
  varying vec2 vUv;

  // Havuz duvarlarının kendi iç duvarlarına ve tabanına düşürdüğü yumuşak gölgeyi hesaplar
  float havuzDuvarGolgesiHesapla(vec3 nokta, vec3 suIciIsikYonu, vec3 havaIsikYonu) {
    float txSu = suIciIsikYonu.x > 0.0001
      ? (HAVUZ_MAK_X - nokta.x) / suIciIsikYonu.x
      : (suIciIsikYonu.x < -0.0001 ? (HAVUZ_MIN_X - nokta.x) / suIciIsikYonu.x : 1e6);
    float tzSu = suIciIsikYonu.z > 0.0001
      ? (HAVUZ_MAK_Z - nokta.z) / suIciIsikYonu.z
      : (suIciIsikYonu.z < -0.0001 ? (HAVUZ_MIN_Z - nokta.z) / suIciIsikYonu.z : 1e6);
    float tDuvarSu = min(txSu, tzSu);
    float tSu = (0.0 - nokta.y) / max(suIciIsikYonu.y, 0.05);

    if (tDuvarSu < tSu - 0.01) {
      float mesafeFarki = tSu - tDuvarSu;
      return mix(1.0, 0.42, smoothstep(0.0, 0.14, mesafeFarki));
    }

    vec3 suGiris = nokta + suIciIsikYonu * tSu;
    float tUst = HAVUZ_DUVAR_UST_Y / max(havaIsikYonu.y, 0.05);
    vec3 ustCikis = suGiris + havaIsikYonu * tUst;
    float tasma = max(abs(ustCikis.x) - HAVUZ_MAK_X, abs(ustCikis.z) - HAVUZ_MAK_Z);
    return mix(1.0, 0.48, smoothstep(0.0, 0.12, tasma));
  }

  void main() {
    vec3 normalYuzey = normalize(vDunyaNormal);
    vec3 gorusFarki = cameraPosition - vDunyaKonum;
    vec3 gorusYon = length(gorusFarki) > 0.0001
      ? normalize(gorusFarki)
      : vec3(0.0, 1.0, 0.0);

    vec3 hamKaroRenk = texture2D(uKaroDokusu, vUv).rgb;
    vec3 karoRenk = finaHavuzDeseniUygula(vDunyaKonum, normalYuzey, hamKaroRenk);

    // Olimpik havuz iç köşelerinde ve taban birleşimlerinde doğal ortam kapanması (AO)
    float xKenar = smoothstep(HAVUZ_MAK_X - 0.35, HAVUZ_MAK_X, abs(vDunyaKonum.x));
    float zKenar = smoothstep(HAVUZ_MAK_Z - 0.35, HAVUZ_MAK_Z, abs(vDunyaKonum.z));
    float tabanKenar = 1.0 - smoothstep(HAVUZ_TABAN_Y, HAVUZ_TABAN_Y + 0.32, vDunyaKonum.y);
    float koseAO = 1.0 - 0.16 * (xKenar * zKenar * 0.65 + (xKenar + zKenar) * tabanKenar * 0.45);
    karoRenk *= clamp(koseAO, 0.78, 1.0);

    vec4 suVeri = suVerisiOku(uYukseklikDokusu, vDunyaKonum.xz);
    float suY = suVeri.r;

    bool icHavuzMu =
      abs(vDunyaKonum.x) <= HAVUZ_MAK_X + 0.025 &&
      abs(vDunyaKonum.z) <= HAVUZ_MAK_Z + 0.025 &&
      vDunyaKonum.y <= HAVUZ_DUVAR_UST_Y + 0.02;

    vec3 isikYon = normalize(uIsikYonu);
    vec3 havaIsigaDogru = -isikYon;
    vec3 lineerRenk = vec3(0.0);

    if (icHavuzMu && vDunyaKonum.y < suY) {
      // --- SU ALTI HAVUZ OPTİĞİ ---
      float derinlik = max(0.0, suY - vDunyaKonum.y);
      float eta = 1.0 / max(uKirilmaIndisi, 1.0001);
      vec3 referansIsin = refract(isikYon, vec3(0.0, 1.0, 0.0), eta);
      vec3 suIciIsigaDogru = length(referansIsin) > 0.0001
        ? normalize(-referansIsin)
        : vec3(0.0, 1.0, 0.0);

      // Kırılan referans ışını boyunca tabana izdüşüm ile dikdörtgen kostik dokusunu örnekle
      float tTaban = (HAVUZ_TABAN_Y - vDunyaKonum.y) / min(referansIsin.y, -0.05);
      vec3 tabanIzdusum = vDunyaKonum + referansIsin * tTaban;
      vec2 kostikUV = tabanXZdenKostikUVye(tabanIzdusum.xz, uKostikYariBoyut);

      vec3 kostikIsik = vec3(0.0);
      if (kostikUV.x >= 0.0 && kostikUV.x <= 1.0 && kostikUV.y >= 0.0 && kostikUV.y <= 1.0) {
        kostikIsik = texture2D(uKostikDokusu, kostikUV).rgb;
      }

      // 3x3 PCF ile yüksek çözünürlüklü su altı cisim gölgesi + alt küre desteği
      float haritaGorunurluk = suAltiGolgeHaritasiOrnekle(
        uSuAltiGolgeDokusu,
        uIsikGolgeMatrisi,
        vDunyaKonum,
        uGolgeKodlamaModu,
        1.45
      );
      float kureGorunurluk = altKureGolgeOraniHesapla(
        vDunyaKonum,
        suIciIsigaDogru,
        uAltKureMerkezleri,
        uAltKureYaricaplari,
        uAltKureSayisi
      );
      float cisimGorunurlugu = min(haritaGorunurluk, mix(0.15, 1.0, kureGorunurluk));
      float duvarGorunurlugu = havuzDuvarGolgesiHesapla(vDunyaKonum, suIciIsigaDogru, havaIsigaDogru);

      float nDotL = max(0.0, dot(normalYuzey, suIciIsigaDogru));
      float toplamAydinlik = cisimGorunurlugu * duvarGorunurlugu;

      // Su yüzeyi kenar çizgisinin hemen altında ince dalga gölgesi
      float meniskusGolge = mix(0.86, 1.0, smoothstep(0.0, 0.045, derinlik));

      vec3 ortamIsik = vec3(0.18, 0.34, 0.44) * (0.75 + 0.25 * normalYuzey.y);
      vec3 gunesDifuz = vec3(1.0, 0.98, 0.94) * nDotL * 0.80 * toplamAydinlik;
      vec3 kostikKatki = kostikIsik * (0.22 + 0.78 * nDotL) * duvarGorunurlugu * 0.95;

      vec3 sogurulma = beerLambertSogurulma(derinlik);
      vec3 aydinlatilmisKaro = karoRenk * (ortamIsik + gunesDifuz + kostikKatki) * meniskusGolge;
      lineerRenk = aydinlatilmisKaro * sogurulma;

      // Derinlikle artan hafif su içi hacimsel saçılım
      float hacimSisOrani = 1.0 - exp(-0.072 * derinlik);
      lineerRenk = mix(lineerRenk, vec3(0.025, 0.19, 0.31) * (0.45 + 0.55 * toplamAydinlik), hacimSisOrani);
    } else {
      // --- SU ÜSTÜ DUVAR VE DIŞ KENAR ---
      float islakMesafe = vDunyaKonum.y - suY;
      float islakBant = icHavuzMu
        ? (1.0 - smoothstep(0.0, 0.06, islakMesafe)) * step(0.0, islakMesafe)
        : 0.0;

      float suUstuGolge = icHavuzMu
        ? suAltiGolgeHaritasiOrnekle(
            uSuAltiGolgeDokusu,
            uIsikGolgeMatrisi,
            vDunyaKonum,
            uGolgeKodlamaModu,
            1.2
          )
        : 1.0;

      float nDotL = max(0.0, dot(normalYuzey, havaIsigaDogru));
      vec3 yarimToplam = havaIsigaDogru + gorusYon;
      vec3 yarimVektor = length(yarimToplam) > 0.0001 ? normalize(yarimToplam) : normalYuzey;
      float spekulerUs = mix(36.0, 128.0, islakBant);
      float spekulerGuc = mix(0.14, 0.62, islakBant);
      float spekuler = pow(max(0.0001, dot(normalYuzey, yarimVektor)), spekulerUs) * spekulerGuc * suUstuGolge;

      vec3 salonOrtam = mix(vec3(0.24, 0.28, 0.33), vec3(0.38, 0.46, 0.56), normalYuzey.y * 0.5 + 0.5);
      vec3 gunesKatki = vec3(1.0, 0.97, 0.92) * nDotL * 0.90 * suUstuGolge;

      vec3 islakKaro = karoRenk * mix(1.0, 0.66, islakBant);
      lineerRenk = islakKaro * (salonOrtam + gunesKatki) + vec3(1.0, 0.98, 0.94) * spekuler;
    }

    if (uKirilmaPassiMi > 0.5) {
      gl_FragColor = vec4(lineerRenk, 1.0);
      return;
    }

    gl_FragColor = vec4(lineerRenk, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Olimpik havuz iç duvarları ve tabanı için su altı/su üstü optikli ShaderMaterial oluşturur.
 */
export function havuzMateryaliOlustur(
  karoDokusu: THREE.Texture,
  ortakUniformlar: OrtakOptikUniformlari,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'PoolShaderMateryali',
    uniforms: {
      uKaroDokusu: { value: karoDokusu },
      uYukseklikDokusu: ortakUniformlar.uYukseklikDokusu,
      uKostikDokusu: ortakUniformlar.uKostikDokusu,
      uSuAltiGolgeDokusu: ortakUniformlar.uSuAltiGolgeDokusu,
      uIsikGolgeMatrisi: ortakUniformlar.uIsikGolgeMatrisi,
      uIsikYonu: ortakUniformlar.uIsikYonu,
      uKirilmaIndisi: ortakUniformlar.uKirilmaIndisi,
      uKostikYariBoyut: ortakUniformlar.uKostikYariBoyut,
      uGolgeKodlamaModu: ortakUniformlar.uGolgeKodlamaModu,
      uKirilmaPassiMi: ortakUniformlar.uKirilmaPassiMi,
      uAltKureMerkezleri: ortakUniformlar.uAltKureMerkezleri,
      uAltKureYaricaplari: ortakUniformlar.uAltKureYaricaplari,
      uAltKureSayisi: ortakUniformlar.uAltKureSayisi,
    },
    vertexShader: HAVUZ_VERTEX_SHADER,
    fragmentShader: HAVUZ_FRAGMENT_SHADER,
    side: THREE.FrontSide,
  });
}

/**
 * Dış modüller için PoolShader tanımı.
 */
export const PoolShader = {
  vertexShader: HAVUZ_VERTEX_SHADER,
  fragmentShader: HAVUZ_FRAGMENT_SHADER,
  materyalOlustur: havuzMateryaliOlustur,
} as const;
