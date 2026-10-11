#!/usr/bin/env node
/**
 * Accept or refuse a /cockpit-new-desk slice card.
 * Rule check only: token cap, a source slug on every numbered line, no buy/sell/target/sizing.
 * Does not summarize, does not call a model, does not read the network.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLICE_CARD_TOKEN_CAP = 1500;

const SLUG_RE = /\[\[[A-Za-z0-9][A-Za-z0-9_-]*\]\]/;
const FORM_RE = /\b(?:10-K|10-Q|8-K|20-F|6-K|40-F)\b/g;
const ADVICE_RE = /\b(?:buy|sell|hold)\b|\bprice targets?\b|\btarget prices?\b|\bposition siz(?:e|ing)\b|\bPTs?\b/i;
const FIGURE_RE = /[$€£¥%]|\b(?:million|billion|thousand|trillion|percent|pct)\b/i;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let encodeFn;

function loadEncode() {
  if (encodeFn !== undefined) return encodeFn;
  const require = createRequire(import.meta.url);
  const candidates = [
    'gpt-tokenizer',
    path.join(REPO, 'harness-stress/node_modules/gpt-tokenizer/cjs/main.js'),
  ];
  for (const id of candidates) {
    try {
      const mod = require(id);
      if (typeof mod.encode === 'function') {
        encodeFn = mod.encode;
        return encodeFn;
      }
    } catch {
      /* next candidate */
    }
  }
  encodeFn = null;
  return null;
}

/** gpt-tokenizer when installed; otherwise 4 characters per token. */
export function countCardTokens(text) {
  const encode = loadEncode();
  const body = String(text ?? '');
  if (encode) return encode(body).length;
  return Math.ceil(body.length / 4);
}

function lineHasUncitedNumber(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s/.test(trimmed)) {
    const heading = trimmed.replace(FORM_RE, '');
    if (!FIGURE_RE.test(heading)) return false;
  }
  const body = trimmed.replace(FORM_RE, '');
  if (!/\d/.test(body)) return false;
  return !SLUG_RE.test(trimmed);
}

export function checkSliceCard(text) {
  const body = String(text ?? '');
  const errors = [];
  const tokens = countCardTokens(body);
  if (tokens > SLICE_CARD_TOKEN_CAP) {
    errors.push(`over token cap: ${tokens} > ${SLICE_CARD_TOKEN_CAP}`);
  }
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    if (lineHasUncitedNumber(line)) {
      errors.push(`number without source slug: ${line.trim()}`);
    }
  }
  if (ADVICE_RE.test(body)) {
    errors.push('buy/sell/target/sizing language');
  }
  return { ok: errors.length === 0, errors, tokens };
}

function main(args) {
  if (!args.length) {
    console.error('usage: node slice-card-check.mjs <card.md>...');
    return 2;
  }
  let failed = 0;
  for (const rel of args) {
    let text;
    try {
      text = readFileSync(rel, 'utf8');
    } catch (err) {
      failed += 1;
      console.error(`fail ${rel}: ${err.message}`);
      continue;
    }
    const result = checkSliceCard(text);
    if (result.ok) console.log(`ok ${rel} tokens=${result.tokens}`);
    else {
      failed += 1;
      console.error(`fail ${rel}: ${result.errors.join('; ')}`);
    }
  }
  return failed ? 1 : 0;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.exit(main(process.argv.slice(2)));
