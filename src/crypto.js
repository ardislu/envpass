/** @import { EnvpassVersion, EnvpassEncryptedValue } from '#src/utils.js'; */

/**
 * Create a `CryptoKey` from a high-entropy random value using HKDF.
 * @param {ArrayBuffer|ArrayBufferView<ArrayBuffer>} rand A high-entropy random value.
 * @param {ArrayBuffer|ArrayBufferView<ArrayBuffer>} salt A cryptographic salt value.
 * @param {ArrayBuffer|ArrayBufferView<ArrayBuffer>} info Additional contextual information.
 * @returns {Promise<CryptoKey>} A `CryptoKey` that can be used for `"encrypt"` or `"decrypt"`.
 */
async function getKey(rand, salt, info) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    rand,
    'HKDF',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-512',
      salt,
      info
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * @typedef {Object} EncryptRawOptions
 * @property {EnvpassVersion} [version] Encryption version to use. Currently, only `'v1'` is supported. The default
 * value is `'v1'`.
 * @property {ArrayBuffer|ArrayBufferView<ArrayBuffer>} prf Value returned by the passkey's pseudo-random function,
 * which will be used to derive the cryptographic key to encrypt the variables.
 * @property {string} value Plaintext value to encrypt.
 */

/**
 * Encrypt a given plaintext value using the value returned from a passkey's pseudo random function.
 * @param {EncryptRawOptions} options 
 * @returns {Promise<EnvpassEncryptedValue>} Encrypted envpass value.
 * @throws {TypeError} If an invalid option is passed.
 */
export async function encryptRaw(options) {
  const { version = 'v1', prf, value } = options;

  if (!ArrayBuffer.isView(prf) && !(prf instanceof ArrayBuffer)) {
    throw new TypeError(`prf "${prf}" is not an ArrayBuffer or ArrayBufferView.`);
  }

  if (typeof value !== 'string') {
    throw new TypeError(`Value "${value}" is not a string.`);
  }

  if (version === 'v1') {
    // Generate all required random values
    const salt = crypto.getRandomValues(new Uint8Array(64)); // For HKDF
    const iv = crypto.getRandomValues(new Uint8Array(12)); // For AES-GCM

    // Prepare non-crypto inputs
    const encoder = new TextEncoder();
    const encodedPlaintext = encoder.encode(value);
    const info = encoder.encode('https://github.com/ardislu/envpass');

    // Pad ciphertext so the final buffer length is a multiple of 3, to remove base64 padding. Not cryptographically
    // significant, just for aesthetics. +16 assumes ciphertext includes a 128 bit AES-GCM authentication tag.
    const p = 3 - ((salt.byteLength + iv.byteLength + encodedPlaintext.byteLength + 16) % 3);
    const paddedPlaintext = new Uint8Array(encodedPlaintext.byteLength + p);
    paddedPlaintext.set([p]); // Offset to discard on decode
    paddedPlaintext.set(encodedPlaintext, p); // Gap filled with zero bytes, e.g. [3, 0, 0, ...encodedPlaintext]

    const key = await getKey(prf, salt, info);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      paddedPlaintext
    ));

    const buffer = new Uint8Array(salt.byteLength + iv.byteLength + ciphertext.byteLength);
    buffer.set(salt);
    buffer.set(iv, salt.byteLength);
    buffer.set(ciphertext, salt.byteLength + iv.byteLength);

    return `envpass:${version}:${buffer.toBase64()}`;
  }

  throw new TypeError(`envpass version "${version}" is not supported.`);
}

/**
 * @typedef {Object} DecryptRawOptions
 * @property {ArrayBuffer|ArrayBufferView<ArrayBuffer>} prf Value returned by the passkey's pseudo-random function,
 * which will be used to derive the cryptographic key to decrypt the variables.
 * @property {EnvpassEncryptedValue} value Encrypted ciphertext value to decrypt.
 */

/**
 * Encrypt an envpass encrypted value using the value returned from a passkey's pseudo random function.
 * @param {DecryptRawOptions} options 
 * @returns {Promise<string>} Decrypted plaintext value.
 * @throws {TypeError} If an invalid option is passed.
 */
export async function decryptRaw(options) {
  const { prf, value } = options;
  const [magic, version, valueBase64] = value.split(':');

  if (!ArrayBuffer.isView(prf) && !(prf instanceof ArrayBuffer)) {
    throw new TypeError(`prf "${prf}" is not an ArrayBuffer or ArrayBufferView.`);
  }

  if (magic !== 'envpass') {
    throw new TypeError(`Value "${value}" is not an envpass encrypted value.`);
  }

  if (version === 'v1') {
    // Extract random values
    const buffer = Uint8Array.fromBase64(valueBase64);
    const salt = buffer.slice(0, 64); // For HKDF
    const iv = buffer.slice(64, 76); // For AES-GCM
    const ciphertext = buffer.slice(76);

    // Prepare non-crypto inputs
    const info = new TextEncoder().encode('https://github.com/ardislu/envpass');

    const key = await getKey(prf, salt, info);
    const encodedPlaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    ));
    const unpaddedPlaintext = encodedPlaintext.slice(encodedPlaintext[0]);

    const plaintext = new TextDecoder().decode(unpaddedPlaintext);

    return plaintext;
  }

  throw new TypeError(`envpass version "${version}" is not supported.`);
}