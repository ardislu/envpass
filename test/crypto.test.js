import { suite, test } from 'node:test';
import { deepStrictEqual, rejects } from 'node:assert/strict';

import { encryptRaw, decryptRaw } from '#src/crypto.js';

// Baseline values
const version = 'v1';
const prf = Uint8Array.fromHex('deadbeef000000000000000000000000000000000000000000000000cafebabe');
const value = '🏴‍☠️ Hello, world!';

suite('encryptRaw and decryptRaw', { concurrency: true }, () => {
  test('works on simple string', { concurrency: true }, async () => {
    deepStrictEqual(await encryptRaw({ version, prf, value }).then(value => decryptRaw({ prf, value })), value);
  });
});

suite('encryptRaw', { concurrency: true }, () => {
  test('throws on invalid version', { concurrency: true }, () => {
    // @ts-expect-error
    rejects(encryptRaw({ version: 'INVALID', prf, value }));
  });
  test('throws on invalid prf', { concurrency: true }, () => {
    // @ts-expect-error
    rejects(encryptRaw({ version, prf: 'INVALID', value }));
  });
  test('throws on invalid value', { concurrency: true }, () => {
    // @ts-expect-error
    rejects(encryptRaw({ version, prf, value: {} }));
  });
});

suite('decryptRaw', { concurrency: true }, () => {
  const value = 'envpass:v1:AAA';
  test('throws on invalid prf', { concurrency: true }, () => {
    // @ts-expect-error
    rejects(decryptRaw({ prf: 'INVALID', value }));
  });
  test('throws on invalid value', { concurrency: true }, () => {
    // @ts-expect-error
    rejects(decryptRaw({ prf, value: {} }));
  });
  test('throws on invalid magic in value', { concurrency: true }, () => {
    // @ts-expect-error
    rejects(decryptRaw({ prf, value: 'INVALID:v1:AAA' }));
  });
  test('throws on invalid version in value', { concurrency: true }, () => {
    // @ts-expect-error
    rejects(decryptRaw({ prf, value: 'envpass:INVALID:AAA' }));
  });
  test('throws on invalid (non-base64) string in value', { concurrency: true }, () => {
    rejects(decryptRaw({ prf, value: 'envpass:v1:🏴‍☠️' }));
  });
});