export interface ClassInvitation {
  shareId: string;
  keyId: string;
}
const PREFIX = 'GAPS1_';

/** The invitation obtained directly from the teacher pins the complete recipient fingerprint. */
export function formatClassCode({ shareId, keyId }: ClassInvitation): string {
  if (!/^[0-9a-f]{32}$/.test(shareId) || !/^[0-9a-f]{64}$/.test(keyId))
    throw new Error('Invalid class invitation.');
  const bytes = (shareId + keyId).match(/../g)!.map((part) => Number.parseInt(part, 16));
  return (
    PREFIX +
    btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
  );
}

export function parseClassCode(value: string): ClassInvitation {
  const code = value.trim().split('/').pop() ?? '';
  if (!/^GAPS1_[A-Za-z0-9_-]{64}$/.test(code)) throw new Error('That is not a Gaps class code.');
  const bytes = atob(code.slice(PREFIX.length).replaceAll('-', '+').replaceAll('_', '/'));
  const hex = Array.from(bytes, (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join(
    '',
  );
  const invitation = { shareId: hex.slice(0, 32), keyId: hex.slice(32) };
  if (formatClassCode(invitation) !== code) throw new Error('That is not a Gaps class code.');
  return invitation;
}

export function normaliseShortClassCode(value: string): string | null {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code) ? code : null;
}

export function formatShortClassCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
