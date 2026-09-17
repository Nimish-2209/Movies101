import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions
} from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS: ScryptOptions = {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024
};

function deriveKey(
  password: string,
  salt: string,
  options = SCRYPT_OPTIONS
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await deriveKey(password, salt);

  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt,
    derivedKey.toString('hex')
  ].join('$');
}

export async function verifyPassword(
  password: string,
  storedHash: unknown
): Promise<boolean> {
  if (typeof storedHash !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const expectedKey = Buffer.from(parts[5], 'hex');
  if (expectedKey.length !== KEY_LENGTH) return false;

  const options: ScryptOptions = {
    N: Number(parts[1]),
    r: Number(parts[2]),
    p: Number(parts[3]),
    maxmem: SCRYPT_OPTIONS.maxmem
  };

  if (
    options.N !== SCRYPT_OPTIONS.N ||
    options.r !== SCRYPT_OPTIONS.r ||
    options.p !== SCRYPT_OPTIONS.p
  ) {
    return false;
  }

  const actualKey = await deriveKey(password, parts[4], options);
  return timingSafeEqual(expectedKey, actualKey);
}
