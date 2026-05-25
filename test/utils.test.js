import { suite, test } from 'node:test';
import { ok, deepStrictEqual, throws } from 'node:assert/strict';

import { toEnvString, parseEnvpassEncrypted, InputError } from '#src/utils.js';
import { parseEnv } from 'node:util';

// Useful reference: https://dotenvx.com/spec/
suite('toEnvString', { concurrency: true }, () => {
  const vectors = [
    { name: 'empty object', obj: {}, str: '' },
    { name: 'simple object', obj: { a: '1', b: '2', c: '3' }, str: 'a=1\nb=2\nc=3\n' },
  ];
  for (const { name, obj, str } of vectors) {
    test(`converts: ${name}`, { concurrency: true }, () => {
      deepStrictEqual(toEnvString(obj), str);
    });
    test(`inverses parseEnv for: ${name}`, { concurrency: true }, () => {
      deepStrictEqual(toEnvString(parseEnv(str)), str);
    });
    test(`is inverse of parseEnv for: ${name}`, { concurrency: true }, () => {
      const env = Object.create(null);
      Object.assign(env, obj);
      deepStrictEqual(parseEnv(toEnvString(env)), env);
    });
  }
});

suite('parseEnvpassEncrypted', { concurrency: true }, () => {
  const rejects = [
    { name: 'rejects empty', input: '' },
    { name: 'rejects empty with colons', input: '::' },
    { name: 'rejects missing magic', input: ':v1:rXAhBNXZFsLl8EtZm3GHAZttZyLYP3j97Yy4qly53wBodRyyKYi8PlxjOlggc7mVLA/HoME4QSKdhuEs3C4UKvo0J3ZAV+JbrzfZbsBJ3tvvG4/UEVxB1+0IPoUyjhoO' },
    { name: 'rejects missing version', input: 'envpass::rXAhBNXZFsLl8EtZm3GHAZttZyLYP3j97Yy4qly53wBodRyyKYi8PlxjOlggc7mVLA/HoME4QSKdhuEs3C4UKvo0J3ZAV+JbrzfZbsBJ3tvvG4/UEVxB1+0IPoUyjhoO' },
    { name: 'rejects missing string', input: 'envpass:v1:' },
    { name: 'rejects invalid magic', input: 'INVALID:v1:rXAhBNXZFsLl8EtZm3GHAZttZyLYP3j97Yy4qly53wBodRyyKYi8PlxjOlggc7mVLA/HoME4QSKdhuEs3C4UKvo0J3ZAV+JbrzfZbsBJ3tvvG4/UEVxB1+0IPoUyjhoO' },
    { name: 'rejects invalid version', input: 'envpass:INVALID:rXAhBNXZFsLl8EtZm3GHAZttZyLYP3j97Yy4qly53wBodRyyKYi8PlxjOlggc7mVLA/HoME4QSKdhuEs3C4UKvo0J3ZAV+JbrzfZbsBJ3tvvG4/UEVxB1+0IPoUyjhoO' },
    { name: 'rejects leading whitespace', input: ' envpass:v1:rXAhBNXZFsLl8EtZm3GHAZttZyLYP3j97Yy4qly53wBodRyyKYi8PlxjOlggc7mVLA/HoME4QSKdhuEs3C4UKvo0J3ZAV+JbrzfZbsBJ3tvvG4/UEVxB1+0IPoUyjhoO' },
  ];
  for (const { name, input } of rejects) {
    test(name, { concurrency: true }, () => {
      deepStrictEqual(parseEnvpassEncrypted(input), null);
    });
  }
  const accepts = [
    { name: 'accepts envpass encrypted string', input: 'envpass:v1:rXAhBNXZFsLl8EtZm3GHAZttZyLYP3j97Yy4qly53wBodRyyKYi8PlxjOlggc7mVLA/HoME4QSKdhuEs3C4UKvo0J3ZAV+JbrzfZbsBJ3tvvG4/UEVxB1+0IPoUyjhoO' },
  ];
  for (const { name, input } of accepts) {
    test(name, { concurrency: true }, () => {
      deepStrictEqual(parseEnvpassEncrypted(input), input);
    });
  }
});

suite('InputError', { concurrency: true }, () => {
  test('is throwable', { concurrency: true }, () => {
    throws(() => { throw new InputError(); }, InputError);
  });
  test('inherits Error', { concurrency: true }, () => {
    ok(new InputError() instanceof Error);
  });
  test('sets name to "InputError"', { concurrency: true }, () => {
    deepStrictEqual(new InputError().name, 'InputError');
  });
  test('accepts string message', { concurrency: true }, () => {
    const msg = 'TEST';
    deepStrictEqual(new InputError(msg).message, msg);
  });
});