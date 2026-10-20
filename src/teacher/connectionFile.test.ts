import { expect, it } from 'vitest';
import { DEFAULT_RELAY_URL } from '../sync/pairingConfig';
import { openGapsConnection, parseGapsConnectionFile, sealGapsConnection } from './connectionFile';

const connection = {
  shareId: 'a'.repeat(32),
  relayUrl: DEFAULT_RELAY_URL,
  courseName: 'GCSE Biology',
  writeToken: 'b'.repeat(64),
};
const phrase = 'several separate words kept for this connection';

it('transfers the credential in a randomised encrypted file, never the passphrase or plaintext token', async () => {
  const first = await sealGapsConnection(connection, phrase);
  const second = await sealGapsConnection(connection, phrase);
  expect(first).not.toContain(connection.writeToken);
  expect(first).not.toContain(phrase);
  expect(first).not.toBe(second);
  expect(await openGapsConnection(parseGapsConnectionFile(first), phrase)).toEqual(connection);
  await expect(
    openGapsConnection(parseGapsConnectionFile(first), 'wrong phrase'),
  ).rejects.toThrow();
});

it('authenticates the course identifier, name and cryptographic header', async () => {
  const file = parseGapsConnectionFile(await sealGapsConnection(connection, phrase));
  for (const change of [
    { shareId: 'c'.repeat(32) },
    { courseName: 'A different class' },
    { iterations: file.iterations + 1 },
    { c: file.c.replace(/^./, file.c[0] === 'A' ? 'B' : 'A') },
  ]) {
    await expect(openGapsConnection({ ...file, ...change }, phrase)).rejects.toThrow();
  }
});

it('rejects untrusted relays, unsupported formats and oversized or unbounded work before decryption', async () => {
  const file = parseGapsConnectionFile(await sealGapsConnection(connection, phrase));
  for (const change of [
    { relayUrl: 'https://someone-else.example' },
    { v: 2 },
    { extra: true },
    { iterations: 1 },
    { iterations: 9_999_999 },
    { salt: 'invalid' },
    { n: 'invalid' },
    { courseName: 'x'.repeat(201) },
  ]) {
    expect(() => parseGapsConnectionFile(JSON.stringify({ ...file, ...change }))).toThrow();
  }
  expect(() => parseGapsConnectionFile(' '.repeat(8193))).toThrow();
  await expect(sealGapsConnection(connection, 'short')).rejects.toThrow('16');
});
