import { suite, test } from 'node:test';
import { deepStrictEqual } from 'node:assert';

import { encrypt, decrypt } from '#src/index.js';
import { BROWSER } from '#src/getPrf.js';
import { setupPlaywright, setupEnv, mockOpen, assertConsole, fileEqual, fileNotEqual } from '#test/setup.js';

/** Standard value of the .env file used for most setups. */
const STD_ENV = 'A=123\nB=456\nC=789\n';

suite('e2e', () => {
  test('encrypt and decrypt .env', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { info: 0 });

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
    assertConsole(t, { info: 6 });

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile });
    await encrypt({ inFile: envFile, logger: console, alreadyEncryptedValue: 'log' });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile });
    await decrypt({ inFile: envFile, logger: console, notEncryptedValue: 'log' });
    await fileEqual(envFile, STD_ENV);
  });
  test('does nothing to empty .env file', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, '');
    mockOpen(t, page);
    assertConsole(t, { info: 0 });

    await fileEqual(envFile, '');
    await encrypt({ inFile: envFile });
    await fileEqual(envFile, '');
    await decrypt({ inFile: envFile });
    await fileEqual(envFile, '');
  });
  test('encrypt does nothing when all variables are already encrypted', async (t) => {
    const openMock = t.mock.method(BROWSER, 'open');
    const env = 'A=envpass:v1:AAA\nB=envpass:v1:BBB\nC=envpass:v1:CCC\n';
    const envFile = await setupEnv(t, env);
    assertConsole(t, { info: 0 });

    await encrypt({ inFile: envFile });

    await fileEqual(envFile, env);
    deepStrictEqual(openMock.mock.calls.length, 0);
  });
  test('decrypt does nothing when all variables are already decrypted', async (t) => {
    const openMock = t.mock.method(BROWSER, 'open');
    const envFile = await setupEnv(t, STD_ENV);
    assertConsole(t, { info: 0 });

    await decrypt({ inFile: envFile });

    await fileEqual(envFile, STD_ENV);
    deepStrictEqual(openMock.mock.calls.length, 0);
  });
});
