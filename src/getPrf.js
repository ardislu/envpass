import http from 'node:http';
import { readFile } from 'node:fs/promises';
/** @import { AddressInfo } from 'node:net'; */

import open from 'open';

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

  const html = await readFile(new URL('./getPrf.html', import.meta.url), { encoding: 'utf8' });

  // Generate hashes of <style> and <script> contents for the CSP header
  const encoder = new TextEncoder();
  const style = html.match(/<style.*>([\s\S]*)<\/style>/i)?.[1];
  const script = html.match(/<script.*>([\s\S]*)<\/script>/i)?.[1];
  if (style === undefined) {
    throw new Error('Could not find <style> tag in getPrf.html file.');
  }
  if (script === undefined) {
    throw new Error('Could not find <script> tag in getPrf.html file.');
  }
  const styleHash = new Uint8Array(await crypto.subtle.digest('SHA-512', encoder.encode(style))).toBase64();
  const scriptHash = new Uint8Array(await crypto.subtle.digest('SHA-512', encoder.encode(script))).toBase64();

  const server = http.createServer();
  server.keepAliveTimeout = 0;
  server.maxRequestsPerSocket = 1;
  server.requestTimeout = 1000;

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
    const { port } = /** @type {AddressInfo} */(server.address());
    // Return minimal client-side code to get a passkey prf value
    if (request.method === 'GET') {
      const url = new URL(`http://localhost${request.url}`);
      if (url.searchParams.get('challenge') !== challenge) {
        response.writeHead(401, { 'Content-Length': 0 }).end();
        return;
      }
      response
        .writeHead(200, {
          'Content-Type': 'text/html',
          'Content-Length': new TextEncoder().encode(html).length,
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Content-Security-Policy': `
            default-src 'none';
            connect-src http://localhost:${port};
            style-src 'sha512-${styleHash}';
            script-src 'sha512-${scriptHash}';
            base-uri 'none';
            frame-ancestors 'none';
            form-action 'none';
            require-trusted-types-for 'script';
          `.replace(/\s+/g, ' ') // Collapse whitespace
        })
        .end(html);
      return;
    }
    // Verify then use the prf
    else if (request.method === 'POST') {
      if (request.headers.origin !== `http://localhost:${port}`
        || request.headers['sec-fetch-site'] !== 'same-origin'
        || request.headers['sec-fetch-mode'] !== 'cors'
        || request.headers['sec-fetch-dest'] !== 'empty') {
        response.writeHead(403, { 'Content-Length': 0 }).end();
        return;
      }
      if (request.headers['content-length'] === undefined) { // Refuse Transfer-Encoding: chunked
        response.writeHead(411, { 'Content-Length': 0 }).end();
        return;
      }
      if (request.headers['content-type'] !== 'application/octet-stream') {
        response.writeHead(400, { 'Content-Length': 0 }).end();
        return;
      }
      if (request.headers['envpass-challenge'] !== challenge) {
        response.writeHead(401, { 'Content-Length': 0 }).end();
        return;
      }
      // PRF is always 32 bytes, see https://w3c.github.io/webauthn/#prf-extension
      const prf = /** @type {Bytes32}*/(new Uint8Array(32));
      let offset = 0;
      request.on('data', chunk => {
        try { prf.set(chunk, offset); }
        catch { // Invalid chunk or too many bytes, stop processing immediately.
          prf.fill(0);
          response.writeHead(400, { 'Content-Length': 0 }).end();
          request.destroy();
          return;
        }
        chunk.fill(0);
        offset += chunk.byteLength;
      });
      request.on('end', () => {
        if (offset !== 32) { // Not all 32 PRF bytes were from passkey
          prf.fill(0);
          response.writeHead(400, { 'Content-Length': 0 }).end();
          return;
        }
        response.writeHead(200, { 'Content-Length': 0 }).end();
        server.close();
        clearTimeout(timeoutId);
        prfResolve(prf);
        return;
      });
    }
    // Explicitly reject all other methods
    else {
      response.writeHead(400, { 'Content-Length': 0 }).end();
      return;
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