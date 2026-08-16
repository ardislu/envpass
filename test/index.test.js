import { suite, test } from 'node:test';
import { deepStrictEqual, rejects } from 'node:assert';
import childProcess from 'node:child_process';

import { encrypt, decrypt } from '#src/index.js';
import { BROWSER, WINDOW_EXPIRATION_DURATION } from '#src/getPrf.js';
import { setupPlaywright, setupEnv, mockOpen, assertConsole, MockLogger, fileEqual, fileNotEqual } from '#test/setup.js';

/** Standard value of the .env file used for most setups. */
const STD_ENV = 'A=123\nB=456\nC=789\n';

suite('e2e', () => {
  test('encrypt and decrypt .env', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile });
    await fileEqual(envFile, STD_ENV);
  });
  test('console logger works', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { debug: 24, info: 6, warn: 0, error: 0 });

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile, logger: console });
    await encrypt({ inFile: envFile, logger: console, alreadyEncryptedValue: 'log' });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile, logger: console });
    await decrypt({ inFile: envFile, logger: console, notEncryptedValue: 'log' });
    await fileEqual(envFile, STD_ENV);
  });
  test('alternate logger works', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });
    const logger = new MockLogger();

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile, logger });
    await encrypt({ inFile: envFile, logger, alreadyEncryptedValue: 'log' });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile, logger });
    await decrypt({ inFile: envFile, logger, notEncryptedValue: 'log' });
    await fileEqual(envFile, STD_ENV);
    logger.assertCounts({ debug: 24, info: 6, warn: 0, error: 0 });
  });
});

suite('encrypt', () => {
  test('does nothing to empty .env file', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, '');
    mockOpen(t, page);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await fileEqual(envFile, '');
    await encrypt({ inFile: envFile });
    await fileEqual(envFile, '');
  });
  test('does nothing when all variables are already encrypted', async (t) => {
    const openMock = t.mock.method(BROWSER, 'open');
    const env = 'A=envpass:v1:AAA\nB=envpass:v1:BBB\nC=envpass:v1:CCC\n';
    const envFile = await setupEnv(t, env);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await encrypt({ inFile: envFile });

    await fileEqual(envFile, env);
    deepStrictEqual(openMock.mock.calls.length, 0);
  });
  test("encrypts again when alreadyEncryptedValue: 'encrypt'", async (t) => {
    const { page } = await setupPlaywright(t);
    const env = 'A=envpass:v1:AAA\nB=envpass:v1:BBB\nC=envpass:v1:CCC\n';
    const envFile = await setupEnv(t, env);
    mockOpen(t, page);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await encrypt({ inFile: envFile, alreadyEncryptedValue: 'encrypt' });

    await fileNotEqual(envFile, env);
  });
  test("throws when alreadyEncryptedValue: 'error'", async (t) => {
    const env = 'A=envpass:v1:AAA\nB=envpass:v1:BBB\nC=envpass:v1:CCC\n';
    const envFile = await setupEnv(t, env);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await rejects(encrypt({ inFile: envFile, alreadyEncryptedValue: 'error' }), /Environment variable \".+\" is already encrypted\./);
  });
  test('throws if unable to get passkey', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { page, setAutomaticSignIn } = await setupPlaywright(t);
    await setAutomaticSignIn(false);
    const opened = mockOpen(t, page);
    const envFile = await setupEnv(t, STD_ENV);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    rejects(encrypt({ inFile: envFile }), { name: 'InputError', message: 'Unable to get passkey.' });
    await opened;
    t.mock.timers.tick(WINDOW_EXPIRATION_DURATION);
  });
});

suite('decrypt', () => {
  test('does nothing to empty .env file', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, '');
    mockOpen(t, page);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await fileEqual(envFile, '');
    await decrypt({ inFile: envFile });
    await fileEqual(envFile, '');
  });
  test('does nothing when all variables are already decrypted', async (t) => {
    const openMock = t.mock.method(BROWSER, 'open');
    const envFile = await setupEnv(t, STD_ENV);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await decrypt({ inFile: envFile });

    await fileEqual(envFile, STD_ENV);
    deepStrictEqual(openMock.mock.calls.length, 0);
  });
  test("throws error when notEncryptedValue='error'", async (t) => {
    const envFile = await setupEnv(t, STD_ENV);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    await rejects(decrypt({ inFile: envFile, notEncryptedValue: 'error' }), /Environment variable \".+\" is not encrypted\./);
  });
  test('throws if unable to get passkey', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { page, setAutomaticSignIn } = await setupPlaywright(t);
    await setAutomaticSignIn(false);
    const opened = mockOpen(t, page);
    const env = 'A=envpass:v1:AAA\nB=envpass:v1:BBB\nC=envpass:v1:CCC\n';
    const envFile = await setupEnv(t, env);
    assertConsole(t, { debug: 0, info: 0, warn: 0, error: 0 });

    rejects(decrypt({ inFile: envFile }), { name: 'InputError', message: 'Unable to get passkey.' });
    await opened;
    t.mock.timers.tick(WINDOW_EXPIRATION_DURATION);
  });
  test('passes through excess args to execute', async (t) => {
    const execMock = t.mock.method(childProcess, 'execSync', () => { });
    const envFile = await setupEnv(t, STD_ENV);

    await decrypt({ inFile: envFile }, { args: ['test', 'test', 'test'] });
    deepStrictEqual(execMock.mock.calls.length, 1);
  });
});
