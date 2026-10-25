import './apkgImport.testSupport';
import 'fake-indexeddb/auto';
import * as fflate from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseApkg } from './apkgImport';
import { parseApkgBuffer } from './apkgParser';
import { MAX_APKG_FILE_COUNT, MAX_APKG_SIZE_BYTES, MAX_APKG_UNCOMPRESSED_BYTES } from './apkgTypes';
import { assertZipMetadataWithinLimits } from './zipMetadata';

function findEocd(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.byteLength - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('Test ZIP has no EOCD.');
}

function makeZip64Metadata(uncompressedSize: bigint): ArrayBuffer {
  const fileName = new TextEncoder().encode('collection.anki2');
  const centralDirectorySize = 46 + fileName.length + 12;
  const zip64EocdOffset = centralDirectorySize;
  const zip64LocatorOffset = zip64EocdOffset + 56;
  const eocdOffset = zip64LocatorOffset + 20;
  const bytes = new Uint8Array(eocdOffset + 22);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint32(20, 0, true);
  view.setUint32(24, 0xffffffff, true);
  view.setUint16(28, fileName.length, true);
  view.setUint16(30, 12, true);
  bytes.set(fileName, 46);
  const extraOffset = 46 + fileName.length;
  view.setUint16(extraOffset, 0x0001, true);
  view.setUint16(extraOffset + 2, 8, true);
  view.setBigUint64(extraOffset + 4, uncompressedSize, true);

  view.setUint32(zip64EocdOffset, 0x06064b50, true);
  view.setBigUint64(zip64EocdOffset + 4, 44n, true);
  view.setUint16(zip64EocdOffset + 12, 45, true);
  view.setUint16(zip64EocdOffset + 14, 45, true);
  view.setBigUint64(zip64EocdOffset + 24, 1n, true);
  view.setBigUint64(zip64EocdOffset + 32, 1n, true);
  view.setBigUint64(zip64EocdOffset + 40, BigInt(centralDirectorySize), true);
  view.setBigUint64(zip64EocdOffset + 48, 0n, true);

  view.setUint32(zip64LocatorOffset, 0x07064b50, true);
  view.setBigUint64(zip64LocatorOffset + 8, BigInt(zip64EocdOffset), true);
  view.setUint32(zip64LocatorOffset + 16, 1, true);

  view.setUint32(eocdOffset, 0x06054b50, true);
  view.setUint16(eocdOffset + 8, 0xffff, true);
  view.setUint16(eocdOffset + 10, 0xffff, true);
  view.setUint32(eocdOffset + 12, 0xffffffff, true);
  view.setUint32(eocdOffset + 16, 0xffffffff, true);
  return bytes.buffer;
}

function addCentralDirectorySignature(zipped: Uint8Array): ArrayBuffer {
  const signature = new Uint8Array([0x50, 0x4b, 0x05, 0x05, 0x02, 0x00, 0x4f, 0x4b]);
  const eocdOffset = findEocd(zipped);
  const bytes = new Uint8Array(zipped.byteLength + signature.byteLength);
  bytes.set(zipped.subarray(0, eocdOffset));
  bytes.set(signature, eocdOffset);
  bytes.set(zipped.subarray(eocdOffset), eocdOffset + signature.byteLength);
  const view = new DataView(bytes.buffer);
  const movedEocdOffset = eocdOffset + signature.byteLength;
  view.setUint32(
    movedEocdOffset + 12,
    view.getUint32(movedEocdOffset + 12, true) + signature.byteLength,
    true,
  );
  return bytes.buffer;
}

function addEocdSignatureInsideComment(zipped: Uint8Array): ArrayBuffer {
  const eocdOffset = findEocd(zipped);
  const comment = new Uint8Array(26);
  const commentView = new DataView(comment.buffer);
  commentView.setUint32(0, 0x06054b50, true);
  commentView.setUint16(20, 0, true);

  const bytes = new Uint8Array(zipped.byteLength + comment.byteLength);
  bytes.set(zipped);
  bytes.set(comment, zipped.byteLength);
  new DataView(bytes.buffer).setUint16(eocdOffset + 20, comment.byteLength, true);
  return bytes.buffer;
}

describe('parseApkg zip bomb guards', () => {
  beforeEach(() => {
    vi.mocked(fflate.unzipSync).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects when File.size exceeds 50 MB before allocating', async () => {
    let arrayBufferCalled = false;
    const bigFile = {
      size: MAX_APKG_SIZE_BYTES + 1,
      arrayBuffer: async () => {
        arrayBufferCalled = true;
        return new ArrayBuffer(10);
      },
      name: 'big.apkg',
    } as unknown as File;

    await expect(parseApkg(bigFile)).rejects.toThrow(
      `APKG too large: ${MAX_APKG_SIZE_BYTES + 1} bytes (max 50 MB)`,
    );
    expect(arrayBufferCalled).toBe(false);
  });

  it('rejects empty File', async () => {
    const emptyFile = {
      size: 0,
      arrayBuffer: async () => new ArrayBuffer(0),
      name: 'empty.apkg',
    } as unknown as File;

    await expect(parseApkg(emptyFile)).rejects.toThrow('APKG is empty.');
  });

  it('rejects when buffer byteLength exceeds 50 MB', async () => {
    const buf = new ArrayBuffer(MAX_APKG_SIZE_BYTES + 1);
    await expect(parseApkgBuffer(buf)).rejects.toThrow(/APKG too large:.*50 MB/);
  });

  it('rejects empty buffer', async () => {
    await expect(parseApkgBuffer(new ArrayBuffer(0))).rejects.toThrow('APKG is empty.');
  });

  it('rejects when zip contains too many files', async () => {
    const fakeZip = Object.fromEntries(
      Array.from({ length: MAX_APKG_FILE_COUNT + 1 }, (_, i) => [String(i), new Uint8Array(1)]),
    ) as unknown as fflate.Unzipped;
    vi.mocked(fflate.unzipSync).mockReturnValueOnce(fakeZip);
    const buf = fflate.zipSync({ placeholder: new Uint8Array() }).buffer as ArrayBuffer;

    await expect(parseApkgBuffer(buf)).rejects.toThrow(/too many files/);
    expect(fflate.unzipSync).toHaveBeenCalled();
  });

  it('rejects when uncompressed size exceeds 100 MB', async () => {
    const fakeLarge = { byteLength: MAX_APKG_UNCOMPRESSED_BYTES + 1 } as unknown as Uint8Array;
    const fakeZip = { largeFile: fakeLarge } as unknown as fflate.Unzipped;
    vi.mocked(fflate.unzipSync).mockReturnValueOnce(fakeZip);
    const buf = fflate.zipSync({ placeholder: new Uint8Array() }).buffer as ArrayBuffer;

    await expect(parseApkgBuffer(buf)).rejects.toThrow(/uncompressed size too large/);
    expect(fflate.unzipSync).toHaveBeenCalled();
  });

  it('rejects highly compressed bomb via ZIP central-directory metadata', async () => {
    const unzipSync = vi.mocked(fflate.unzipSync);
    unzipSync.mockClear();
    // 10 × 11 MiB zeros compress to a few kilobytes but declare 110 MiB uncompressed.
    // Building the archive takes seconds, so use the fastest level and a longer timeout.
    const chunk = new Uint8Array(11 * 1024 * 1024);
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 10; i++) entries[`bomb-${i}.bin`] = chunk;
    const zipped = fflate.zipSync(entries, { level: 1 });
    expect(zipped.length).toBeLessThan(MAX_APKG_SIZE_BYTES);
    const buf = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer;

    await expect(parseApkgBuffer(buf)).rejects.toThrow(/uncompressed size too large/);
    // Central-directory check should reject before any entry is inflated.
    expect(unzipSync).not.toHaveBeenCalled();
  }, 20_000);

  it('rejects mismatched EOCD entry counts before inflating', async () => {
    const zipped = fflate.zipSync({ placeholder: new Uint8Array() });
    const view = new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength);
    view.setUint16(findEocd(zipped) + 8, 0, true);

    await expect(parseApkgBuffer(zipped.buffer as ArrayBuffer)).rejects.toThrow(/invalid ZIP/i);
    expect(fflate.unzipSync).not.toHaveBeenCalled();
  });

  it('accepts a bounded central-directory digital signature', () => {
    const buffer = addCentralDirectorySignature(fflate.zipSync({ placeholder: new Uint8Array() }));

    expect(() =>
      assertZipMetadataWithinLimits(buffer, {
        maxEntries: MAX_APKG_FILE_COUNT,
        maxUncompressedBytes: MAX_APKG_UNCOMPRESSED_BYTES,
      }),
    ).not.toThrow();
  });

  it('rejects an additional EOCD signature inside the archive comment before inflating', async () => {
    const buffer = addEocdSignatureInsideComment(fflate.zipSync({ placeholder: new Uint8Array() }));

    await expect(parseApkgBuffer(buffer)).rejects.toThrow(/ambiguous/i);
    expect(fflate.unzipSync).not.toHaveBeenCalled();
  });

  it.each([
    ['missing EOCD', (zipped: Uint8Array) => zipped.slice(0, findEocd(zipped))],
    [
      'wrong central-directory signature',
      (zipped: Uint8Array) => {
        const copy = zipped.slice();
        const view = new DataView(copy.buffer);
        const eocd = findEocd(copy);
        copy[view.getUint32(eocd + 16, true)] = 0;
        return copy;
      },
    ],
    [
      'central-directory bounds beyond the EOCD',
      (zipped: Uint8Array) => {
        const copy = zipped.slice();
        const view = new DataView(copy.buffer);
        const eocd = findEocd(copy);
        view.setUint32(eocd + 12, view.getUint32(eocd + 12, true) + 1, true);
        return copy;
      },
    ],
    [
      'a declared entry count beyond the traversed directory',
      (zipped: Uint8Array) => {
        const copy = zipped.slice();
        const view = new DataView(copy.buffer);
        const eocd = findEocd(copy);
        view.setUint16(eocd + 8, 2, true);
        view.setUint16(eocd + 10, 2, true);
        return copy;
      },
    ],
    [
      'an entry whose fields exceed the central-directory bounds',
      (zipped: Uint8Array) => {
        const copy = zipped.slice();
        const view = new DataView(copy.buffer);
        const eocd = findEocd(copy);
        const directoryOffset = view.getUint32(eocd + 16, true);
        view.setUint16(directoryOffset + 28, 0xffff, true);
        return copy;
      },
    ],
  ])('fails closed on %s before inflating', async (_label, corrupt) => {
    const corruptZip = corrupt(fflate.zipSync({ placeholder: new Uint8Array() }));

    await expect(parseApkgBuffer(corruptZip.buffer as ArrayBuffer)).rejects.toThrow(/invalid ZIP/i);
    expect(fflate.unzipSync).not.toHaveBeenCalled();
  });

  it('accepts a small ZIP64 uncompressed size and retains the post-inflate guard', async () => {
    const fakeLarge = { byteLength: MAX_APKG_UNCOMPRESSED_BYTES + 1 } as unknown as Uint8Array;
    vi.mocked(fflate.unzipSync).mockReturnValueOnce({
      largeFile: fakeLarge,
    } as unknown as fflate.Unzipped);

    await expect(parseApkgBuffer(makeZip64Metadata(42n))).rejects.toThrow(
      /uncompressed size too large/,
    );
    expect(fflate.unzipSync).toHaveBeenCalledOnce();
  });

  it('rejects an oversized ZIP64 entry before inflating', async () => {
    await expect(
      parseApkgBuffer(makeZip64Metadata(BigInt(MAX_APKG_UNCOMPRESSED_BYTES + 1))),
    ).rejects.toThrow(/uncompressed size too large/);
    expect(fflate.unzipSync).not.toHaveBeenCalled();
  });

  it('rejects a ZIP64 size marker without its required extra field before inflating', async () => {
    const malformed = new Uint8Array(makeZip64Metadata(42n));
    const fileNameLength = new DataView(malformed.buffer).getUint16(28, true);
    new DataView(malformed.buffer).setUint16(46 + fileNameLength, 0x9999, true);

    await expect(parseApkgBuffer(malformed.buffer)).rejects.toThrow(/invalid ZIP/i);
    expect(fflate.unzipSync).not.toHaveBeenCalled();
  });
});
