import { suite, test } from 'node:test';
import { deepStrictEqual, match, ok, rejects } from 'node:assert/strict';
import { Readable } from 'node:stream';

import { request } from 'undici';

import { SERVER, WINDOW_EXPIRATION_DURATION } from '#src/getPrf.js';
import { setupPlaywright, setupServer } from '#test/setup.js';

/**
 * Return a new object where all properties in the object with the value `null` are *deleted*.
 * @template T
 * @param {Record<string,T|null>} obj An object that may have properties with a `null` value.
 * @returns {Record<string,NonNullable<T>>}
 */
function filterNullValues(obj) {
  return /** @type {Record<string,NonNullable<T>>} */(
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null))
  );
}

/**
 * @typedef {Object} MakePostRequestOptions
 * @property {Record<string,string|null>} [headers] Headers to set on the request. Set a property to
 * `null` to *delete* that header.
 * @property {ArrayBuffer|Uint8Array<ArrayBuffer>|null} [prf] `prf` buffer to pass on the request body.
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
    prf = Uint8Array.fromHex('deadbeef000000000000000000000000000000000000000000000000cafebabe')
  } = options;
  const mergedHeaders = {
    'Content-Type': 'application/octet-stream',
    'Origin': origin,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Envpass-Challenge': searchParams.get('challenge'),
    ...headers
  }
  const filteredHeaders = filterNullValues(mergedHeaders);
  return new Request(origin, {
    method: 'POST',
    headers: filteredHeaders,
    body: prf
  });
}

suite('getPrf.js (server)', () => {
  test('validates <style> tag is present in HTML template', async (t) => {
    const html = await SERVER.getHTML();
    const modified = html.replaceAll('<style>', '');
    t.mock.method(SERVER, 'getHTML', () => modified);
    await rejects(setupServer(t), { message: 'Could not find <style> tag in getPrf.html file.' });
  });
  test('validates <script> tag is present in HTML template', async (t) => {
    const html = await SERVER.getHTML();
    const modified = html.replaceAll('<script type="module">', '');
    t.mock.method(SERVER, 'getHTML', () => modified);
    await rejects(setupServer(t), { message: 'Could not find <script> tag in getPrf.html file.' });
  });
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
  test('validates Sec-Fetch-Site header on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Site': null } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Site': 'same-site' } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Site': 'same-origin' } }))).status, 200);
  });
  test('validates Sec-Fetch-Mode header on POST', async (t) => {
    // undici `fetch` does not allow changing the Sec-Fetch-Mode header, so use the lower-level `request` instead.
    // See https://github.com/nodejs/undici/issues/1305
    const { url } = await setupServer(t);
    const { origin, searchParams } = new URL(url);
    const prf = Uint8Array.fromHex('deadbeef000000000000000000000000000000000000000000000000cafebabe');
    const options = {
      method: 'POST',
      headers: /** @type {Record<string,string>} */({
        'Content-Type': 'application/octet-stream',
        'Origin': origin,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Dest': 'empty',
        'Envpass-Challenge': searchParams.get('challenge')
      }),
      body: prf
    }
    deepStrictEqual((await request(origin, options)).statusCode, 403); // Tests the unset case
    options.headers['Sec-Fetch-Mode'] = 'navigate';
    deepStrictEqual((await request(origin, options)).statusCode, 403);
    options.headers['Sec-Fetch-Mode'] = 'no-cors';
    deepStrictEqual((await request(origin, options)).statusCode, 403);
    options.headers['Sec-Fetch-Mode'] = 'same-origin';
    deepStrictEqual((await request(origin, options)).statusCode, 403);
    options.headers['Sec-Fetch-Mode'] = 'websocket';
    deepStrictEqual((await request(origin, options)).statusCode, 403);
    options.headers['Sec-Fetch-Mode'] = 'cors';
    deepStrictEqual((await request(origin, options)).statusCode, 200);
  });
  test('validates Sec-Fetch-Dest header on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Dest': null } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Dest': 'frame' } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Dest': 'iframe' } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Dest': 'document' } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Dest': 'embed' } }))).status, 403);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Sec-Fetch-Dest': 'empty' } }))).status, 200);
  });
  test('rejects Transfer-Encoding: chunked on POST', async (t) => {
    const { url } = await setupServer(t);
    // Using the lower-level `request` instead to force Transfer-Encoding
    const { origin, searchParams } = new URL(url);
    const options = {
      method: 'POST',
      headers: /** @type {Record<string,string>} */({
        'Content-Type': 'application/octet-stream',
        'Origin': origin,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Envpass-Challenge': searchParams.get('challenge')
      }),
      body: Readable.from([Uint8Array.fromHex('deadbeef000000000000000000000000000000000000000000000000cafebabe')])
    }
    deepStrictEqual((await request(origin, options)).statusCode, 411);
  });
  test('validates Content-Type header on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Content-Type': null } }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Content-Type': 'INVALID' } }))).status, 400);
  });
  test('validates Envpass-Challenge header on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Envpass-Challenge': null } }))).status, 401);
    deepStrictEqual((await fetch(makePostRequest(url, { headers: { 'Envpass-Challenge': 'INVALID' } }))).status, 401);
  });
  test('validates prf on POST', async (t) => {
    const { url } = await setupServer(t);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: null }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: new Uint8Array() }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: Uint8Array.fromHex('11') }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: Uint8Array.fromHex('11'.repeat(31)) }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: Uint8Array.fromHex('11'.repeat(33)) }))).status, 400);
    deepStrictEqual((await fetch(makePostRequest(url, { prf: Uint8Array.fromHex('11'.repeat(32)) }))).status, 200);
  });
  test('rejects all request methods that are not GET or POST', async (t) => {
    const { url } = await setupServer(t);
    for (const method of ['DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'PUT']) {
      deepStrictEqual((await fetch(url, { method })).status, 400);
    }
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