// Base45 encoding and decoding (RFC 9285).
//
// Base45 uses the 45-character alphabet native to QR code Alphanumeric mode,
// making it ~30% more space-efficient than Base64 for QR codes. It encodes
// 2 bytes as 3 characters, or 1 byte as 2 characters.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const DECODE_MAP = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  DECODE_MAP.set(ALPHABET[i], i);
}

/** Encode a Uint8Array as a Base45 string. */
export function bytesToBase45(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      const c = n % 45;
      const d = Math.floor(n / 45) % 45;
      const e = Math.floor(n / (45 * 45)) % 45;
      chars.push(ALPHABET[c], ALPHABET[d], ALPHABET[e]);
    } else {
      const n = bytes[i];
      const c = n % 45;
      const d = Math.floor(n / 45) % 45;
      chars.push(ALPHABET[c], ALPHABET[d]);
    }
  }
  return chars.join('');
}

/** Decode a Base45 string back into a Uint8Array. */
export function base45ToBytes(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  const len = str.length;
  if (len % 3 === 1) {
    throw new Error('Invalid Base45 length: must not leave 1 character after groups of 3.');
  }

  const bytes: number[] = [];
  for (let i = 0; i < len; i += 3) {
    if (i + 2 < len) {
      const c = DECODE_MAP.get(str[i]);
      const d = DECODE_MAP.get(str[i + 1]);
      const e = DECODE_MAP.get(str[i + 2]);
      if (c === undefined || d === undefined || e === undefined) {
        throw new Error('Invalid Base45 character.');
      }
      const n = c + d * 45 + e * 45 * 45;
      if (n > 65535) {
        throw new Error('Invalid Base45 encoding: 3-character group exceeds 65535.');
      }
      bytes.push(Math.floor(n / 256), n % 256);
    } else {
      const c = DECODE_MAP.get(str[i]);
      const d = DECODE_MAP.get(str[i + 1]);
      if (c === undefined || d === undefined) {
        throw new Error('Invalid Base45 character.');
      }
      const n = c + d * 45;
      if (n > 255) {
        throw new Error('Invalid Base45 encoding: 2-character group exceeds 255.');
      }
      bytes.push(n);
    }
  }
  return new Uint8Array(bytes);
}
