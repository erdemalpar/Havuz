import * as THREE from 'three';

const DOKU_BOYUTU = 512;
const IZGARA_ADETI = 16;
const HUCRE_BOYUTU = DOKU_BOYUTU / IZGARA_ADETI;
const DERZ_YARI_KALINLIK = 1.5;

/**
 * Verilen tam sayı tohumdan deterministik [0, 1) aralığında sözde rastgele sayı üretir.
 */
function sozdeRastgeleUret(tohum: number): number {
  const deger = Math.sin(tohum * 12.9898 + 78.233) * 43758.5453123;
  return deger - Math.floor(deger);
}

/**
 * Tuval zeminine hafif dokulu açık gri/beyazımsı derz tabakası çizer.
 */
function derzZeminiCiz(baglam: CanvasRenderingContext2D): void {
  baglam.fillStyle = '#e5eef2';
  baglam.fillRect(0, 0, DOKU_BOYUTU, DOKU_BOYUTU);

  // Derz yüzeyinde doğal harç hissi için çok hafif noktasal doku
  for (let i = 0; i < 900; i += 1) {
    const x = sozdeRastgeleUret(i * 3 + 1) * DOKU_BOYUTU;
    const y = sozdeRastgeleUret(i * 3 + 2) * DOKU_BOYUTU;
    const opaklik = 0.03 + sozdeRastgeleUret(i * 3 + 3) * 0.05;
    baglam.fillStyle = i % 2 === 0 ? `rgba(180, 198, 208, ${opaklik})` : `rgba(255, 255, 255, ${opaklik})`;
    baglam.fillRect(x, y, 2, 2);
  }
}

/**
 * Tek bir seramik mozaik karoyu iç gradyan, sırlı cam parlaklığı ve ince kenar gölgesiyle çizer.
 */
function tekKaroCiz(
  baglam: CanvasRenderingContext2D,
  satir: number,
  sutun: number,
): void {
  const x = sutun * HUCRE_BOYUTU + DERZ_YARI_KALINLIK;
  const y = satir * HUCRE_BOYUTU + DERZ_YARI_KALINLIK;
  const boyut = HUCRE_BOYUTU - DERZ_YARI_KALINLIK * 2;
  const tohumTabani = satir * 97 + sutun * 31 + 7;

  const tonSapma = sozdeRastgeleUret(tohumTabani);
  const doygunlukSapma = sozdeRastgeleUret(tohumTabani + 1);
  const parlaklikSapma = sozdeRastgeleUret(tohumTabani + 2);
  const vurguSansi = sozdeRastgeleUret(tohumTabani + 3);

  // Açık turkuaz, deniz mavisi ve buz mavisi aralığında organik renk tonları
  let ton = 188 + tonSapma * 15; // 188..203 HSL
  let doygunluk = 56 + doygunlukSapma * 20; // %56..%76
  let parlaklik = 58 + parlaklikSapma * 18; // %58..%76

  // Mozaikte doğal çeşitlilik için bazı karolarda açık buz mavisi veya derin turkuaz tonu
  if (vurguSansi > 0.88) {
    ton = 196;
    doygunluk = 45;
    parlaklik = 80;
  } else if (vurguSansi < 0.12) {
    ton = 185;
    doygunluk = 72;
    parlaklik = 52;
  }

  // Sırlı seramik yüzeyin hafif iç ışıltı gradyanı
  const icGradyan = baglam.createLinearGradient(x, y, x + boyut, y + boyut);
  icGradyan.addColorStop(0, `hsl(${ton.toFixed(1)}, ${doygunluk.toFixed(1)}%, ${(parlaklik + 8).toFixed(1)}%)`);
  icGradyan.addColorStop(0.55, `hsl(${(ton + 1.5).toFixed(1)}, ${doygunluk.toFixed(1)}%, ${parlaklik.toFixed(1)}%)`);
  icGradyan.addColorStop(1, `hsl(${(ton + 3).toFixed(1)}, ${(doygunluk + 4).toFixed(1)}%, ${(parlaklik - 7).toFixed(1)}%)`);

  baglam.fillStyle = icGradyan;
  baglam.fillRect(x, y, boyut, boyut);

  // Karo merkezinde yumuşak sırlı cam ışıltısı
  const parlamaGradyani = baglam.createRadialGradient(
    x + boyut * 0.36,
    y + boyut * 0.34,
    1,
    x + boyut * 0.5,
    y + boyut * 0.5,
    boyut * 0.72,
  );
  parlamaGradyani.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  parlamaGradyani.addColorStop(0.6, 'rgba(220, 250, 255, 0.05)');
  parlamaGradyani.addColorStop(1, 'rgba(10, 60, 80, 0.08)');
  baglam.fillStyle = parlamaGradyani;
  baglam.fillRect(x, y, boyut, boyut);

  // Üst/sol parlak kenar ve alt/sağ derinlik kenarı ile hafif kabartma etkisi
  baglam.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  baglam.lineWidth = 1;
  baglam.beginPath();
  baglam.moveTo(x + 0.5, y + boyut - 0.5);
  baglam.lineTo(x + 0.5, y + 0.5);
  baglam.lineTo(x + boyut - 0.5, y + 0.5);
  baglam.stroke();

  baglam.strokeStyle = 'rgba(12, 65, 86, 0.22)';
  baglam.beginPath();
  baglam.moveTo(x + boyut - 0.5, y + 0.5);
  baglam.lineTo(x + boyut - 0.5, y + boyut - 0.5);
  baglam.lineTo(x + 0.5, y + boyut - 0.5);
  baglam.stroke();
}

/**
 * 512x512 HTML5 Canvas üzerinde 16x16 kesintisiz tekrarlanabilen
 * gerçekçi havuz seramik mozaik dokusu üretir.
 */
export function seramikKaroDokusuUret(anizotropi: number): THREE.CanvasTexture {
  const tuval = document.createElement('canvas');
  tuval.width = DOKU_BOYUTU;
  tuval.height = DOKU_BOYUTU;

  const baglam = tuval.getContext('2d');
  if (!baglam) {
    throw new Error('Seramik karo dokusu için 2B tuval bağlamı oluşturulamadı.');
  }

  derzZeminiCiz(baglam);

  for (let satir = 0; satir < IZGARA_ADETI; satir += 1) {
    for (let sutun = 0; sutun < IZGARA_ADETI; sutun += 1) {
      tekKaroCiz(baglam, satir, sutun);
    }
  }

  const doku = new THREE.CanvasTexture(tuval);
  doku.wrapS = THREE.RepeatWrapping;
  doku.wrapT = THREE.RepeatWrapping;
  doku.colorSpace = THREE.SRGBColorSpace;
  doku.generateMipmaps = true;
  doku.minFilter = THREE.LinearMipmapLinearFilter;
  doku.magFilter = THREE.LinearFilter;
  doku.anisotropy = Math.max(1, Math.min(anizotropi, 8));
  doku.needsUpdate = true;

  return doku;
}
