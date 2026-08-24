interface ZipMetadataLimits {
  maxEntries: number;
  maxUncompressedBytes: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const CENTRAL_DIRECTORY_DIGITAL_SIGNATURE = 0x05054b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

function invalidZip(reason: string): never {
  throw new Error(`APKG contains invalid ZIP metadata: ${reason}`);
}

function findEocd(view: DataView): number {
  const minimumSize = 22;
  const searchStart = Math.max(0, view.byteLength - minimumSize - UINT16_MAX);
  let foundTrailingSignature = false;
  for (let offset = view.byteLength - minimumSize; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + minimumSize + commentLength === view.byteLength) {
      if (foundTrailingSignature) {
        invalidZip('end-of-central-directory record is ambiguous.');
      }
      return offset;
    }
    foundTrailingSignature = true;
  }
  return invalidZip('end-of-central-directory record is missing or truncated.');
}

function boundedNumber(value: bigint, limit: number, field: string): number {
  if (value > BigInt(limit)) invalidZip(`${field} is outside the archive bounds.`);
  return Number(value);
}

function readZip64Extra(
  view: DataView,
  start: number,
  end: number,
  needs: { uncompressed: boolean; compressed: boolean; localOffset: boolean; disk: boolean },
): { found: boolean; uncompressed?: bigint } {
  let offset = start;
  while (offset < end) {
    if (offset + 4 > end) invalidZip('central-directory extra field is truncated.');
    const id = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    const dataStart = offset + 4;
    const dataEnd = dataStart + size;
    if (dataEnd > end) invalidZip('central-directory extra field exceeds its entry.');
    if (id !== ZIP64_EXTRA_FIELD_ID) {
      offset = dataEnd;
      continue;
    }

    let cursor = dataStart;
    const read64 = (field: string): bigint => {
      if (cursor + 8 > dataEnd) invalidZip(`ZIP64 ${field} is missing or truncated.`);
      const value = view.getBigUint64(cursor, true);
      cursor += 8;
      return value;
    };
    const uncompressed = needs.uncompressed ? read64('uncompressed size') : undefined;
    if (needs.compressed) read64('compressed size');
    if (needs.localOffset) read64('local-header offset');
    if (needs.disk) {
      if (cursor + 4 > dataEnd) invalidZip('ZIP64 disk number is missing or truncated.');
      if (view.getUint32(cursor, true) !== 0) invalidZip('multi-disk archives are unsupported.');
    }
    return { found: true, uncompressed };
  }
  return { found: false };
}

function readDirectoryLocation(
  view: DataView,
  eocdOffset: number,
): { entries: bigint; offset: bigint; size: bigint; end: number } {
  const disk = view.getUint16(eocdOffset + 4, true);
  const directoryDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const directorySize = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  const usesZip64 =
    disk === UINT16_MAX ||
    directoryDisk === UINT16_MAX ||
    entriesOnDisk === UINT16_MAX ||
    totalEntries === UINT16_MAX ||
    directorySize === UINT32_MAX ||
    directoryOffset === UINT32_MAX;

  if (!usesZip64) {
    if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== totalEntries) {
      invalidZip('multi-disk or inconsistent EOCD entry counts.');
    }
    return {
      entries: BigInt(totalEntries),
      offset: BigInt(directoryOffset),
      size: BigInt(directorySize),
      end: eocdOffset,
    };
  }

  const locatorOffset = eocdOffset - 20;
  if (locatorOffset < 0 || view.getUint32(locatorOffset, true) !== ZIP64_LOCATOR_SIGNATURE) {
    return invalidZip('ZIP64 locator is missing or truncated.');
  }
  if (view.getUint32(locatorOffset + 4, true) !== 0 || view.getUint32(locatorOffset + 16, true) !== 1) {
    invalidZip('multi-disk ZIP64 archives are unsupported.');
  }
  const zip64Offset = boundedNumber(
    view.getBigUint64(locatorOffset + 8, true),
    locatorOffset,
    'ZIP64 end-of-central-directory offset',
  );
  if (zip64Offset + 56 > locatorOffset || view.getUint32(zip64Offset, true) !== ZIP64_EOCD_SIGNATURE) {
    return invalidZip('ZIP64 end-of-central-directory record is missing or truncated.');
  }
  const zip64RecordSize = view.getBigUint64(zip64Offset + 4, true);
  if (zip64RecordSize < 44n) invalidZip('ZIP64 end-of-central-directory record is too short.');
  if (BigInt(zip64Offset) + 12n + zip64RecordSize !== BigInt(locatorOffset)) {
    invalidZip('ZIP64 end-of-central-directory bounds are inconsistent.');
  }
  if (view.getUint32(zip64Offset + 16, true) !== 0 || view.getUint32(zip64Offset + 20, true) !== 0) {
    invalidZip('multi-disk ZIP64 archives are unsupported.');
  }
  const zip64EntriesOnDisk = view.getBigUint64(zip64Offset + 24, true);
  const zip64TotalEntries = view.getBigUint64(zip64Offset + 32, true);
  if (zip64EntriesOnDisk !== zip64TotalEntries) {
    invalidZip('inconsistent ZIP64 entry counts.');
  }
  return {
    entries: zip64TotalEntries,
    size: view.getBigUint64(zip64Offset + 40, true),
    offset: view.getBigUint64(zip64Offset + 48, true),
    end: zip64Offset,
  };
}

/**
 * Validate the complete ZIP central directory before any entry is inflated.
 * The parser is deliberately strict: malformed metadata must not turn a
 * pre-allocation safety boundary into a best-effort hint.
 */
export function assertZipMetadataWithinLimits(
  buffer: ArrayBuffer,
  limits: ZipMetadataLimits,
): void {
  const view = new DataView(buffer);
  if (view.byteLength < 22) invalidZip('end-of-central-directory record is missing or truncated.');
  const directory = readDirectoryLocation(view, findEocd(view));
  if (directory.entries > BigInt(limits.maxEntries)) {
    throw new Error(
      `APKG contains too many files: ${directory.entries} (max ${limits.maxEntries})`,
    );
  }

  const directoryOffset = boundedNumber(directory.offset, directory.end, 'central-directory offset');
  const directorySize = boundedNumber(directory.size, directory.end, 'central-directory size');
  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd !== directory.end) invalidZip('central-directory bounds are inconsistent.');

  let offset = directoryOffset;
  let totalUncompressed = 0n;
  for (let entry = 0n; entry < directory.entries; entry++) {
    if (offset + 46 > directoryEnd) invalidZip('central-directory entry is truncated.');
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      invalidZip('central-directory entry signature is missing.');
    }
    const uncompressed32 = view.getUint32(offset + 24, true);
    const compressed32 = view.getUint32(offset + 20, true);
    const localOffset32 = view.getUint32(offset + 42, true);
    const disk32 = view.getUint16(offset + 34, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > directoryEnd) invalidZip('central-directory entry exceeds its bounds.');
    if (disk32 !== 0 && disk32 !== UINT16_MAX) invalidZip('multi-disk archives are unsupported.');

    let uncompressed = BigInt(uncompressed32);
    if (
      uncompressed32 === UINT32_MAX ||
      compressed32 === UINT32_MAX ||
      localOffset32 === UINT32_MAX ||
      disk32 === UINT16_MAX
    ) {
      const zip64 = readZip64Extra(
        view,
        offset + 46 + nameLength,
        offset + 46 + nameLength + extraLength,
        {
          uncompressed: uncompressed32 === UINT32_MAX,
          compressed: compressed32 === UINT32_MAX,
          localOffset: localOffset32 === UINT32_MAX,
          disk: disk32 === UINT16_MAX,
        },
      );
      if (!zip64.found) invalidZip('required ZIP64 extra field is missing.');
      if (uncompressed32 === UINT32_MAX) {
        if (zip64.uncompressed === undefined) invalidZip('ZIP64 uncompressed size is missing.');
        uncompressed = zip64.uncompressed;
      }
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > BigInt(limits.maxUncompressedBytes)) {
      throw new Error(
        `APKG uncompressed size too large: ${totalUncompressed} bytes (max ${limits.maxUncompressedBytes})`,
      );
    }
    offset = entryEnd;
  }
  if (offset !== directoryEnd) {
    if (offset + 6 > directoryEnd || view.getUint32(offset, true) !== CENTRAL_DIRECTORY_DIGITAL_SIGNATURE) {
      invalidZip('central-directory entry count or size is inconsistent.');
    }
    const signatureLength = view.getUint16(offset + 4, true);
    if (offset + 6 + signatureLength !== directoryEnd) {
      invalidZip('central-directory digital signature bounds are inconsistent.');
    }
  }
}
