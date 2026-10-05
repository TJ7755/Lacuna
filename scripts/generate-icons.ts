import { mkdir, writeFile } from 'node:fs/promises';
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

// Google Search shows favicons whose size is a multiple of 48px, and crawls /favicon.ico by default.
// A single-image ICO is a 22-byte header around a PNG payload.
async function writeFaviconIco(): Promise<void> {
  const png = await sharp(sourcePath).resize(48, 48).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // image type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(48, 6); // width
  header.writeUInt8(48, 7); // height
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18); // payload offset
  await writeFile(
    fileURLToPath(new URL('../public/favicon.ico', import.meta.url)),
    Buffer.concat([header, png]),
  );
}

await Promise.all([
  writeFaviconIco(),
  sharp(sourcePath).resize(48, 48).png().toFile(`${outputDirectory}/favicon-48.png`),
  sharp(sourcePath).resize(96, 96).png().toFile(`${outputDirectory}/favicon-96.png`),
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
