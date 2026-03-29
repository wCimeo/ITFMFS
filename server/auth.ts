import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export const SESSION_TTL_DAYS = 7;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const storedBuffer = Buffer.from(hash, 'hex');
  if (storedBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derived);
}

export function createSessionToken() {
  return randomBytes(32).toString('hex');
}

export function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export function toMysqlDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}
