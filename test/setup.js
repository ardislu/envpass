import { tmpdir } from 'node:os';
import { open, rm, mkdir, readFile } from 'node:fs/promises';
import { normalize } from 'node:path';
import { deepStrictEqual, ok } from 'node:assert/strict';
/** @import { TestContext } from 'node:test'; */

import { chromium } from 'playwright-core';
/** @import { Page } from 'playwright-core'; */

import { getPrf, BROWSER } from '#src/getPrf.js';
/** @import { GetPrfResult } from '#src/getPrf.js'; */

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
 * @returns {Promise<Pick<GetPrfResult,'url'|'prf'>&SetupServerResult>}>}
 */
export async function setupServer(t) {
  const controller = new AbortController();
  const { url, prf } = await getPrf({ autoOpen: false, signal: controller.signal });
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
 * Intercept the `open` function to open a Playwright browser to the page instead of the user's own browser.
 * @param {TestContext} t Test context to mock the `open` function for.
 * @param {Page} page Playwright `Page` to use to navigate to the URL instead of the user's browser.
 */

export function mockOpen(t, page) {
  /** @param {string} url */
  const interceptor = url => { page.goto(url); }
  t.mock.method(BROWSER, 'open', interceptor);
}

/**
 * @typedef AssertConsoleCounts The total number of times `console.debug`, `console.info`, `console.warn`, and
 * `console.error` are expected to be called.
 * @property {number} [debug] The number of times `console.debug` is expected to be called. The default value is 0.
 * @property {number} [info] The number of times `console.info` is expected to be called. The default value is 0.
 * @property {number} [warn] The number of times `console.warn` is expected to be called. The default value is 0.
 * @property {number} [error] The number of times `console.error` is expected to be called. The default value is 0.
 */

/**
 * Silences console functions during a test and asserts a given number of calls were made during the test. 
 * 
 * Console will only be silenced AFTER this function is called, and only until the test ends. Call this
 * function early in the test to avoid unexpected console calls.
 * @param {TestContext} t Test context to mock the `console` functions for.
 * @param {AssertConsoleCounts} [expected] Counts for the total number of times console functions are expected
 * to be called.
 */
export function assertConsole(t, expected = {}) {
  const actual = { debug: 0, info: 0, warn: 0, error: 0 };
  expected = { ...actual, ...expected };

  for (const m of /** @type {Array<keyof typeof actual>} */(Object.keys(actual))) {
    t.mock.method(console, m, () => actual[m]++);
    t.after(() => deepStrictEqual(actual[m], expected[m], `expected ${expected[m]} console.${m} calls, got ${actual[m]}`));
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