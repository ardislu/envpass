/**
 * This file is intended to be imported as a side effect only import to support the most common use case
 * of decrypting .env and injecting the decrypted variables into the running program.
 * 
 * To customize the decrypt options, import and call the `decrypt` function directly in your code like this:
 * 
 *   import { decrypt } from '@ardislu/envpass';
 *   await decrypt({
 *     // ...
 *   });
 */

import { decrypt } from '#src/index.js';

await decrypt({
  outFile: false,
  injectInProcess: true
});