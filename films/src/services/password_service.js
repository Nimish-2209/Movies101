const {
  randomBytes,
  scrypt,
  timingSafeEqual
} = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024
};

async function deriveKey(password, salt) {
  return scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
}

async function hashPassword(password) {
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

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const expectedKey = Buffer.from(parts[5], 'hex');
  if (expectedKey.length !== KEY_LENGTH) {
    return false;
  }

  const options = {
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

  const actualKey = await scryptAsync(
    password,
    parts[4],
    KEY_LENGTH,
    options
  );

  return timingSafeEqual(expectedKey, actualKey);
}

module.exports = {
  hashPassword,
  verifyPassword
};
