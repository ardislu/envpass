import http from 'node:http';
import { readFile } from 'node:fs/promises';
/** @import { AddressInfo } from 'node:net'; */

import open from 'open';

import { parsePrf } from '#src/utils.js';
/** @import { Bytes32 } from '#src/utils.js'; */

/**
 * Wrapper around browser operations (currently, only `open`). This wrapper object is required
 * to mock the methods for testing purposes.
 */
export const BROWSER = { open };

/**
 * 2 minutes in milliseconds. After this duration, the http server will close and the flow
 * must be restarted.
 */
export const WINDOW_EXPIRATION_DURATION = 2 * 60 * 1000;

/**
 * @typedef {Object} GetPrfOptions
 * @property {boolean} [autoOpen] Automatically open a web browser to the passkey page. The default
 * value is `true`.
 * @property {number} [port] IP port number to use for the local server hosting the passkey page. By
 * default, defer to the operating system to assign a number.
 * @property {AbortSignal} [signal] `AbortSignal` which may be used to cancel this passkey flow.
 */

/**
 * @typedef {Object} GetPrfResult
 * @property {string} url URL on `localhost` to open to complete the passkey flow.
 * @property {Promise<Bytes32|null>} prf 32-byte value returned from the user passkey's pseudo random
 * function, or `null` if the flow was aborted or timed out before the PRF was executed.
 */

/**
 * Create a minimal HTTP server to coordinate an OAuth-like workflow to get a passkey's PRF value.
 * 
 * This function will open a web browser to a minimal HTML page that prompts the user to create or get a passkey
 * on `localhost`, run the passkey's pseudo random function, then pass the value back to the server.
 * @param {GetPrfOptions} [options] Options for the passkey page and server.
 * @returns {Promise<GetPrfResult>} Object containing the URL to complete the passkey flow and a `Promise` for
 * the passkey's PRF value.
 */
export async function getPrf(options = {}) {
  const {
    autoOpen = true,
    port = undefined,
    signal = undefined
  } = options;

  // MUST immediately throw if already aborted to prevent conflicting passkey flows
  if (signal !== undefined) { signal.throwIfAborted(); }

  // Setup all promises
  const { promise: urlPromise, resolve: urlResolve } = /** @type {PromiseWithResolvers<string>}*/(Promise.withResolvers());
  const { promise: prfPromise, resolve: prfResolve } = /** @type {PromiseWithResolvers<Bytes32>}*/(Promise.withResolvers());
  const { promise: abortPromise, resolve: abortResolve } = /** @type {PromiseWithResolvers<null>}*/(Promise.withResolvers());

  const html = await readFile(new URL('./getPrf.html', import.meta.url));
  const server = http.createServer();

  // Flow expires after 2 minutes or canceled
  const timeoutId = setTimeout(() => server.close(() => abortResolve(null)), WINDOW_EXPIRATION_DURATION);
  if (signal !== undefined) {
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      server.close(() => abortResolve(null));
    }, { once: true });
  }

  // Challenge is used to verify the client POST-ing to the server was instantiated from this code
  const challenge = crypto.getRandomValues(new Uint8Array(32)).toHex();

  server.on('request', (request, response) => {
    // Return minimal client-side code to get a passkey prf value
    if (request.method === 'GET') {
      const url = new URL(`http://localhost${request.url}`);
      if (url.searchParams.get('challenge') !== challenge) {
        response.writeHead(401).end();
        return;
      }
      response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(html);
      return;
    }
    // Verify then use the prf
    else if (request.method === 'POST') {
      const { port } = server.address();
      if (request.headers.origin !== `http://localhost:${port}`) {
        response.writeHead(403).end();
        return;
      }
      let body = '';
      request.on('data', chunk => body += chunk);
      request.on('end', () => {
        const payload = JSON.parse(body);
        if (payload.challenge !== challenge) {
          response.writeHead(401).end();
          return;
        }
        const prf = parsePrf(payload.prf);
        if (prf === null) {
          response.writeHead(400).end();
          return;
        }
        response.writeHead(200).end();
        server.close();
        clearTimeout(timeoutId);
        prfResolve(prf);
        return;
      });
    }
  });

  server.listen(port, 'localhost');
  server.on('listening', () => {
    const { port } = /** @type {AddressInfo} */(server.address());
    const url = `http://localhost:${port}?challenge=${challenge}`;
    urlResolve(url);
    if (autoOpen) { BROWSER.open(url); }
  });

  return {
    url: await urlPromise,
    prf: Promise.any([prfPromise, abortPromise])
  };
}