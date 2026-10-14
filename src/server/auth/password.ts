import { hash, verify } from '@node-rs/argon2';
import { COMMON_PASSWORDS } from './common-passwords';

// argon2id (the library default) with OWASP-recommended cost: 19 MiB memory, 2 iterations.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Spends the same time as a real check when the account does not exist (no account enumeration). */
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}

/** Czech messages for every rule the new password breaks; empty when it is acceptable. */
export function checkPasswordPolicy(password: string, email: string): string[] {
  const problems: string[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) problems.push(`Heslo musí mít alespoň ${PASSWORD_MIN_LENGTH} znaků.`);
  if (length > PASSWORD_MAX_LENGTH) problems.push(`Heslo může mít nejvýše ${PASSWORD_MAX_LENGTH} znaků.`);
  const lower = password.trim().toLowerCase();
  const address = email.trim().toLowerCase();
  if (lower === address || lower === address.split('@')[0]) {
    problems.push('Heslo nesmí být stejné jako vaše e-mailová adresa.');
  }
  if (COMMON_PASSWORDS.has(lower)) {
    problems.push('Toto heslo je příliš běžné. Zvolte jiné, například několik nesouvisejících slov.');
  }
  return problems;
}
