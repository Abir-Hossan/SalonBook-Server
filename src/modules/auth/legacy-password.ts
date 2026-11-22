import { scrypt, timingSafeEqual } from 'node:crypto';

export async function verifyLegacyPassword(password: string, hash?: string): Promise<boolean> {
  const match = /^([a-f\d]{32}):([a-f\d]{128})$/.exec(hash ?? '');
  const candidate = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, match?.[1] ?? 'salonbook-invalid-credential', 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
  const expected = Buffer.from(match?.[2] ?? '00'.repeat(64), 'hex');
  return timingSafeEqual(candidate, expected) && Boolean(match);
}
