// Publish the recorded launch for the grader. No network or wallet access.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const botDir = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

try {
  const source = readFileSync(join(botDir, 'LAUNCH.json'), 'utf8');
  const launch = JSON.parse(source);
  if (!launch || typeof launch !== 'object' || Array.isArray(launch)) {
    throw new Error('LAUNCH.json must contain an object');
  }
  for (const [field, min, max, byteLength] of [
    ['mint', 32, 44, 32],
    ['create_signature', 64, 88, 64],
  ] as const) {
    const value = launch[field];
    if (typeof value !== 'string' || value.length < min || value.length > max || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
      throw new Error(`LAUNCH.json has an invalid ${field}`);
    }
    const decoded = base58Decode(value);
    if (decoded.byteLength !== byteLength) {
      throw new Error(`LAUNCH.json has an invalid ${field}: base58 decode gives ${decoded.byteLength} bytes, expected ${byteLength}`);
    }
  }
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'LAUNCH.json'), source);
} catch (error) {
  console.error(`Launch export failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
