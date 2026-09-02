#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const lock = JSON.parse(readFileSync(join(root, 'design/brand-assets.lock.json'), 'utf8'));
const failures = [];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const [relativePath, expected] of Object.entries(lock.files)) {
  let bytes;
  try {
    bytes = readFileSync(join(root, relativePath));
  } catch {
    failures.push(`${relativePath} is missing`);
    continue;
  }

  const actualHash = sha256(bytes);
  if (actualHash !== expected.sha256) {
    failures.push(`${relativePath} changed without an approved brand-lock update`);
  }

  if (expected.kind === 'svg') {
    const source = bytes.toString('utf8').toLowerCase();
    for (const color of expected.requiredColors) {
      if (!source.includes(color)) failures.push(`${relativePath} is missing locked palette color ${color}`);
    }
    continue;
  }

  if (expected.kind === 'png') {
    const signature = bytes.subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') {
      failures.push(`${relativePath} is not a valid PNG`);
      continue;
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const colorType = bytes.readUInt8(25);
    if (width !== expected.width || height !== expected.height) {
      failures.push(`${relativePath} is ${width}x${height}; expected ${expected.width}x${expected.height}`);
    }
    if (!expected.allowAlpha && (colorType === 4 || colorType === 6)) {
      failures.push(`${relativePath} contains an alpha channel; App Store artwork must be opaque`);
    }
  }
}

const iconCatalogue = readFileSync(
  join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'),
  'utf8',
);
const splashCatalogue = readFileSync(
  join(root, 'ios/App/App/Assets.xcassets/Splash.imageset/Contents.json'),
  'utf8',
);
for (const filename of ['AppIcon-512@2x.png']) {
  if (!iconCatalogue.includes(filename)) failures.push(`App icon catalogue is not wired to ${filename}`);
}
for (const filename of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  if (!splashCatalogue.includes(filename)) failures.push(`Splash catalogue is not wired to ${filename}`);
}

if (failures.length) {
  console.error('Brand asset drift detected:\n');
  for (const failure of failures) console.error(`  x ${failure}`);
  console.error('\nRegenerate from the approved SVG masters or approve a new brand lock before release.');
  process.exit(1);
}

console.info(`Brand assets v${lock.version} verified: ${lock.approvedReference}.`);
