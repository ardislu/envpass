# envpass

A CLI and library to encrypt your `.env` file **using a passkey** and decrypt it when needed during application execution.

If you want to encrypt using a normal private key, check out [dotenvx](https://github.com/dotenvx/dotenvx).

Code repository mirrors: [GitHub](https://github.com/ardislu/envpass), [Codeberg](https://codeberg.org/ardislu/envpass), [git.ardis.lu](https://git.ardis.lu/envpass)

## Installation

```
npm install @ardislu/envpass
```

## Basic usage

1. To encrypt and overwrite your `.env` file with the encrypted values, run:

```
npx envpass encrypt
```

This command will automatically open a web browser to trigger the "sign in with passkey" flow. Create a new passkey or select an existing one to encrypt your variables.

2. At the beginning of your code, add this line:

```javascript
import '@ardislu/envpass/decrypt';
```

This is a side effect only import which will run the `decrypt` function with default settings. When it is run, it will open a web browser to trigger the "sign in with passkey" flow where you can select the same passkey you used to encrypt your variables. It will use the passkey to decrypt and set the variables in `process.env` for the remainder of the process.

3. To decrypt and overwrite your `.env` file with the decrypted values (i.e., undo `npx envpass encrypt`), run:

```
npx envpass decrypt
```

## Global usage

If you can't or don't want to install the package in your project, you can install `envpass` globally and then decrypt on a process-by-process basis:

1. Install `envpass` globally:

```
npm i -g @ardislu/envpass
```

2. Decrypt using the `--inject-in-process` (`-i`) flag before you run your desired command:

```
envpass decrypt -i -- node index.js
```

## Library usage

To fine-tune usage, you can call the `encrypt` or `decrypt` functions in code.

### Decrypt and set variables in `process.env`

The code below is equivalent to `import '@ardislu/envpass/decrypt'`:

```javascript
import { decrypt } from '@ardislu/envpass';

await decrypt({
  outFile: false,
  injectInProcess: true
});
```

### Set a specific port for the passkey bridge

The same option is available for `decrypt` as well.

```javascript
import { encrypt } from '@ardislu/envpass';

await encrypt({
  getPrfOptions: { port: 9999 }
});
```

### Manually abort the passkey flow

The same option is available for `decrypt` as well.

```javascript
import { encrypt } from '@ardislu/envpass';

const controller = new AbortController();
const encryptionPromise = encrypt({
  getPrfOptions: { signal: controller.signal }
});
controller.abort();
```

### Log diagnostic information

The same option is available for `decrypt` as well.

```javascript
import { encrypt } from '@ardislu/envpass';

await encrypt({
  logger: console // Or whatever logger library you prefer
});
```

## CLI reference

```
Usage: envpass [options] [command]

encrypt and decrypt your .env file using passkeys

Options:
  -V, --version      output the version number
  -h, --help         display help for command

Commands:
  encrypt [options]  encrypt your .env file with a passkey
  decrypt [options]  decrypt your .env file with a passkey
  help [command]     display help for command
```

```
Usage: envpass encrypt [options]

encrypt your .env file with a passkey

Options:
  --in-file <path>   path to the unencrypted .env file (default: '.env')
  --out-file <path>  path to write the encrypted .env file to (default: value of --in-file)
  -h, --help         display help for command
```

```
Usage: envpass decrypt [options]

decrypt your .env file with a passkey

Options:
  --in-file <path>         path to the encrypted .env file (default: '.env')
  --out-file <path>        path to write the decrypted .env file to (default: value of --in-file)
  -i, --inject-in-process  inject the decrypted environment variables to process.env (and ignore --out-file)
  -h, --help               display help for command
```

## Why?

Encrypting your `.env` is defense in depth that helps to mitigate supply chain attacks where an attacker has injected code to your local environment. Most passkey implementations require active user participation to decrypt, which will help prevent attackers from getting secrets via passive extraction by scripts.

You should still treat your encrypted `.env` as a normal secret `.env` file, meaning do **NOT** share or upload your `.env` anywhere. `envpass` is meant to supplement current security practices, not to replace them.
