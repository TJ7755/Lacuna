import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface StudyImageFixture {
  hash: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
}

/** Original-sized APKG media: no upload downscaling and no shared image bytes. */
export async function largeStudyImages(directory: string): Promise<StudyImageFixture[]> {
  await mkdir(directory, { recursive: true });
  const manifestPath = join(directory, 'manifest.json');
  try { return JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* Generate once per local fixture. */ }
  const images: StudyImageFixture[] = [];
  for (let i = 0; i < 108; i++) {
    const png = i % 4 === 1 || i % 4 === 2;
    const width = [3200, 3600, 4000][i % 3];
    const height = width * 3 / 4;
    const raw = Buffer.alloc(width * height * 3);
    let random = i + 71;
    for (let p = 0; p < raw.length; p += 3) {
      random = (Math.imul(random, 1664525) + 1013904223) | 0;
      const value = random >>> 24;
      if (png) raw[p] = raw[p + 1] = raw[p + 2] = 244 + (value % 3);
      else {
        raw[p] = value;
        raw[p + 1] = 100 + ((random >>> 16) & 127);
        raw[p + 2] = 140;
      }
    }
    const labels = Array.from({ length: 30 }, (_, n) =>
      `<text x="100" y="${130 + n * 68}" font-size="32">Biology specimen ${i}, structure ${n}: cell membranes and respiration</text>`,
    ).join('');
    const overlay = Buffer.from(`<svg width="${width}" height="${height}"><g fill="#263c42">${labels}</g><ellipse cx="${width * 0.7}" cy="${height * 0.5}" rx="450" ry="700" fill="none" stroke="#23736d" stroke-width="20"/></svg>`);
    const image = sharp(raw, { raw: { width, height, channels: 3 } }).composite([{ input: overlay }]).removeAlpha();
    const bytes = await (png ? image.png({ compressionLevel: 6 }) : image.jpeg({ quality: 68 })).toBuffer();
    if (bytes.length < 1_000_000 || bytes.length > 5_000_000) throw new Error(`Unrealistic fixture image ${i}: ${bytes.length} bytes`);
    const url = `/__study_image/${i}.${png ? 'png' : 'jpg'}`;
    await writeFile(join(directory, url.split('/').pop()!), bytes);
    images.push({ hash: createHash('sha256').update(bytes).digest('hex'), url,
      mimeType: png ? 'image/png' : 'image/jpeg', width, height, bytes: bytes.length });
  }
  if (new Set(images.map((image) => image.hash)).size !== images.length) throw new Error('Fixture images share bytes');
  await writeFile(manifestPath, JSON.stringify(images));
  return images;
}
