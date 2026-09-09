import { suite, test } from 'node:test';
import { deepStrictEqual, rejects } from 'node:assert';
import childProcess from 'node:child_process';

import { encrypt, decrypt } from '#src/index.js';
import { WINDOW_EXPIRATION_DURATION } from '#src/getPrf.js';
import { setupPlaywright, setupEnv, MockLogger, fileEqual, fileNotEqual } from '#test/setup.js';

/** Standard value of the .env file used for most setups. */
const STD_ENV = 'A=123\nB=456\nC=789\n';
/** Mock encrypted .env file. */
const ENCRYPTED_ENV = 'A=envpass:v1:AAA\nB=envpass:v1:BBB\nC=envpass:v1:CCC\n';
/** Single .env value for injection tests. */
const INJECTED_ENV = 'INJECTION_TEST=INJECTED';

suite('e2e', { concurrency: true }, () => {
  test('encrypt and decrypt .env', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile, getPrfOptions: { onListening: url => page.goto(url) } });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile, getPrfOptions: { onListening: url => page.goto(url) } });
    await fileEqual(envFile, STD_ENV);
  });
  test('logger works', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    const logger = new MockLogger();

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile, logger, getPrfOptions: { onListening: url => page.goto(url) } });
    await encrypt({ inFile: envFile, logger, alreadyEncryptedValue: 'log', getPrfOptions: { onListening: url => page.goto(url) } });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile, logger, getPrfOptions: { onListening: url => page.goto(url) } });
    await decrypt({ inFile: envFile, logger, notEncryptedValue: 'log', getPrfOptions: { onListening: url => page.goto(url) } });
    await fileEqual(envFile, STD_ENV);
    logger.assertCounts({ debug: 24, info: 6, warn: 0, error: 0 });
  });
});

suite('encrypt', { concurrency: true }, () => {
  test('does nothing to empty .env file', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, '');

    await fileEqual(envFile, '');
    await encrypt({ inFile: envFile, getPrfOptions: { onListening: url => page.goto(url) } });
    await fileEqual(envFile, '');
  });
  test('does nothing to empty .env file (with logs)', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, '');
    const logger = new MockLogger();

    await fileEqual(envFile, '');
    await encrypt({ inFile: envFile, logger, getPrfOptions: { onListening: url => page.goto(url) } });
    await fileEqual(envFile, '');
    logger.assertCounts({ debug: 1, info: 1, warn: 0, error: 0 });
  });
  test('does nothing when all variables are already encrypted', async (t) => {
    const envFile = await setupEnv(t, ENCRYPTED_ENV);

    await encrypt({ inFile: envFile });

    await fileEqual(envFile, ENCRYPTED_ENV);
  });
  test("encrypts again when alreadyEncryptedValue: 'encrypt'", async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, ENCRYPTED_ENV);

    await encrypt({ inFile: envFile, alreadyEncryptedValue: 'encrypt', getPrfOptions: { onListening: url => page.goto(url) } });

    await fileNotEqual(envFile, ENCRYPTED_ENV);
  });
  test("throws when alreadyEncryptedValue: 'error'", async (t) => {
    const envFile = await setupEnv(t, ENCRYPTED_ENV);

    await rejects(encrypt({ inFile: envFile, alreadyEncryptedValue: 'error' }), /Environment variable ".+" is already encrypted\./);
  });
  test('throws if unable to get passkey', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { page, setAutomaticSignIn } = await setupPlaywright(t);
    await setAutomaticSignIn(false);
    const envFile = await setupEnv(t, STD_ENV);
    const { promise: opened, resolve } = /** @type {PromiseWithResolvers<void>}*/(Promise.withResolvers());
    /** @type {(url: string) => Promise<void>} */
    const onListening = async url => {
      await page.goto(url);
      resolve();
    }

    const rejection = rejects(encrypt({ inFile: envFile, getPrfOptions: { onListening } }), { name: 'InputError', message: 'Unable to get passkey.' });
    await opened;
    t.mock.timers.tick(WINDOW_EXPIRATION_DURATION);
    await rejection;
  });
});

suite('decrypt', { concurrency: true }, () => {
  test('does nothing to empty .env file', async (t) => {
    await setupPlaywright(t);
    const envFile = await setupEnv(t, '');

    await fileEqual(envFile, '');
    await decrypt({ inFile: envFile });
    await fileEqual(envFile, '');
  });
  test('does nothing to empty .env file (with logs)', async (t) => {
    const envFile = await setupEnv(t, '');
    const logger = new MockLogger();

    await fileEqual(envFile, '');
    await decrypt({ inFile: envFile, logger });
    await fileEqual(envFile, '');
    logger.assertCounts({ debug: 1, info: 1, warn: 0, error: 0 });
  });
  test('does nothing when all variables are already decrypted', async (t) => {
    const envFile = await setupEnv(t, STD_ENV);

    await decrypt({ inFile: envFile });

    await fileEqual(envFile, STD_ENV);
  });
  test("throws error when notEncryptedValue='error'", async (t) => {
    const envFile = await setupEnv(t, STD_ENV);

    await rejects(decrypt({ inFile: envFile, notEncryptedValue: 'error' }), /Environment variable ".+" is not encrypted\./);
  });
  test('throws if unable to get passkey', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { page, setAutomaticSignIn } = await setupPlaywright(t);
    await setAutomaticSignIn(false);
    const env = 'A=envpass:v1:AAA\nB=envpass:v1:BBB\nC=envpass:v1:CCC\n';
    const envFile = await setupEnv(t, env);
    const { promise: opened, resolve } = /** @type {PromiseWithResolvers<void>}*/(Promise.withResolvers());
    /** @type {(url: string) => Promise<void>} */
    const onListening = async url => {
      await page.goto(url);
      resolve();
    }

    const rejection = rejects(decrypt({ inFile: envFile, getPrfOptions: { onListening } }), { name: 'InputError', message: 'Unable to get passkey.' });
    await opened;
    t.mock.timers.tick(WINDOW_EXPIRATION_DURATION);
    await rejection;
  });
  test('injects environment variables', async (t) => {
    const envFile = await setupEnv(t, INJECTED_ENV);

    deepStrictEqual(process.env.INJECTION_TEST, undefined);
    await decrypt({ inFile: envFile, injectInProcess: true });
    deepStrictEqual(process.env.INJECTION_TEST, 'INJECTED');
    delete process.env.INJECTION_TEST;
  });
  test('injects environment variables (with logs)', async (t) => {
    const envFile = await setupEnv(t, INJECTED_ENV);
    const logger = new MockLogger();

    deepStrictEqual(process.env.INJECTION_TEST, undefined);
    await decrypt({ inFile: envFile, injectInProcess: true, logger });
    deepStrictEqual(process.env.INJECTION_TEST, 'INJECTED');
    delete process.env.INJECTION_TEST;
    logger.assertCounts({ debug: 3, info: 0, warn: 0, error: 0 });
  });
  test('passes through excess args to execute', async (t) => {
    const envFile = await setupEnv(t, STD_ENV);
    /** @type {(command: string) => void} */
    const exec = command => deepStrictEqual(command, 'test test test');

    await decrypt({ inFile: envFile, exec }, { args: ['test', 'test', 'test'] });
  });
  test('passes through excess args to execute (with logs)', async (t) => {
    const envFile = await setupEnv(t, STD_ENV);
    /** @type {(command: string) => void} */
    const exec = command => deepStrictEqual(command, 'test test test');
    const logger = new MockLogger();

    await decrypt({ inFile: envFile, exec, logger }, { args: ['test', 'test', 'test'] });
    logger.assertCounts({ debug: 4, info: 0, warn: 0, error: 0 });
  });
});
