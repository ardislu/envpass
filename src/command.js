import { parseEnv } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
/** @import { PathLike } from 'node:fs'; */

import { getPrf } from '#src/getPrf.js';
import { encryptRaw, decryptRaw } from '#src/crypto.js';
import { toEnvString, parseEnvpassEncrypted, InputError } from '#src/utils.js';
/** @import { GetPrfOptions } from '#src/getPrf.js'; */
/** @import { Logger, Env } from '#src/utils.js'; */

/**
 * @typedef {Object} EncryptOptions
 * @property {PathLike} [inFile] Path to the unencrypted .env file. The default value is `'.env'`.
 * @property {PathLike|false} [outFile] Path to write the encrypted .env file to, or `false` to not write to any
 * file. The default value is set to the value of `inFile` (i.e., *overwrite* the `inFile` with encrypted values).
 * @property {'ignore'|'log'|'encrypt'|'error'} [alreadyEncryptedValue] What to do when encountering a value
 * that is already envpass encrypted (i.e., the value is already in the format `'envpass:{version}:{string}'`).
 * - `'ignore'` will not encrypt the value and instead passthrough the value as-is.
 * - `'log'` will do the same as `'ignore'`, but also log the variable name to `logger.info()`.
 * - `'encrypt'` will encrypt the value again anyway.
 * - `'error'` will throw an error.
 * 
 * The default value is `'ignore'`.
 * @property {GetPrfOptions} [getPrfOptions] Options for the passkey page and server.
 * @property {Logger} [logger] Logger to use to record diagnostic information. The default value is `{}` (i.e.,
 * drop all logs).
 */

/**
 * Encrypt a .env file using a passkey.
 * @param {EncryptOptions} [options] Options to configure the encryption.
 * @returns {Promise<void>} `Promise` resolving when the encryption is complete.
 */
export async function encrypt(options = {}) {
  const {
    inFile = '.env',
    outFile = inFile,
    alreadyEncryptedValue = 'ignore',
    getPrfOptions = { autoOpen: true, port: undefined },
    logger = {}
  } = options;

  /** @type {Record<string, string>} */
  const env = await readFile(inFile, { encoding: 'utf-8' }).then(parseEnv);
  logger.debug?.('Environment variables read and parsed.');
  if (Object.keys(env).length === 0) {
    logger.info?.('No environment variables found, aborting.');
    return;
  }

  let prf = null;
  /** @type {Env} */const encryptedEnv = Object.create(null);
  for (const [envVar, value] of Object.entries(env)) {
    const parsedValue = parseEnvpassEncrypted(value);
    if (parsedValue !== null) {
      encryptedEnv[envVar] = parsedValue;
      switch (alreadyEncryptedValue) {
        case 'ignore': continue;
        case 'log': logger.info?.(`Environment variable "${envVar}" is already encrypted, ignoring.`); continue;
        case 'encrypt': break;
        case 'error': throw new Error(`Environment variable "${envVar}" is already encrypted.`);
      }
    }

    if (prf === null) {
      logger.debug?.('PRF is required but not yet set, initiating passkey flow.');
      const { url, prf: prfPromise } = await getPrf(getPrfOptions);
      logger.debug?.(`Passkey flow initiated at ${url}.`);
      prf = await prfPromise;
      if (prf === null) {
        throw new InputError('Unable to get passkey.');
      }
      logger.debug?.('Passkey flow successfully completed and PRF set.');
    }
    const encryptedValue = await encryptRaw({ prf, value });
    encryptedEnv[envVar] = encryptedValue;
    logger.debug?.(`Variable "${envVar}" handled.`);
  }
  logger.debug?.('All environment variables handled.');

  if (outFile) {
    await writeFile(outFile, toEnvString(encryptedEnv));
    logger.debug?.('Wrote environment variables to file.');
  }
}

/**
 * @typedef {Object} DecryptOptions
 * @property {PathLike} [inFile] Path to the encrypted .env file. The default value is `'.env'`.
 * @property {PathLike|false} [outFile] Path to write the unencrypted .env file to, or `false` to not write to any
 * file. The default value is set to the value of `inFile` (i.e., *overwrite* the `inFile` with unencrypted values).
 * @property {boolean} [injectInProcess] If `true`, ignore `outFile` and set keys in `process.env` with the decrypted
 * values. The default value is `false`.
 * @property {'ignore'|'log'|'error'} [notEncryptedValue] What to do when encountering a value
 * that is not envpass encrypted (i.e., the value is not in the format `'envpass:{version}:{string}'`).
 * - `'ignore'` will passthrough the value as-is.
 * - `'log'` will do the same as `'ignore'`, but also log the variable name to `logger.info()`.
 * - `'error'` will throw an error.
 * 
 * The default value is `'ignore'`.
 * @property {GetPrfOptions} [getPrfOptions] Options for the passkey page and server.
 * @property {Logger} [logger] Logger to use to record diagnostic information. The default value is `{}` (i.e.,
 * drop all logs).
 */

/**
 * Decrypt an envpass encrypted .env file using a passkey.
 * @param {DecryptOptions} [options] Options to configure the decryption.
 * @param {{ args?: Array<string> }} [command] Excess arguments passed to the command, which will be executed as
 * a child process after decryption.
 * @returns {Promise<void>} `Promise` resolving when the decryption is complete.
 */
export async function decrypt(options = {}, { args = [] } = {}) {
  const {
    inFile = '.env',
    outFile = inFile,
    injectInProcess = false,
    notEncryptedValue = 'ignore',
    getPrfOptions = { autoOpen: true, port: undefined },
    logger = {}
  } = options;

  const env = await readFile(inFile, { encoding: 'utf-8' }).then(parseEnv);
  logger.debug?.('Environment variables read and parsed.');
  if (Object.keys(env).length === 0) {
    logger.info?.('No environment variables found, aborting.');
    return;
  }

  let prf = null;
  /** @type {Env} */const decryptedEnv = {};
  for (const [envVar, value] of Object.entries(env)) {
    if (value === undefined) {
      logger.info?.(`Environment variable "${envVar}" is unset, skipping decryption.`);
      decryptedEnv[envVar] = '';
      continue;
    }

    const parsedValue = parseEnvpassEncrypted(value);
    if (parsedValue === null) {
      decryptedEnv[envVar] = value;
      switch (notEncryptedValue) {
        case 'ignore': continue;
        case 'log': logger.info?.(`Environment variable "${envVar}" is not encrypted, ignoring.`); continue;
        case 'error': throw new Error(`Environment variable "${envVar}" is not encrypted.`);
      }
    }

    if (prf === null) {
      logger.debug?.('PRF is required but not yet set, initiating passkey flow.');
      const { url, prf: prfPromise } = await getPrf(getPrfOptions);
      logger.debug?.(`Passkey flow initiated at ${url}.`);
      prf = await prfPromise;
      if (prf === null) {
        throw new InputError('Unable to get passkey.');
      }
      logger.debug?.('Passkey flow successfully completed and PRF set.');
    }
    const decryptedValue = await decryptRaw({ prf, value: parsedValue });
    decryptedEnv[envVar] = decryptedValue;
    logger.debug?.(`Variable "${envVar}" handled.`);
  }
  logger.debug?.('All environment variables handled.');

  if (injectInProcess) {
    for (const [envVar, value] of Object.entries(decryptedEnv)) {
      process.env[envVar] = value;
    }
    logger.debug?.('Injected environment variables to process.env.');
  }
  else {
    if (outFile) {
      await writeFile(outFile, toEnvString(decryptedEnv));
      logger.debug?.('Wrote environment variables to file.');
    }
  }
  if (args.length > 0) {
    logger.debug?.('Follow-on command found, executing in child process.');
    execSync(args.join(' '), { stdio: 'inherit' });
  }
}