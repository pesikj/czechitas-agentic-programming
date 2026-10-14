import { createHash, randomBytes, randomInt } from 'node:crypto';

/** URL-safe random secret (session tokens, reset links). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Only hashes of secrets are stored. The secrets are high-entropy random values, so SHA-256 suffices. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** No 0/O, 1/I/L: easy to read from an email and type by hand. */
const OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const OTP_LENGTH = 12;

/** One-time password for invitations, e.g. `K7QM-WX3P-RT9A` (~59 bits). */
export function generateOtp(): string {
  const chars = Array.from({ length: OTP_LENGTH }, () => OTP_ALPHABET[randomInt(OTP_ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((group) => group.join('')).join('-');
}

/** Accepts the OTP however it was typed: any case, with or without dashes and spaces. */
export function normaliseOtp(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}
