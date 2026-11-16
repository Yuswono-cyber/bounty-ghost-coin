/**
 * main.ts — entry point for the bounty-ghost-coin source-bundle competition.
 *
 * Validates the recorded launch (mint + create_signature) and, if valid,
 * copies it to the output directory for the grader. No network or wallet
 * access is performed; everything is deterministic and offline.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const botDir = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode a base58 string to bytes.
 * Supports the full Bitcoin base58 alphabet, including leading zeros.
 */
function base58Decode(input: string): Uint8Array {
  const index = new Map<string, number>();
  for (let i = 0; i < BASE58_ALPHABET.length; i++) index.set(BASE58_ALPHABET[i], i);

  let num = 0n;
  for (const ch of input) {
    const v = index.get(ch);
    if (v === undefined) throw new Error(`invalid base58 character '${ch}'`);
    num = num * 58n + BigInt(v);
  }

  let leadingZeros = 0;
  for (const ch of input) {
    if (ch === '1') leadingZeros++;
    else break;
  }

  const bytes: number[] = [];
  while (num > 0n) {
    bytes.push(Number(num & 0xffn));
    num >>= 8n;
  }
  bytes.reverse();
  return new Uint8Array([...new Array(leadingZeros).fill(0), ...bytes]);
}

/**
 * Validate the structure and contents of a parsed LAUNCH.json object.
 * Throws an Error if any required field is missing, malformed, or has the
 * wrong decoded byte length.
 */
function validateLaunch(launch: unknown): void {
  if (!launch || typeof launch !== 'object' || Array.isArray(launch)) {
    throw new Error('LAUNCH.json must contain an object');
  }
  const obj = launch as Record<string, unknown>;
  for (const field of ['mint', 'create_signature']) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
      throw new Error(`LAUNCH.json has an invalid ${field}: must be a non-empty string`);
    }
  }
  for (const field of Object.keys(obj)) {
    if (field !== 'mint' && field !== 'create_signature') {
      throw new Error(`LAUNCH.json has an unexpected field: ${field}`);
    }
  }
  for (const [field, min, max, byteLength] of [
    ['mint', 32, 44, 32],
    ['create_signature', 64, 88, 64],
  ] as const) {
    const value = obj[field];
    if (typeof value !== 'string' || value.length < min || value.length > max || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
      throw new Error(`LAUNCH.json has an invalid ${field}: base58 validation failed`);
    }
    const decoded = base58Decode(value);
    if (decoded.byteLength !== byteLength) {
      throw new Error(`LAUNCH.json has an invalid ${field}: base58 decode gives ${decoded.byteLength} bytes, expected ${byteLength}`);
    }
  }
}

try {
  const source = readFileSync(join(botDir, 'LAUNCH.json'), 'utf8');
  const launch = JSON.parse(source);
  validateLaunch(launch);
  mkdirSync(outputDir, { recursive: true });
  const out = join(outputDir, 'LAUNCH.json');
  const temporary = join(outputDir, `LAUNCH.json.${process.pid}.tmp`);
  writeFileSync(temporary, source, { flag: 'wx' });
  renameSync(temporary, out);
} catch (error) {
  console.error(`Launch export failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}