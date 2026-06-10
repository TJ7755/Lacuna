import { describe, expect, it } from 'vitest';
import { bytesToBase45, base45ToBytes } from './base45';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('base45', () => {
  it('round-trips empty bytes', () => {
    const encoded = bytesToBase45(bytes());
    expect(encoded).toBe('');
    expect(base45ToBytes(encoded)).toEqual(bytes());
  });

  it('round-trips a single zero byte', () => {
    const encoded = bytesToBase45(bytes(0));
    expect(encoded).toBe('00');
    expect(base45ToBytes(encoded)).toEqual(bytes(0));
  });

  it('round-trips a single 255 byte', () => {
    const encoded = bytesToBase45(bytes(255));
    expect(encoded).toBe('U5');
    expect(base45ToBytes(encoded)).toEqual(bytes(255));
  });

  it('round-trips two zero bytes', () => {
    const encoded = bytesToBase45(bytes(0, 0));
    expect(encoded).toBe('000');
    expect(base45ToBytes(encoded)).toEqual(bytes(0, 0));
  });

  it('round-trips two 255 bytes', () => {
    const encoded = bytesToBase45(bytes(255, 255));
    expect(encoded).toBe('FGW');
    expect(base45ToBytes(encoded)).toEqual(bytes(255, 255));
  });

  it('round-trips the RFC 9285 example vector', () => {
    // RFC 9285 Appendix A: "Hello!!" encoded as %69 VD92EX0
    const data = new TextEncoder().encode('Hello!!');
    const encoded = bytesToBase45(data);
    expect(encoded).toBe('%69 VD92EX0');
    expect(base45ToBytes(encoded)).toEqual(data);
  });

  it('round-trips random bytes', () => {
    const data = bytes(1, 2, 3, 4, 5, 128, 200, 255, 0, 99, 42);
    const encoded = bytesToBase45(data);
    expect(base45ToBytes(encoded)).toEqual(data);
  });

  it('round-trips long random bytes', () => {
    const data = crypto.getRandomValues(new Uint8Array(256));
    const encoded = bytesToBase45(data);
    expect(base45ToBytes(encoded)).toEqual(data);
  });

  it('rejects invalid length (1 char remaining)', () => {
    expect(() => base45ToBytes('A')).toThrow('Invalid Base45 length');
  });

  it('rejects invalid characters', () => {
    expect(() => base45ToBytes('A!C')).toThrow('Invalid Base45 character');
  });

  it('rejects 2-character group exceeding 255', () => {
    // "ZZ" decodes to 44 + 44*45 = 2024, which is > 255
    expect(() => base45ToBytes('ZZ')).toThrow('2-character group exceeds 255');
  });


});
