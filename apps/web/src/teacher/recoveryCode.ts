const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateRecoveryCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => ALPHABET[byte & 31]).join(
    '',
  );
}

export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? '';
}

export function normaliseRecoveryCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[ -]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{24}$/.test(code) ? code : null;
}
