import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const sourcePath = fileURLToPath(new URL('../public/icon.svg', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../public/icons/', import.meta.url));
const electronAssetDirectory = fileURLToPath(new URL('../electron/assets/', import.meta.url));
const background = '#0a0a0b';

await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(electronAssetDirectory, { recursive: true }),
]);

async function writeFullBleedIcon(filename: string, size: number): Promise<void> {
  await sharp(sourcePath)
    .resize(size, size)
    .flatten({ background })
    .png()
    .toFile(`${outputDirectory}/${filename}`);
}

await Promise.all([
  writeFullBleedIcon('icon-192.png', 192),
  writeFullBleedIcon('icon-512.png', 512),
  writeFullBleedIcon('apple-touch-icon-180.png', 180),
  (async () => {
    const artwork = await sharp(sourcePath)
      .resize(410, 410)
      .flatten({ background })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background,
      },
    })
      .composite([{ input: artwork, gravity: 'centre' }])
      .png()
      .toFile(`${outputDirectory}/icon-maskable-512.png`);
  })(),
  sharp(sourcePath).resize(1024, 1024).png().toFile(`${electronAssetDirectory}/icon.png`),
]);
