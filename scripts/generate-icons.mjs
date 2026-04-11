import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFile, writeFile, stat } from 'node:fs/promises';

const SOURCE = 'static/favicon.svg';

const OUTPUTS = [
  'static/apple-touch-icon.png',
  'static/favicon.ico',
  'static/icon-512x512.png',
  'static/maskable-icon-512x512.png'
];

async function isUpToDate() {
  try {
    const sourceStat = await stat(SOURCE);
    const outputStats = await Promise.all(OUTPUTS.map((f) => stat(f)));

    return outputStats.every((s) => s.mtimeMs > sourceStat.mtimeMs);
  } catch {
    return false;
  }
}

export default async function generateIcons() {
  if (await isUpToDate()) {
    return;
  }

  console.log('Generating icons from favicon.svg...');

  const svgBuffer = await readFile(SOURCE);

  await Promise.all([
    sharp(svgBuffer).resize(180, 180).png().toFile('static/apple-touch-icon.png'),
    sharp(svgBuffer).resize(512, 512).png().toFile('static/icon-512x512.png'),
    sharp(svgBuffer)
      .resize(512, 512)
      .flatten({ background: '#37474f' })
      .png()
      .toFile('static/maskable-icon-512x512.png')
  ]);

  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const ico = await pngToIco(png32);
  await writeFile('static/favicon.ico', ico);

  console.log('Icons generated.');
}
