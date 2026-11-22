import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyLegacyPassword } from '../../src/modules/auth/legacy-password';

describe('Legacy SalonBook password compatibility', () => {
  const salt = '0123456789abcdef0123456789abcdef';
  const hash = salt + ':' + scryptSync('LegacyPassword1', salt, 64).toString('hex');

  it('matches the original Node scrypt format without rewriting it', async () => {
    await expect(verifyLegacyPassword('LegacyPassword1', hash)).resolves.toBe(true);
    await expect(verifyLegacyPassword('IncorrectPassword1', hash)).resolves.toBe(false);
  });

  it('rejects missing and malformed hashes', async () => {
    await expect(verifyLegacyPassword('LegacyPassword1')).resolves.toBe(false);
    await expect(verifyLegacyPassword('LegacyPassword1', salt + ':broken')).resolves.toBe(false);
  });
});
