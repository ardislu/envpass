import { suite, test } from 'node:test';
import { deepStrictEqual, match, ok, rejects } from 'node:assert/strict';

import { WINDOW_EXPIRATION_DURATION } from '#src/getPrf.js';
import { setupPlaywright, setupServer } from '#test/setup.js';

/**
 * @typedef {Object} MakePostRequestOptions
 * @property {Record<string,string|null>} [headers] Headers to set on the request. Set a property to
 * `null` to *delete* that header.
 * @property {string|null} [challenge] `challenge` string to pass on the request body.
 * @property {string|null} [prf] `prf` string to pass on the request body.
 */

/**
 * Construct a `Request` object for a POST request to the server.
 * @param {string} url The server URL to send the request to (including `challenge` URL search param).
 * @param {MakePostRequestOptions} [options] Optional settings to override the default valid values.
 */
function makePostRequest(url, options = {}) {
  const { origin, searchParams } = new URL(url);
  const {
    headers = {},
    challenge = searchParams.get('challenge'),
    prf = 'deadbeef000000000000000000000000000000000000000000000000cafebabe'
  } = options;
  const mergedHeaders = {
    'Content-Type': 'application/json',
    'Origin': origin,
    ...headers
  }
  const filteredHeaders = Object.fromEntries(Object.entries(mergedHeaders).filter(([, v]) => v !== null));
  const body = Object.fromEntries(Object.entries({ challenge, prf }).filter(([, v]) => v !== null));
  return new Request(origin, {
    method: 'POST',
    headers: filteredHeaders,
    body: JSON.stringify(body)
  });
}

suite('getPrf.js (server)', () => {
  test('valid GET works', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(url)).status, 200);
  });
  test('validates challenge query parameter on GET', async (t) => {
    const { url } = await setupServer(t);
    const { origin } = new URL(url);
    deepStrictEqual((await fetch(origin)).status, 401); // No challenge
    deepStrictEqual((await fetch(`${origin}?challenge=INVALID`)).status, 401); // Bad challenge
  });
  test('valid POST works', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url))).status, 200);
  });
  test('validates Origin header on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Origin': null } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Origin': 'null' } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Origin': 'https://example.com' } }))).status, 403);
  });
  test('validates Content-Type header on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Content-Type': null } }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Content-Type': 'INVALID' } }))).status, 400);
  });
  test('validates challenge on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { challenge: null }))).status, 401);
    deepStrictEqual((await fetch(makePostRequest(url, { challenge: 'INVALID' }))).status, 401);
  });
  test('validates prf on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: null }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: 'INVALID' }))).status, 400);
  });
  test('window expiration works', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); // MUST be called BEFORE setupServer()
    const { url } = await setupServer(t);

    deepStrictEqual((await fetch(url)).status, 200);
    t.mock.timers.tick(WINDOW_EXPIRATION_DURATION);
    rejects(fetch(url), { name: 'TypeError', message: 'fetch failed' });
  });
  test('abort works', async (t) => {
    const { url, controller } = await setupServer(t);

    deepStrictEqual((await fetch(url)).status, 200);
    controller.abort();
    rejects(fetch(url), { name: 'TypeError', message: 'fetch failed' });
  });
});

suite('getPrf.html (client)', () => {
  test('basic page and styles are present', async (t) => {
    const { setAutomaticSignIn, page } = await setupPlaywright(t);
    const { url } = await setupServer(t);

    await setAutomaticSignIn(false);
    await page.goto(url);

    // Basic instructions, title, and button are present
    match(await page.locator('p').textContent() ?? '', /^Create or select a passkey/);
    deepStrictEqual(await page.title(), 'envpass'); // Fails if it is the first test, but not if it comes second. Playwright bug?
    deepStrictEqual(await page.getByRole('button').textContent(), 'click here');

    // Light and dark themes work
    await page.emulateMedia({ colorScheme: 'light' });
    deepStrictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(217, 227, 242)');
    await page.emulateMedia({ colorScheme: 'dark' });
    deepStrictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(31, 47, 71)');
  });
  test('window expiration works', async (t) => {
    const { setAutomaticSignIn, page } = await setupPlaywright(t);
    const { url } = await setupServer(t);

    await setAutomaticSignIn(false);

    await page.clock.install();
    await page.goto(url);

    match(await page.locator('p').textContent() ?? '', /^Create or select a passkey/);
    await page.clock.runFor(WINDOW_EXPIRATION_DURATION);
    match(await page.locator('p').textContent() ?? '', /^This window has expired/);
  });
  test('create passkey on page load works', async (t) => {
    const { page } = await setupPlaywright(t);
    const { url, prf } = await setupServer(t);
    await page.goto(url);
    ok(await prf !== null);
  });
  test('create passkey on button click works', async (t) => {
    const { setAutomaticSignIn, page } = await setupPlaywright(t);
    const { url, prf } = await setupServer(t);
    await setAutomaticSignIn(false);
    await page.goto(url);
    await setAutomaticSignIn(true);
    await page.getByRole('button').click();
    ok(await prf !== null);
  });
  test('get passkey on page load works', async (t) => {
    const { page } = await setupPlaywright(t);
    const server1 = await setupServer(t);
    const server2 = await setupServer(t);

    await page.goto(server1.url); // Creates a new passkey
    const prf1 = await server1.prf;

    await page.goto(server2.url); // Gets the existing passkey
    const prf2 = await server2.prf;

    deepStrictEqual(prf1, prf2);
  });
  test('get passkey on button click works', async (t) => {
    const { setAutomaticSignIn, page } = await setupPlaywright(t);
    const server1 = await setupServer(t);
    const server2 = await setupServer(t);

    await page.goto(server1.url);
    const prf1 = await server1.prf;

    await setAutomaticSignIn(false);
    await page.goto(server2.url);
    await setAutomaticSignIn(true);
    await page.getByRole('button').click();
    const prf2 = await server2.prf;

    deepStrictEqual(prf1, prf2);
  });
  test('canceling in-flight request works', async (t) => {
    const { setAutomaticSignIn, page } = await setupPlaywright(t);
    const { url, prf } = await setupServer(t);

    await setAutomaticSignIn(false);
    await page.goto(url);

    // Will break if more than 3 clicks. I believe there is some internal queue within Playwright or CDP
    // that is getting clogged and causing the breakage. The purpose of this test is just to confirm the
    // last request wins, so it is not really necessary to fix this clogged requests issue.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button').click();
      // Block until next event loop turn to properly flush the aborted broadcast promise
      await page.evaluate(() => new Promise(r => setTimeout(r, 0)));
    }

    await setAutomaticSignIn(true);
    await page.getByRole('button').click();

    ok(await prf !== null);
  });
  test('window expiration timeout is cleared after successful broadcast', async (t) => {
    const { page } = await setupPlaywright(t);
    const { url } = await setupServer(t);
    await page.clock.install();
    await page.goto(url);

    match(await page.locator('p').textContent() ?? '', /^Successfully sent passkey/);
    await page.clock.runFor(WINDOW_EXPIRATION_DURATION);
    match(await page.locator('p').textContent() ?? '', /^Successfully sent passkey/);
  });
});