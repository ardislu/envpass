import { suite, test } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { chdir, cwd } from 'node:process';

import { encrypt } from '#src/index.js';
import { setupPlaywright, mockOpen, assertConsole, setupFolder, fileEqual, fileNotEqual } from '#test/setup.js';

suite('import @ardislu/envpass/decrypt', () => {
  test('it works', async (t) => {
    const env = 'secret=some_secret_value';
    const { page } = await setupPlaywright(t);
    const { folder, envFile } = await setupFolder(t, env);
    mockOpen(t, page);
    assertConsole(t, { log: 1 }); // Decrypt should be silent, so only 1 log

    const oldDir = cwd();
    chdir(folder);

    // Verifies .env is encrypted
    await fileEqual(envFile, env);
    await encrypt();
    await fileNotEqual(envFile, env);

    deepStrictEqual(process.env.secret, undefined);
    await import('#src/decrypt.js');
    deepStrictEqual(process.env.secret, 'some_secret_value'); // Successfully decrypted and injected in process
    await fileNotEqual(envFile, env); // .env is NOT decrypted

    chdir(oldDir); // Release lock on temp folder to allow teardown
  });
});