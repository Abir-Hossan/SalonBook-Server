import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins } from '../../src/config/allowed-origins';

describe('credentialed origin configuration', () => {
  it('normalizes list whitespace and deduplicates explicit hosts', () => {
    const production = 'https://salonbook.example.test';
    const preview = 'https://salonbook-preview.vercel.app';
    expect(parseAllowedOrigins(` ${production}, ${preview}, ${production} `, true)).toEqual([production, preview]);
    expect(parseAllowedOrigins('http://127.0.0.1:3000', false)).toEqual(['http://127.0.0.1:3000']);
  });

  it.each(['', '*, ', 'https://*.vercel.app', 'null', 'http://salonbook.example.test',
    'https://salonbook.example.test/', 'https://salonbook.example.test/path',
    'https://user:fixture@salonbook.example.test', 'https://salonbook.example.test?value=fixture',
    'https://salonbook.example.test#fragment', 'ftp://salonbook.example.test'])(
    'rejects non-origin or insecure production entries (%s)', (value) => {
      expect(() => parseAllowedOrigins(value, true)).toThrow(/ALLOWED_ORIGINS/);
    },
  );
});
