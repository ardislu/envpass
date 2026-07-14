import { suite, test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';

import { makeProgram } from '#src/cli.js';

suite('cli', () => {
  test('envpass encrypt works', (t) => {
    const program = makeProgram(t.mock.fn(), t.mock.fn());
    program.parse('node envpass encrypt'.split(' '));

    const command = program.commands.find(c => c.name() === 'encrypt');
    ok(command);
    const { inFile, outFile } = command.opts();
    deepStrictEqual(inFile, undefined);
    deepStrictEqual(outFile, undefined);
  });
  test('envpass encrypt options work', (t) => {
    const program = makeProgram(t.mock.fn(), t.mock.fn());
    program.parse('node envpass encrypt --in-file TEST_IN --out-file TEST_OUT'.split(' '));

    const command = program.commands.find(c => c.name() === 'encrypt');
    ok(command);
    const { inFile, outFile } = command.opts();
    deepStrictEqual(inFile, 'TEST_IN');
    deepStrictEqual(outFile, 'TEST_OUT');
  });
  test('envpass decrypt works', (t) => {
    const program = makeProgram(t.mock.fn(), t.mock.fn());
    program.parse('node envpass decrypt'.split(' '));

    const command = program.commands.find(c => c.name() === 'decrypt');
    ok(command);
    const { inFile, outFile, injectInProcess } = command.opts();
    deepStrictEqual(inFile, undefined);
    deepStrictEqual(outFile, undefined);
    deepStrictEqual(injectInProcess, undefined);
  });
  test('envpass decrypt options work', (t) => {
    const program = makeProgram(t.mock.fn(), t.mock.fn());
    program.parse('node envpass decrypt --in-file TEST_IN --out-file TEST_OUT --inject-in-process'.split(' '));

    const command = program.commands.find(c => c.name() === 'decrypt');
    ok(command);
    const { inFile, outFile, injectInProcess } = command.opts();
    deepStrictEqual(inFile, 'TEST_IN');
    deepStrictEqual(outFile, 'TEST_OUT');
    deepStrictEqual(injectInProcess, true);
  });
  test('envpass decrypt -i works', (t) => {
    const program = makeProgram(t.mock.fn(), t.mock.fn());
    program.parse('node envpass decrypt -i'.split(' '));

    const command = program.commands.find(c => c.name() === 'decrypt');
    ok(command);
    const { injectInProcess } = command.opts();
    deepStrictEqual(injectInProcess, true);
  });
});