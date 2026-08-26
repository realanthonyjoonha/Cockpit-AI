#!/usr/bin/env node
// ensure-thin-rooms.mjs — factory rooms on existing installs (never wipe desks).
// Adds missing shared rooms (e.g. street) to top-level rooms[] and each desk.rooms if present.
// Does not touch house, vault, or desk profiles beyond rooms arrays.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = path.join(ROOT, 'memory-cockpit-v2', 'config', 'thin-desks.json');

const REQUIRED = [
  'overview',
  'risks',
  'house',
  'sources',
  'street',
  'model',
  'research',
  'ask',
  'update',
];

function mergeRooms(existing) {
  const list = Array.isArray(existing) ? existing.map(String) : [];
  const out = [...list];
  for (const r of REQUIRED) {
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

if (!fs.existsSync(CFG)) {
  console.log('ensure-thin-rooms: no thin-desks.json — skip');
  process.exit(0);
}

const raw = fs.readFileSync(CFG, 'utf8');
let cfg;
try {
  cfg = JSON.parse(raw);
} catch (e) {
  console.error('ensure-thin-rooms: invalid JSON', e.message);
  process.exit(1);
}

const before = JSON.stringify(cfg);
cfg.rooms = mergeRooms(cfg.rooms);
if (Array.isArray(cfg.desks)) {
  cfg.desks = cfg.desks.map((d) => {
    if (!d || typeof d !== 'object') return d;
    // Only set per-desk rooms if the key already exists (avoid inventing shape)
    if (Array.isArray(d.rooms)) {
      return { ...d, rooms: mergeRooms(d.rooms) };
    }
    return d;
  });
}

const after = JSON.stringify(cfg);
if (before === after) {
  console.log('ensure-thin-rooms: already complete (street + standard rooms)');
  process.exit(0);
}

const bak = `${CFG}.bak-upgrade-${Date.now()}`;
fs.writeFileSync(bak, raw, 'utf8');
fs.writeFileSync(CFG, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
console.log('ensure-thin-rooms: updated rooms (street included if missing)');
console.log('  backup:', bak);
console.log('  rooms:', (cfg.rooms || []).join(', '));
