import { suite, test } from 'node:test';
import { deepStrictEqual, match, ok, rejects } from 'node:assert/strict';

import { WINDOW_EXPIRATION_DURATION } from '#src/getPrf.js';
import { setupPlaywright, setupServer } from '#test/setup.js';

suite('getPrf.js (server)', () => {
  test('validates challenge query parameter on GET', async (t) => {
    const { url } = await setupServer(t);
    const { origin } = new URL(url);

    deepStrictEqual((await fetch(origin)).status, 401); // No challenge
    deepStrictEqual((await fetch(`${origin}?challenge=INVALID`)).status, 401); // Bad challenge
    deepStrictEqual((await fetch(url)).status, 200); // Good
  });
  test('validates on POST', async (t) => {
    const { url, prf: prfActual } = await setupServer(t);
    const { origin, searchParams } = new URL(url);
    const challenge = searchParams.get('challenge');
    const prf = 'deadbeef000000000000000000000000000000000000000000000000cafebabe';

    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, prf }) })).status, 403); // No origin
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin: 'null', 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, prf }) })).status, 403); // Null origin
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin: 'https://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, prf }) })).status, 403); // Bad origin
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin }, body: JSON.stringify({ challenge, prf }) })).status, 400); // No Content-Type
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin, 'Content-Type': 'INVALID' }, body: JSON.stringify({ challenge, prf }) })).status, 400); // Bad Content-Type
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ prf }) })).status, 401); // No challenge
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: 'INVALID', prf }) })).status, 401); // Bad challenge
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge }) })).status, 400); // No prf
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, prf: 'INVALID' }) })).status, 400); // Bad prf
    deepStrictEqual((await fetch(origin, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, prf }) })).status, 200); // Good
    deepStrictEqual(await prfActual, Uint8Array.fromHex(prf));
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