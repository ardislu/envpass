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