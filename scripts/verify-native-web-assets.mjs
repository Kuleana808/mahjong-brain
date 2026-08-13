#!/usr/bin/env node

/**
 * Prove that the iOS bundle contains the current production web build.
 *
 * Capacitor's native project stores a generated copy of `dist/` under
 * `ios/App/App/public`. That directory is intentionally ignored by git, so a
 * successful Xcode build alone cannot prove the archive contains current UI.
 * Compare every production asset byte-for-byte before an archive is allowed.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const nativePublic = join(root, 'ios/App/App/public');

const filesUnder = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
    });
};

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const failures = [];

if (!existsSync(dist)) failures.push('Production build is missing. Run `npm run build`.');
if (!existsSync(nativePublic)) failures.push('Native web bundle is missing. Run `npx cap copy ios`.');

for (const source of filesUnder(dist)) {
  if (!statSync(source).isFile()) continue;
  const path = relative(dist, source);
  const bundled = join(nativePublic, path);
  if (!existsSync(bundled)) {
    failures.push(`Native bundle is missing ${path}.`);
  } else if (digest(source) !== digest(bundled)) {
    failures.push(`Native bundle has a stale copy of ${path}.`);
  }
}

if (failures.length > 0) {
  console.error('Native iOS web bundle is not release-current:\n');
  for (const failure of failures) console.error(`  x ${failure}`);
  console.error('\nRun `npm run ios:sync`, then verify again.');
  process.exit(1);
}

console.info(`Native iOS bundle verified: ${filesUnder(dist).length} production files match byte-for-byte.`);
