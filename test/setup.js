import { tmpdir } from 'node:os';
import { open, rm, mkdir, readFile } from 'node:fs/promises';
import { normalize } from 'node:path';
import { deepStrictEqual, ok } from 'node:assert/strict';
/** @import { TestContext } from 'node:test'; */

import { chromium } from 'playwright-core';
/** @import { Page } from 'playwright-core'; */

import { getPrf } from '#src/getPrf.js';
/** @import { GetPrfOptions, GetPrfResult } from '#src/getPrf.js'; */

/**
 * @typedef {Object} SetupPlaywrightOptions
 * @property {boolean} [headless] Whether to launch the browser in `headless` mode or not. The
 * default value is `true`.
 */

/**
 * @typedef {Object} SetupPlaywrightResult
 * @property {Page} page Playwright `Page` instance to control the browser.
 * @property {(enabled:boolean)=>Promise<void>} setAutomaticSignIn Configure if the browser will
 * automatically sign in with passkey when prompted.
 */

/**
 * Setup Playwright to test passkeys, with appropriate teardown hook.
 * @param {TestContext} t Test context to add `after` hook to.
 * @param {SetupPlaywrightOptions} [options] Selected debugging options to pass to Playwright.
 * @returns {Promise<SetupPlaywrightResult>}
 */
export async function setupPlaywright(t, options = {}) {
  const { headless = true } = options;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true
    }
  });
  const setAutomaticSignIn = async (/** @type {boolean}*/enabled) => {
    await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled });
  };
  t.after(async () => await browser.close());
  return { page, setAutomaticSignIn };
}

/**
 * @typedef {Object} SetupServerResult
 * @property {AbortController} controller `AbortController` for the `AbortSignal` which was passed to
 * the server. Call `controller.abort()` to close the server.
 */

/**
 * Setup an HTTP server to orchestrate a passkey flow, with appropriate teardown hook.
 * @param {TestContext} t Test context to add `after` hook to.
 * @param {GetPrfOptions} [getPrfOptions] Options for the passkey page and server.
 * @returns {Promise<Pick<GetPrfResult,'url'|'prf'>&SetupServerResult>}>}
 */
export async function setupServer(t, getPrfOptions = {}) {
  const controller = new AbortController();
  const { url, prf } = await getPrf({ onListening: null, signal: controller.signal, ...getPrfOptions });
  t.after(() => controller.abort());
  return { controller, url, prf };
}

/**
 * Create a temporary .env file for testing, with the appropriate teardown hook.
 * @param {TestContext} t Test context to add `after` hook to.
 * @param {string} [env] Content to write to the .env file. The default value is `''` (empty file).
 * @returns {Promise<string>} Path to the .env file.
 */
export async function setupEnv(t, env = '') {
  const path = normalize(`${tmpdir()}/envpass_test_${crypto.randomUUID()}.tmp`);
  const handle = await open(path, 'a+');
  await handle.writeFile(env);
  await handle.close();
  t.after(async () => { await rm(path); })
  return path;
}

/**
 * @typedef {Object} SetupFolderResult
 * @property {string} folder Path to the temporary folder.
 * @property {string} envFile Path to the `.env` file within the temporary folder.
 */

/**
 * Create a temporary folder with a `.env` file for testing. Includes appropriate teardown hook for the folder.
 * @param {TestContext} t Test context to add `after` hook to.
 * @param {string} [env] Content to write to the .env file. The default value is `''` (empty file).
 * @returns {Promise<SetupFolderResult>} Paths to the temporary folder and `.env` file.
 */
export async function setupFolder(t, env = '') {
  const folder = normalize(`${tmpdir()}/envpass_test_${crypto.randomUUID()}`);
  await mkdir(folder, { recursive: true });

  const envFile = normalize(`${folder}/.env`);
  const handle = await open(envFile, 'a+');
  await handle.writeFile(env);
  await handle.close();

  t.after(async () => { await rm(folder, { recursive: true, force: true }); })
  return { folder, envFile };
}

/**
 * @typedef AssertLoggerCounts The total number of times `Logger.debug`, `Logger.info`, `Logger.warn`, and
 * `Logger.error` are expected to be called.
 * @property {number} [debug] The number of times `Logger.debug` is expected to be called. The default value is 0.
 * @property {number} [info] The number of times `Logger.info` is expected to be called. The default value is 0.
 * @property {number} [warn] The number of times `Logger.warn` is expected to be called. The default value is 0.
 * @property {number} [error] The number of times `Logger.error` is expected to be called. The default value is 0.
 */

/** @typedef {'debug'|'info'|'warn'|'error'} LoggerMethod A supported logger method. */
/** @typedef {unknown[]} LoggerCall The arguments passed to a single logger method invocation. */
/**
 * @typedef Logs Captured logger calls, grouped by logger method.
 * @property {LoggerCall[]} debug All calls made to `logger.debug()`.
 * @property {LoggerCall[]} info All calls made to `logger.info()`.
 * @property {LoggerCall[]} warn All calls made to `logger.warn()`.
 * @property {LoggerCall[]} error All calls made to `logger.error()`.
 */

/**
 * A mock `Logger` that records a simple history of calls and provides helper methods to make assertions
 * about these calls.
 */
export class MockLogger {
  /** @type {Logs} */
  #logs = { debug: [], info: [], warn: [], error: [] };

  /**
   * Records a `debug()` call.
   * @param {...unknown} args
   */
  debug(...args) { this.#logs.debug.push(args); }

  /**
   * Records a `info()` call.
   * @param {...unknown} args
   */
  info(...args) { this.#logs.info.push(args); }

  /**
   * Records a `warn()` call.
   * @param {...unknown} args
   */
  warn(...args) { this.#logs.warn.push(args); }

  /**
   * Records a `error()` call.
   * @param {...unknown} args
   */
  error(...args) { this.#logs.error.push(args); }

  /** Record of all the logs made to this logger. */
  get logs() {
    return this.#logs;
  }

  /**
   * Asserts that each logger method was called the expected number of times.
   * @param {AssertLoggerCounts} counts
   */
  assertCounts(counts) {
    for (const method of /** @type {const} */(['debug', 'info', 'warn', 'error'])) {
      const actual = this.#logs[method].length;
      const expected = counts[method] ?? 0;
      deepStrictEqual(actual, expected, `expected ${expected} ${method} call(s), got ${actual}`);
    }
  }
}

/**
 * Assert a text file's contents are equal to expected contents.
 * @param {string} path Path to a text file.
 * @param {string} expected Expected contents of the text file.
 */
export async function fileEqual(path, expected) {
  const actual = await readFile(path, { encoding: 'utf8' });
  deepStrictEqual(actual, expected);
}

/**
 * Assert a text file's contents are NOT equal to expected contents.
 * @param {string} path Path to a text file.
 * @param {string} expected Contents which the text file should NOT be equal to.
 */
export async function fileNotEqual(path, expected) {
  const actual = await readFile(path, { encoding: 'utf8' });
  ok(actual !== expected);
}