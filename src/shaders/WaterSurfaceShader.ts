import * as THREE from 'three';
import { HAVUZ_SABITLERI } from '../types/simulation';
import {
  ORTAK_GLSL_SABITLERI,
  ORTAK_SU_OKUMA_GLSL,
  type OrtakOptikUniformlari,
} from './CausticsShader';
import { ORTAK_FINA_DESEN_GLSL } from './PoolShader';

const SU_YUZEYI_VERTEX_SHADER = /* glsl */ `
  ${ORTAK_GLSL_SABITLERI}
  ${ORTAK_SU_OKUMA_GLSL}

  uniform sampler2D uYukseklikDokusu;

  varying vec3 vDunyaKonum;
  varying vec3 vSuNormal;
  varying vec2 vSuUV;

  void main() {
    vec2 suUV = dunyaXZdenSuUVye(position.xz);
    vec4 suVeri = suVerisiOku(uYukseklikDokusu, position.xz);
    float suY = clamp(suVeri.r, -0.35, HAVUZ_DUVAR_UST_Y - 0.02);

    vec3 yerelKonum = vec3(position.x, suY, position.z);
    vec4 dunyaKonum4 = modelMatrix * vec4(yerelKonum, 1.0);

    vDunyaKonum = dunyaKonum4.xyz;
    vSuNormal = suNormaliCoz(suVeri);
    vSuUV = suUV;

    gl_Position = projectionMatrix * viewMatrix * dunyaKonum4;
  }
`;

const SU_YUZEYI_FRAGMENT_SHADER = /* glsl */ `
  ${ORTAK_GLSL_SABITLERI}
  ${ORTAK_SU_OKUMA_GLSL}
  ${ORTAK_FINA_DESEN_GLSL}

  uniform sampler2D uYukseklikDokusu;
  uniform sampler2D uKostikDokusu;
  uniform sampler2D uKirilmaDokusu;
  uniform vec3 uIsikYonu;
  uniform float uKirilmaIndisi;
  uniform vec2 uKostikYariBoyut;
  uniform vec2 uEkranBoyutu;
  uniform float uZaman;
  uniform vec3 uCisimMerkezi;
  uniform float uCisimYaricapi;
  uniform vec3 uAltKureMerkezleri[MAKSIMUM_ALT_KURE_SAYISI];
  uniform float uAltKureYaricaplari[MAKSIMUM_ALT_KURE_SAYISI];
  uniform int uAltKureSayisi;

  varying vec3 vDunyaKonum;
  varying vec3 vSuNormal;
  varying vec2 vSuUV;

  // Olimpik havuz hacmi ([-8, 8] x [-2.80, suY] x [-16, 16]) içinde analitik Ray-Box çıkış hesabı
  float rayBoxHavuzKesisimi(
    vec3 baslangic,
    vec3 yon,
    out vec3 cikisNoktasi,
    out vec3 cikisNormali
  ) {
    float tx = yon.x > 0.0001
      ? (HAVUZ_MAK_X - baslangic.x) / yon.x
      : (yon.x < -0.0001 ? (HAVUZ_MIN_X - baslangic.x) / yon.x : 1e6);
    float tz = yon.z > 0.0001
      ? (HAVUZ_MAK_Z - baslangic.z) / yon.z
      : (yon.z < -0.0001 ? (HAVUZ_MIN_Z - baslangic.z) / yon.z : 1e6);
    float ty = yon.y < -0.0001
      ? (HAVUZ_TABAN_Y - baslangic.y) / yon.y
      : 1e6;

    float tMin = max(0.0, min(ty, min(tx, tz)));
    cikisNoktasi = baslangic + yon * tMin;

    if (ty <= tx && ty <= tz) {
      cikisNormali = vec3(0.0, 1.0, 0.0);
    } else if (tx <= tz) {
      cikisNormali = vec3(yon.x > 0.0 ? -1.0 : 1.0, 0.0, 0.0);
    } else {
      cikisNormali = vec3(0.0, 0.0, yon.z > 0.0 ? -1.0 : 1.0);
    }

    return tMin;
  }

  // Analitik havuz kesişim noktasında FINA kulvar çizgileri, kostik ve Beer-Lambert su altı rengi üretir
  vec3 analitikHavuzRengiHesapla(vec3 nokta, vec3 normal, vec3 isikYon, float kirilmaIndisi) {
    float derinlik = max(0.0, 0.0 - nokta.y);
    float eta = 1.0 / max(kirilmaIndisi, 1.0001);
    vec3 refIsin = refract(isikYon, vec3(0.0, 1.0, 0.0), eta);
    vec3 suIciIsik = length(refIsin) > 0.0001 ? normalize(-refIsin) : vec3(0.0, 1.0, 0.0);

    float tTaban = (HAVUZ_TABAN_Y - nokta.y) / min(refIsin.y, -0.05);
    vec3 tabanIzdusum = nokta + refIsin * tTaban;
    vec2 kostikUV = tabanXZdenKostikUVye(tabanIzdusum.xz, uKostikYariBoyut);
    vec3 kostik = (kostikUV.x >= 0.0 && kostikUV.x <= 1.0 && kostikUV.y >= 0.0 && kostikUV.y <= 1.0)
      ? texture2D(uKostikDokusu, kostikUV).rgb
      : vec3(0.0);

    // Prosedürel seramik karo + FINA kulvar çizgileri / dokunma plakası
    vec2 karoKoord = fract(nokta.xz * 2.0 + nokta.y * 2.0);
    float derz = smoothstep(0.02, 0.06, karoKoord.x) * smoothstep(0.02, 0.06, karoKoord.y);
    vec3 karoTemel = mix(vec3(0.54, 0.72, 0.80), vec3(0.78, 0.91, 0.96), derz);
    karoTemel = finaHavuzDeseniUygula(nokta, normal, karoTemel);

    float nDotL = max(0.0, dot(normal, suIciIsik));
    vec3 isik = vec3(0.18, 0.34, 0.44) + vec3(0.95) * nDotL * 0.68 + kostik * (0.25 + 0.75 * nDotL);
    return karoTemel * isik * beerLambertSogurulma(derinlik);
  }

  // Kapalı Olimpik Yüzme Salonu (Natatorium) tavan kafes makasları, LED arena projektörleri ve
  // yan yüksek pencere gün ışığı şeritlerinden oluşan 3B çevresel yansıma modeli
  vec3 natatoriumYansimasi(vec3 nokta, vec3 yansimaYon, vec3 isikYon) {
    vec3 isigaDogru = -isikYon;

    // 1. Önce su yüzeyinin hemen üzerindeki havuz iç bordür duvarı kontrolü (DUVAR_UST_Y = 0.18)
    if (yansimaYon.y < 0.45) {
      float txHavuz = yansimaYon.x > 0.0001
        ? (HAVUZ_MAK_X - nokta.x) / yansimaYon.x
        : (yansimaYon.x < -0.0001 ? (HAVUZ_MIN_X - nokta.x) / yansimaYon.x : 1e6);
      float tzHavuz = yansimaYon.z > 0.0001
        ? (HAVUZ_MAK_Z - nokta.z) / yansimaYon.z
        : (yansimaYon.z < -0.0001 ? (HAVUZ_MIN_Z - nokta.z) / yansimaYon.z : 1e6);
      float tHavuzDuvar = min(txHavuz, tzHavuz);

      if (tHavuzDuvar < 36.0) {
        vec3 duvarNokta = nokta + yansimaYon * tHavuzDuvar;
        if (duvarNokta.y < HAVUZ_DUVAR_UST_Y && duvarNokta.y >= HAVUZ_TABAN_Y) {
          vec3 duvarNormal = txHavuz < tzHavuz
            ? vec3(yansimaYon.x > 0.0 ? -1.0 : 1.0, 0.0, 0.0)
            : vec3(0.0, 0.0, yansimaYon.z > 0.0 ? -1.0 : 1.0);
          vec3 seramik = finaHavuzDeseniUygula(duvarNokta, duvarNormal, vec3(0.62, 0.78, 0.86));
          float duvarIsik = max(0.22, dot(duvarNormal, isigaDogru) * 0.75 + 0.30);
          float ustGecis = 1.0 - smoothstep(HAVUZ_DUVAR_UST_Y - 0.03, HAVUZ_DUVAR_UST_Y, duvarNokta.y);
          vec3 duvarRenk = seramik * duvarIsik;
          if (ustGecis > 0.95) {
            return duvarRenk;
          }
        }
      }
    }

    // 2. Kapalı Galatasaray Olimpik Natatorium salon hacmi (X ∈ [-20.0, 20.0], Z ∈ [-26.0, 26.0], Y_tavan = 16.2)
    const float SALON_YARI_X = 20.0;
    const float SALON_YARI_Z = 26.0;
    const float SALON_TAVAN_Y = 16.2;

    float txSalon = yansimaYon.x > 0.0001
      ? (SALON_YARI_X - nokta.x) / yansimaYon.x
      : (yansimaYon.x < -0.0001 ? (-SALON_YARI_X - nokta.x) / yansimaYon.x : 1e6);
    float tzSalon = yansimaYon.z > 0.0001
      ? (SALON_YARI_Z - nokta.z) / yansimaYon.z
      : (yansimaYon.z < -0.0001 ? (-SALON_YARI_Z - nokta.z) / yansimaYon.z : 1e6);
    float tyTavan = yansimaYon.y > 0.0001
      ? (SALON_TAVAN_Y - nokta.y) / yansimaYon.y
      : 1e6;

    float tSalon = min(tyTavan, min(txSalon, tzSalon));
    vec3 carpma = nokta + yansimaYon * tSalon;

    vec3 gsSari = vec3(0.98, 0.48, 0.004);
    vec3 gsKirmizi = vec3(0.39, 0.002, 0.03);
    vec3 yansimaRenk = vec3(0.08, 0.11, 0.15);

    if (tyTavan <= txSalon && tyTavan <= tzSalon && yansimaYon.y > 0.0001) {
      // --- YÜKSEK TAVAN (16.2m): Çelik kafes makasları ve yüksek tavan LED arena projektör şeritleri ---
      vec3 akustikTavan = vec3(0.06, 0.085, 0.125);

      // Z boyunca enine çelik makas kirişleri
      float makasMesafeZ = abs(fract((carpma.z + 4.0) / 8.0 + 0.5) - 0.5) * 8.0;
      float anaMakasMaske = 1.0 - smoothstep(0.24, 0.38, makasMesafeZ);

      // X boyunca boyuna ikincil çelik aşıklar
      float asikMesafeX = abs(fract(carpma.x / 3.5 + 0.5) - 0.5) * 3.5;
      float ikincilAsikMaske = 1.0 - smoothstep(0.08, 0.15, asikMesafeX);

      // Kafes çapraz doku vurgusu
      float kafesDokusu = 0.85 + 0.15 * sin(carpma.x * 3.2);
      vec3 celikRenk = vec3(0.18, 0.22, 0.28) * kafesDokusu;

      // Havuz boyunca 3 şeritli yüksek tavan LED arena projektörleri (X = -5.6, 0.0, +5.6)
      float ledX = min(abs(carpma.x), min(abs(carpma.x - 5.6), abs(carpma.x + 5.6)));
      float ledSeritEn = 1.0 - smoothstep(0.25, 0.44, ledX);
      float ledBoySinir = 1.0 - smoothstep(18.5, 20.5, abs(carpma.z));
      float ledAralikMaske = smoothstep(0.38, 0.65, makasMesafeZ);
      float ledMaske = ledSeritEn * ledBoySinir * ledAralikMaske;

      float ledMerkez = 1.0 - smoothstep(0.08, 0.24, ledX);
      vec3 ledRenk = mix(vec3(2.9, 3.2, 3.8), vec3(4.3, 4.4, 4.7), ledMerkez);

      float celikMaske = clamp(max(anaMakasMaske, ikincilAsikMaske * 0.7), 0.0, 1.0);
      yansimaRenk = mix(akustikTavan, celikRenk, celikMaske);
      yansimaRenk = mix(yansimaRenk, ledRenk, ledMaske * (1.0 - anaMakasMaske * 0.85));
    } else if (txSalon < tzSalon) {
      // --- YAN DUVARLAR: Galatasaray Sarı-Kırmızı tribünler/pankartlar ve yüksek pencereler ---
      float yukseklik = carpma.y;
      vec3 duvarTaban = vec3(0.10, 0.13, 0.18);

      // Alt tribün basamakları (0.0 .. 4.2m) - Sarı-Kırmızı koltuk blokları
      float tribunMaske = 1.0 - smoothstep(3.9, 4.3, yukseklik);
      float basamak = 0.65 + 0.35 * step(0.45, fract(yukseklik * 1.4));
      float gsBlok = step(0.5, fract(carpma.z * 0.24 + 0.5 * step(0.5, fract(yukseklik * 0.7))));
      vec3 tribunRenk = mix(gsKirmizi, gsSari * 0.75, gsBlok * 0.65) * (0.45 + 0.55 * basamak);
      yansimaRenk = mix(duvarTaban, tribunRenk, tribunMaske);

      // Galatasaray Sarı-Kırmızı arena pankart kuşağı (4.3m .. 5.5m)
      float pankartMaske = smoothstep(4.2, 4.35, yukseklik) * (1.0 - smoothstep(5.45, 5.65, yukseklik));
      float pankartSerit = step(0.45, fract((yukseklik - 4.2) * 1.6));
      float pankartParlak = 0.75 + 0.25 * step(0.5, fract(carpma.z * 0.45));
      vec3 pankartRenk = mix(gsKirmizi * 1.35, gsSari * 1.05, pankartSerit) * pankartParlak;
      yansimaRenk = mix(yansimaRenk, pankartRenk, pankartMaske * 0.92);

      // Yüksek clerestory gün ışığı pencere bandı (8.6m .. 13.8m)
      float pencereY = smoothstep(8.4, 8.8, yukseklik) * (1.0 - smoothstep(13.6, 14.0, yukseklik));
      float kolonFaz = abs(fract(carpma.z / 6.0 + 0.5) - 0.5) * 6.0;
      float pencereAciklik = 1.0 - smoothstep(2.1, 2.45, kolonFaz);
      float yatayKayit = smoothstep(0.08, 0.16, abs(yukseklik - 10.2));
      float pencereMaske = pencereY * pencereAciklik * yatayKayit;

      float gunesYonuEslesme = clamp(sign(carpma.x) * isigaDogru.x * 0.5 + 0.5, 0.0, 1.0);
      vec3 pencereIsik = mix(vec3(0.95, 1.25, 1.58), vec3(2.35, 2.45, 2.55), gunesYonuEslesme);
      yansimaRenk = mix(yansimaRenk, pencereIsik, pencereMaske);
    } else {
      // --- UÇ DUVARLAR: -Z duvarında Galatasaray skorboard panosu ve yüksek pencere bandı ---
      float yukseklik = carpma.y;
      yansimaRenk = vec3(0.095, 0.12, 0.17);

      // Yüksek uç duvar pencere bandı (9.2m .. 13.4m)
      float ustPencereY = smoothstep(9.0, 9.3, yukseklik) * (1.0 - smoothstep(13.2, 13.6, yukseklik));
      float kolonX = abs(fract(carpma.x / 3.2 + 0.5) - 0.5) * 3.2;
      float pencereAciklik = 1.0 - smoothstep(1.18, 1.32, kolonX);
      yansimaRenk = mix(yansimaRenk, vec3(0.92, 1.20, 1.50), ustPencereY * pencereAciklik);

      // Yalnızca -Z ucunda dev dijital skorboard panel parıltısı (X ∈ [-6.2, 6.2], Y ∈ [6.6, 12.2])
      if (carpma.z < 0.0) {
        float panoX = 1.0 - smoothstep(5.95, 6.25, abs(carpma.x));
        float panoY = smoothstep(6.5, 6.7, yukseklik) * (1.0 - smoothstep(12.1, 12.3, yukseklik));
        float panoMaske = panoX * panoY;
        float panoSatir = 0.65 + 0.35 * step(0.45, fract(yukseklik * 4.5));
        vec3 panoRenk = mix(gsKirmizi * 1.4, gsSari * 1.1, step(0.5, fract(carpma.x * 0.45))) * panoSatir;
        yansimaRenk = mix(yansimaRenk, panoRenk, panoMaske * 0.85);
      }
    }

    // 3. +Z ucundaki yüksek 10m Atlama Kulesi ve platformlarının su üstü yansıma silueti
    if (yansimaYon.z > 0.001) {
      float enYakinKuleT = tSalon;
      vec3 kuleRenk = vec3(0.0);
      bool kuleVuruldu = false;

      // Ana taşıyıcı beton/çelik kule gövdesi (Z ≈ 17.55m)
      float tGovde = (17.55 - nokta.z) / yansimaYon.z;
      if (tGovde > 0.0 && tGovde < enYakinKuleT) {
        vec3 govdeNokta = nokta + yansimaYon * tGovde;
        float govdeXMesafe = abs(govdeNokta.x - TRAMPLEN_KULVAR_X);
        if (govdeXMesafe < 1.1 && govdeNokta.y >= HAVUZ_DUVAR_UST_Y && govdeNokta.y <= TRAMPLEN_YUKSEKLIK_Y + 0.65) {
          enYakinKuleT = tGovde;
          kuleVuruldu = true;
          float kenarVurgu = smoothstep(0.75, 1.05, govdeXMesafe);
          vec3 dikeySerit = govdeNokta.x > TRAMPLEN_KULVAR_X ? gsSari * 0.85 : gsKirmizi * 1.15;
          kuleRenk = mix(vec3(0.14, 0.16, 0.21), dikeySerit, kenarVurgu * 0.8);
        }
      }

      // 3m, 5m, 7.5m ve 10m tramplen platform çıkıntıları (Z ∈ [TRAMPLEN_UC_Z, 17.8])
      if (yansimaYon.y > 0.001) {
        float platformYukseklikleri[4];
        platformYukseklikleri[0] = 3.0;
        platformYukseklikleri[1] = 5.0;
        platformYukseklikleri[2] = 7.5;
        platformYukseklikleri[3] = TRAMPLEN_YUKSEKLIK_Y;

        for (int i = 0; i < 4; i++) {
          float platY = platformYukseklikleri[i];
          float tPlat = (platY - nokta.y) / yansimaYon.y;
          if (tPlat > 0.0 && tPlat < enYakinKuleT) {
            vec3 platNokta = nokta + yansimaYon * tPlat;
            float platXMesafe = abs(platNokta.x - TRAMPLEN_KULVAR_X);
            if (platXMesafe < 0.95 && platNokta.z >= TRAMPLEN_UC_Z && platNokta.z <= 17.8) {
              enYakinKuleT = tPlat;
              kuleVuruldu = true;
              float ucSerit = 1.0 - smoothstep(TRAMPLEN_UC_Z, TRAMPLEN_UC_Z + 0.28, platNokta.z);
              kuleRenk = mix(vec3(0.16, 0.18, 0.23), gsSari * 0.95, ucSerit);
            }
          }
        }
      }

      if (kuleVuruldu) {
        yansimaRenk = kuleRenk;
      }
    }

    // Güverte zemin seviyesi yakınında suya bakan hafif Galatasaray sıcak ortam dolgusu
    float ufukDolgu = 1.0 - smoothstep(0.0, 0.35, max(0.0, yansimaYon.y));
    yansimaRenk += vec3(0.06, 0.08, 0.11) * ufukDolgu;

    return yansimaRenk;
  }

  // Su yüzeyi ile cismin alt küreleri/sınır küresi arasındaki temas halkası parıltısını hesaplar
  float cisimSuTemasPariltisi(vec3 suNoktasi, float dalgaEgimi) {
    float enYakinHalka = 0.0;

    if (uAltKureSayisi > 0) {
      for (int i = 0; i < MAKSIMUM_ALT_KURE_SAYISI; i++) {
        if (i >= uAltKureSayisi) {
          break;
        }
        float r = uAltKureYaricaplari[i];
        if (r <= 0.001) {
          continue;
        }
        float mesafe = distance(suNoktasi, uAltKureMerkezleri[i]);
        float temasMesafesi = abs(mesafe - r);
        float halka = 1.0 - smoothstep(0.0, 0.065, temasMesafesi);
        enYakinHalka = max(enYakinHalka, halka);
      }
    } else if (uCisimYaricapi > 0.001) {
      float mesafe = distance(suNoktasi, uCisimMerkezi);
      enYakinHalka = 1.0 - smoothstep(0.0, 0.07, abs(mesafe - uCisimYaricapi));
    }

    float dalgaMod = 0.55 + 0.45 * clamp(dalgaEgimi * 5.0, 0.0, 1.0);
    return enYakinHalka * dalgaMod;
  }

  void main() {
    // Piksel düzeyinde HeightfieldTexture normal örneklemesi
    vec4 suVeri = suVerisiOku(uYukseklikDokusu, vDunyaKonum.xz);
    vec3 birlesikNormal = vSuNormal + suNormaliCoz(suVeri) * 3.0;
    vec3 hamSuNormal = length(birlesikNormal) > 0.0001
      ? normalize(birlesikNormal)
      : vec3(0.0, 1.0, 0.0);
    float dalgaEgimi = length(hamSuNormal.xz);

    vec3 bakisFarki = vDunyaKonum - cameraPosition;
    vec3 V = length(bakisFarki) > 0.0001
      ? normalize(bakisFarki)
      : vec3(0.0, -1.0, 0.0);
    bool suUstundenBakis = dot(V, hamSuNormal) <= 0.0;

    vec3 normalYuzey = suUstundenBakis ? hamSuNormal : -hamSuNormal;
    float kirilmaIndisi = max(uKirilmaIndisi, 1.0001);
    float eta = suUstundenBakis ? (1.0 / kirilmaIndisi) : kirilmaIndisi;

    vec3 isikYon = normalize(uIsikYonu);
    vec3 kirilanYon = refract(V, normalYuzey, eta);
    bool tamIcYansimaMi = length(kirilanYon) < 0.001;
    vec3 guvenliKirilanYon = tamIcYansimaMi
      ? vec3(0.0, suUstundenBakis ? -1.0 : 1.0, 0.0)
      : normalize(kirilanYon);

    // Schlick Fresnel yaklaşımı (ANGLE Metal zero-NaN güvenli; negatif tabanlı pow kullanılmaz)
    float f0Kok = (1.0 - kirilmaIndisi) / (1.0 + kirilmaIndisi);
    float F0 = f0Kok * f0Kok;
    float cosTheta = clamp(dot(normalYuzey, -V), 0.0, 1.0);
    float fresnel = tamIcYansimaMi
      ? 1.0
      : clamp(F0 + (1.0 - F0) * pow(max(0.0001, 1.0 - cosTheta), 5.0), 0.0, 1.0);

    // Kırılma ekran UV sapması
    vec2 ekranUV = gl_FragCoord.xy / max(uEkranBoyutu, vec2(1.0));
    float kirilmaGucu = 0.078 * ((kirilmaIndisi - 1.0) / 0.333);
    vec3 egimVektor = vec3(normalYuzey.x, 0.0, normalYuzey.z);
    vec2 sapmaEkran = (viewMatrix * vec4(egimVektor, 0.0)).xy * kirilmaGucu;
    sapmaEkran = clamp(sapmaEkran, vec2(-0.055), vec2(0.055));

    vec2 hamKirilmaUV = ekranUV + sapmaEkran;
    vec2 kirilmaUV = clamp(hamKirilmaUV, 0.002, 0.998);
    vec3 kirilanSahneRenk = texture2D(uKirilmaDokusu, kirilmaUV).rgb;

    vec3 kirilmaRenk = kirilanSahneRenk;
    vec3 yansimaRenk = vec3(0.0);
    vec3 spekulerRenk = vec3(0.0);

    if (suUstundenBakis) {
      // Analitik Ray-Box havuz kesişimi ile optik yol derinliği ve kenar doğrulaması
      vec3 cikisNoktasi;
      vec3 cikisNormali;
      float optikYolMesafesi = rayBoxHavuzKesisimi(
        vDunyaKonum,
        guvenliKirilanYon,
        cikisNoktasi,
        cikisNormali
      );

      float dikeyMesafe = max(0.0, vDunyaKonum.y - cikisNoktasi.y);
      float ekstraEgrilikYolu = max(0.0, optikYolMesafesi - dikeyMesafe);
      vec3 ekSogurulma = exp(-vec3(0.36, 0.08, 0.03) * ekstraEgrilikYolu * 0.45);
      kirilmaRenk = kirilanSahneRenk * ekSogurulma;

      // Ekran kenarı UV kırpılması durumunda FINA çizgili analitik havuz yedeği ile geçiş
      float kenarTasma = max(
        max(0.0 - hamKirilmaUV.x, hamKirilmaUV.x - 1.0),
        max(0.0 - hamKirilmaUV.y, hamKirilmaUV.y - 1.0)
      );
      if (kenarTasma > 0.0) {
        vec3 analitikRenk = analitikHavuzRengiHesapla(
          cikisNoktasi,
          cikisNormali,
          isikYon,
          kirilmaIndisi
        );
        kirilmaRenk = mix(kirilmaRenk, analitikRenk, smoothstep(0.0, 0.035, kenarTasma));
      }

      // Hacimsel su içi turkuaz derinlik katkısı
      float hacimKatkisi = 1.0 - exp(-0.055 * optikYolMesafesi);
      kirilmaRenk = mix(kirilmaRenk, vec3(0.03, 0.24, 0.36), hacimKatkisi * 0.22);

      // Natatorium tavan kafesi, arena LED projektörleri ve pencere gün ışığı yansıması
      vec3 yansimaYon = normalize(reflect(V, normalYuzey));
      yansimaRenk = natatoriumYansimasi(vDunyaKonum, yansimaYon, isikYon);

      // Keskin ana arena/güneş ışığı speküler parlaması
      vec3 yarimToplam = -V + (-isikYon);
      vec3 yarimVektor = length(yarimToplam) > 0.0001 ? normalize(yarimToplam) : normalYuzey;
      float nDotH = max(0.0001, dot(normalYuzey, yarimVektor));
      float keskinParlama = pow(nDotH, 240.0) * 3.0;
      float genisParlama = pow(nDotH, 48.0) * 0.14;
      spekulerRenk = vec3(1.0, 0.98, 0.93) * (keskinParlama + genisParlama);
    } else {
      // Su altı kamera bakışı: Snell penceresi ve Tam İç Yansıma (TIR)
      float kameraMesafesi = length(vDunyaKonum - cameraPosition);
      kirilmaRenk = kirilanSahneRenk * beerLambertSogurulma(kameraMesafesi * 0.65);

      vec3 yansimaYon = normalize(reflect(V, normalYuzey));
      vec3 tirCikisNoktasi;
      vec3 tirCikisNormali;
      float tirMesafe = rayBoxHavuzKesisimi(
        vDunyaKonum,
        yansimaYon,
        tirCikisNoktasi,
        tirCikisNormali
      );
      yansimaRenk = analitikHavuzRengiHesapla(
        tirCikisNoktasi,
        tirCikisNormali,
        isikYon,
        kirilmaIndisi
      ) * exp(-vec3(0.36, 0.08, 0.03) * tirMesafe * 0.2);
    }

    // Duvar kenarı menisküsü ve cisim su teması köpük/parıltısı
    float duvarKenarMesafe = min(
      HAVUZ_MAK_X - abs(vDunyaKonum.x),
      HAVUZ_MAK_Z - abs(vDunyaKonum.z)
    );
    float duvarMeniskus = (1.0 - smoothstep(0.0, 0.055, duvarKenarMesafe)) *
      (0.35 + 0.65 * clamp(abs(vDunyaKonum.y) * 8.0 + dalgaEgimi * 3.0, 0.0, 1.0));
    float cisimTemas = cisimSuTemasPariltisi(vDunyaKonum, dalgaEgimi);

    float mikroTitreme = 0.92 + 0.08 * sin(vDunyaKonum.x * 24.0 + uZaman * 3.0);
    vec3 temasKopukRenk = vec3(0.78, 0.93, 0.98) *
      (duvarMeniskus * 0.18 + cisimTemas * 0.30) * mikroTitreme;

    vec3 lineerRenk = mix(kirilmaRenk, yansimaRenk, fresnel) + spekulerRenk + temasKopukRenk;

    gl_FragColor = vec4(lineerRenk, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * 255x511 segmentli (256x512 köşe noktalı) 16m x 32m dalgalı su yüzeyi mesh'ini oluşturur.
 */
export function suYuzeyiOlustur(
  ortakUniformlar: OrtakOptikUniformlari,
): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const segmentX = HAVUZ_SABITLERI.GPGPU_COZUNURLUK_X - 1;
  const segmentZ = HAVUZ_SABITLERI.GPGPU_COZUNURLUK_Z - 1;
  const geometri = new THREE.PlaneGeometry(
    HAVUZ_SABITLERI.GENISLIK_X,
    HAVUZ_SABITLERI.UZUNLUK_Z,
    segmentX,
    segmentZ,
  );
  geometri.rotateX(-Math.PI / 2);

  const materyal = new THREE.ShaderMaterial({
    name: 'WaterSurfaceShaderMateryali',
    uniforms: {
      uYukseklikDokusu: ortakUniformlar.uYukseklikDokusu,
      uKostikDokusu: ortakUniformlar.uKostikDokusu,
      uKirilmaDokusu: ortakUniformlar.uKirilmaDokusu,
      uIsikYonu: ortakUniformlar.uIsikYonu,
      uKirilmaIndisi: ortakUniformlar.uKirilmaIndisi,
      uKostikYariBoyut: ortakUniformlar.uKostikYariBoyut,
      uEkranBoyutu: ortakUniformlar.uEkranBoyutu,
      uZaman: ortakUniformlar.uZaman,
      uCisimMerkezi: ortakUniformlar.uCisimMerkezi,
      uCisimYaricapi: ortakUniformlar.uCisimYaricapi,
      uAltKureMerkezleri: ortakUniformlar.uAltKureMerkezleri,
      uAltKureYaricaplari: ortakUniformlar.uAltKureYaricaplari,
      uAltKureSayisi: ortakUniformlar.uAltKureSayisi,
    },
    vertexShader: SU_YUZEYI_VERTEX_SHADER,
    fragmentShader: SU_YUZEYI_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: false,
  });

  const mesh = new THREE.Mesh(geometri, materyal);
  mesh.name = 'OptikSuYuzeyi';
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Dış modüller için WaterSurfaceShader tanımı.
 */
export const WaterSurfaceShader = {
  vertexShader: SU_YUZEYI_VERTEX_SHADER,
  fragmentShader: SU_YUZEYI_FRAGMENT_SHADER,
  suYuzeyiOlustur,
} as const;
