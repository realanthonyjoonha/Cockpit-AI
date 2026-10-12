import { encode } from 'gpt-tokenizer';

/** cl100k-class counts from gpt-tokenizer's default encode (v2.9). */
export function countTokens(text) {
  return encode(String(text ?? '')).length;
}

export const TOKENIZER = 'gpt-tokenizer@2.9.0 default encode';
