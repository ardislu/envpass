#!/usr/bin/env node

import { Command } from 'commander';
import { encrypt, decrypt } from '#src/index.js';

/**
 * Create the CLI program instance.
 * @param {typeof encrypt} encryptAction Action handler for the `encrypt` command.
 * @param {typeof decrypt} decryptAction Action handler for the `decrypt` command.
 * @returns {Command} The initialized CLI command. Call `.parse()` or `.parseAsync()` to execute from CLI args.
 */
export function makeProgram(encryptAction, decryptAction) {
  const program = new Command();

  program
    .name('envpass')
    .description('encrypt and decrypt your .env file using passkeys')
    .version('0.1.0');

  program.command('encrypt')
    .description('encrypt your .env file with a passkey')
    .option('--in-file <path>', "path to the unencrypted .env file (default: '.env')")
    .option('--out-file <path>', 'path to write the encrypted .env file to (default: value of --in-file)')
    .action(encryptAction);

  program.command('decrypt')
    .description('decrypt your .env file with a passkey')
    .option('--in-file <path>', "path to the encrypted .env file (default: '.env')")
    .option('--out-file <path>', 'path to write the decrypted .env file to (default: value of --in-file)')
    .option('-i, --inject-in-process', 'inject the decrypted environment variables to process.env (and ignore --out-file)')
    .allowExcessArguments(true)
    .action(decryptAction);

  return program;
}

/* node:coverage ignore next 1 */
if (import.meta.main) { makeProgram(encrypt, decrypt).parse(); }