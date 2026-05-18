/**
 * @typedef {{[key:string]:string|undefined}} Env A simple null prototype object dictionary to map environment
 * variable names to values.
 */

/**
 * Convert an `Env` object into a `string` ready to be written to an env file. Inverse of `parseEnv()`.
 * @param {Env} obj Any object where all values are stringify-able.
 * @returns {string} Parsed and normalized `string` ready to be written to an env file.
 */
export function toEnvString(obj) {
  let str = '';
  for (const [envVar, value] of Object.entries(obj)) {
    str += `${envVar}=${value}\n`;
  }
  return str;
}

/**
 * @typedef {Uint8Array<ArrayBuffer>&{byteLength:32}} Bytes32
 */

/**
 * Returns whether `value` is `Bytes32` or not. This function is NOT intended to be directly called.
 * Use `parsePrf` instead ("parse, don't validate").
 * 
 * This function is only defined separately to make the `value is Bytes32` assertion for TypeScript.
 * @param {any} value A value that may be a `Bytes32`.
 * @returns {value is Bytes32}
 */
function isBytes32(value) {
  return value instanceof Uint8Array && value.byteLength === 32;
}

/**
 * Parse a string that may be an output from a passkey's pseudo random function encoded in hexadecimal.
 * @param {string} value A string that may be a value generated from a passkey's pseudo random function.
 * @returns {Bytes32|null} A 32 byte `Uint8Array`, or `null` if `value` is not a 64 character hexadecimal
 * value.
 */
export function parsePrf(value) {
  if (/^(0x)?[0-9a-f]{64}$/i.test(value)) {
    const arr = Uint8Array.fromHex(value.replace(/^0x/i, ''));
    if (isBytes32(arr)) {
      return arr;
    }
  }
  return null;
}

const ENVPASS_VERSIONS = /** @type {const} */(['v1']);
/**
 * @typedef {typeof ENVPASS_VERSIONS[number]} EnvpassVersion A valid version identifier for envpass.
 */

/**
 * @typedef {`envpass:${EnvpassVersion}:${string}`} EnvpassEncryptedValue A value which has been encrypted by envpass,
 * in the format `'envpass:{version}:{ciphertext}'`
 */

/**
 * Returns whether `value` is `EnvpassEncryptedValue` or not. This function is NOT intended to be directly called.
 * Use `parseEnvpassEncrypted` instead ("parse, don't validate").
 * 
 * This function is only defined separately to make the `value is EnvpassEncryptedValue` assertion for TypeScript.
 * @param {string} value A string that may have been encrypted by envpass.
 * @returns {value is EnvpassEncryptedValue}
 */
function isEnvpassEncrypted(value) {
  return new RegExp(`^envpass:${ENVPASS_VERSIONS.join('|')}:.+`).test(value);
}

/**
 * Parses a string that may be in the format `'envpass:{EnvpassVersion}:{string}'` and returns the string
 * it is valid, or `null` if it is not valid.
 * @param {string} value A string that may have been encrypted by envpass.
 * @returns {EnvpassEncryptedValue|null}
 */
export function parseEnvpassEncrypted(value) {
  return isEnvpassEncrypted(value) ? value : null;
}

/**
 * Invalid user input provided to the program.
 */
export class InputError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}