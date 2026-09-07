import { suite, test } from 'node:test';
import { deepStrictEqual, notDeepStrictEqual, rejects } from 'node:assert/strict';

import { encryptRaw, decryptRaw } from '#src/crypto.js';

// Baseline values
const version = 'v1';
const prf = Uint8Array.fromHex('deadbeef000000000000000000000000000000000000000000000000cafebabe');
const value = '🏴‍☠️ Hello, world!';

suite('encryptRaw and decryptRaw', { concurrency: true }, () => {
  test('works on simple string', async () => {
    deepStrictEqual(await encryptRaw({ version, prf, value }).then(value => decryptRaw({ prf, value })), value);
  });
});

suite('encryptRaw', { concurrency: true }, () => {
  test('throws on invalid version', async () => {
    // @ts-expect-error
    await rejects(encryptRaw({ version: 'INVALID', prf, value }), { name: 'TypeError', message: 'envpass version "INVALID" is not supported.' });
  });
  test('throws on invalid prf', async () => {
    // @ts-expect-error
    await rejects(encryptRaw({ version, prf: 'INVALID', value }), { name: 'TypeError', message: 'prf "INVALID" is not an ArrayBuffer or Uint8Array.' });
  });
  test('throws on invalid value', async () => {
    // @ts-expect-error
    await rejects(encryptRaw({ version, prf, value: {} }), { name: 'TypeError', message: 'Value "{}" is not a string.' });
  });
  test('output value does not have base64 padding', async () => {
    for (const value of ['', 'a', 'aa', 'aaa', 'aaaa', 'aaaaa', 'aaaaaa', 'aaaaaaa']) {
      const output = await encryptRaw({ version, prf, value });
      notDeepStrictEqual(output.at(-1), '=');
    }
  });
});

suite('decryptRaw', { concurrency: true }, () => {
  const value = 'envpass:v1:AAA';
  test('throws on invalid prf', async () => {
    // @ts-expect-error
    await rejects(decryptRaw({ prf: 'INVALID', value }), { name: 'TypeError', message: 'prf "INVALID" is not an ArrayBuffer or Uint8Array.' });
  });
  test('throws on invalid value', async () => {
    // @ts-expect-error
    await rejects(decryptRaw({ prf, value: {} }), { name: 'TypeError', message: 'Value "{}" is not a string.' });
  });
  test('throws on invalid magic in value', async () => {
    // @ts-expect-error
    await rejects(decryptRaw({ prf, value: 'INVALID:v1:AAA' }), { name: 'TypeError', message: 'Value "INVALID:v1:AAA" is not an envpass encrypted value.' });
  });
  test('throws on invalid version in value', async () => {
    // @ts-expect-error
    await rejects(decryptRaw({ prf, value: 'envpass:INVALID:AAA' }), { name: 'TypeError', message: 'envpass version "INVALID" is not supported.' });
  });
  test('throws on invalid (non-base64) string in value', async () => {
    await rejects(decryptRaw({ prf, value: 'envpass:v1:🏴‍☠️' }), { name: 'SyntaxError', message: 'Found a character that cannot be part of a valid base64 string.' });
  });
});