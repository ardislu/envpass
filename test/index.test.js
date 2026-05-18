import { suite, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { encrypt, decrypt } from '#src/index.js';
import { setupPlaywright, setupEnv, mockOpen, assertConsole, fileEqual, fileNotEqual } from '#test/setup.js';

/** Standard value of the .env file used for most setups. */
const STD_ENV = 'A=123\nB=456\nC=789\n';

suite('e2e', () => {
  test('encrypt and decrypt .env', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { log: 2 });

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile });
    await fileEqual(envFile, STD_ENV);
  });
  test('encrypt and decrypt .env silently', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { log: 0 });

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile, silent: true });
    await fileNotEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile, silent: true });
    await fileEqual(envFile, STD_ENV);
  });
  test('does nothing to empty .env file', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, '');
    mockOpen(t, page);
    assertConsole(t, { log: 2 });

    await fileEqual(envFile, '');
    await encrypt({ inFile: envFile });
    await fileEqual(envFile, '');
    await decrypt({ inFile: envFile });
    await fileEqual(envFile, '');
  });
  test('does nothing to empty .env file silently', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, '');
    mockOpen(t, page);
    assertConsole(t, { log: 0 });

    await fileEqual(envFile, '');
    await encrypt({ inFile: envFile, silent: true });
    await fileEqual(envFile, '');
    await decrypt({ inFile: envFile, silent: true });
    await fileEqual(envFile, '');
  });
  test('ignores variables already encrypted', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { log: 3 });

    await fileEqual(envFile, STD_ENV);
    await encrypt({ inFile: envFile });

    const newContent = await readFile(envFile, { encoding: 'utf8' });
    await encrypt({ inFile: envFile });
    await fileEqual(envFile, newContent);

    await decrypt({ inFile: envFile });;
    await fileEqual(envFile, STD_ENV);
  });
  test('ignores variables already decrypted', async (t) => {
    const { page } = await setupPlaywright(t);
    const envFile = await setupEnv(t, STD_ENV);
    mockOpen(t, page);
    assertConsole(t, { log: 1 });

    await fileEqual(envFile, STD_ENV);
    await decrypt({ inFile: envFile });
    await fileEqual(envFile, STD_ENV);
  });
});
