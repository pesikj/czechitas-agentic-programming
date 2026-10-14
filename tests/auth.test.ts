import { describe, expect, it } from 'vitest';
import { generateOtp, normaliseOtp, randomToken, sha256 } from '../src/server/auth/crypto';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../src/server/auth/password';
import { RateLimiter } from '../src/server/auth/rate-limit';
import { safeNext, withNext } from '../src/server/auth/redirect';

describe('one-time passwords and tokens', () => {
  it('generates readable grouped OTPs without ambiguous characters', () => {
    const otps = Array.from({ length: 200 }, generateOtp);
    for (const otp of otps) {
      expect(otp).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(otp).not.toMatch(/[01OIL]/);
    }
    expect(new Set(otps).size).toBe(otps.length);
  });

  it('normalises however the OTP was typed', () => {
    expect(normaliseOtp(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
    expect(sha256(normaliseOtp('abcd efgh-jkmn'))).toBe(sha256('ABCDEFGHJKMN'));
  });

  it('creates long random tokens', () => {
    expect(randomToken()).toMatch(/^[\w-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('správné koně baterie');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'správné koně baterie')).toBe(true);
    expect(await verifyPassword(hash, 'jiné heslo úplně')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('applies the policy with Czech messages', () => {
    expect(checkPasswordPolicy('kratke', 'jana@example.test')).toEqual(['Heslo musí mít alespoň 10 znaků.']);
    expect(checkPasswordPolicy('x'.repeat(129), 'a@b.cz')).toEqual(['Heslo může mít nejvýše 128 znaků.']);
    expect(checkPasswordPolicy('Jana.Novakova@Example.test', 'jana.novakova@example.test')).toEqual([
      'Heslo nesmí být stejné jako vaše e-mailová adresa.',
    ]);
    expect(checkPasswordPolicy('jana.novakova', 'jana.novakova@example.test')).toContain(
      'Heslo nesmí být stejné jako vaše e-mailová adresa.',
    );
    expect(checkPasswordPolicy('Heslo12345', 'a@b.cz')).toEqual([
      'Toto heslo je příliš běžné. Zvolte jiné, například několik nesouvisejících slov.',
    ]);
    expect(checkPasswordPolicy('modrý kůň pije čaj', 'a@b.cz')).toEqual([]);
  });

  it('counts characters, not bytes', () => {
    expect(checkPasswordPolicy('žluťoučký', 'a@b.cz')).toHaveLength(1);
    expect(checkPasswordPolicy('žluťoučký!', 'a@b.cz')).toEqual([]);
  });
});

describe('safe redirects', () => {
  it.each([
    ['/lekce/uvod/a', '/lekce/uvod/a'],
    ['/lekce/uvod/a?x=1#h', '/lekce/uvod/a?x=1#h'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example/', '/'],
    ['javascript:alert(1)', '/'],
    ['lekce', '/'],
    ['/a\nb', '/'],
    [null, '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it('builds next links only when useful', () => {
    expect(withNext('/prihlaseni', '/')).toBe('/prihlaseni');
    expect(withNext('/prihlaseni', '/lekce/a/b')).toBe('/prihlaseni?next=%2Flekce%2Fa%2Fb');
  });
});

describe('rate limiter', () => {
  it('allows up to the limit per window, then resets', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([true, true, false]);
    expect(limiter.hit('b')).toBe(true);
    now = 1000;
    expect(limiter.hit('a')).toBe(true);
    limiter.hit('a');
    limiter.reset('a');
    expect(limiter.hit('a')).toBe(true);
  });
});
