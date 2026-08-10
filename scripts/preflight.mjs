#!/usr/bin/env node
/**
 * Pre-submission preflight.
 *
 * Run before any TestFlight or App Store upload:  npm run preflight
 *
 * WHY THIS EXISTS. The bundle id is a placeholder. Brent asked for the code to
 * build against `com.mahjongbrain.game`, and separately asked that nothing be
 * committed against it without his confirmation. Both are reasonable and they
 * point in opposite directions, so the resolution is this: the placeholder
 * stays in the code where it is useful, and this check makes it impossible to
 * *submit* with it by accident.
 *
 * The bundle id becomes the App Store record permanently at first upload. That
 * is the moment that cannot be undone — not the commit. So the gate belongs
 * here rather than in a lint rule.
 *
 * Exits non-zero with a list of everything still unresolved.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '');

const PLACEHOLDER_BUNDLE_ID = 'com.mahjongbrain.game';

const blockers = [];
const warnings = [];

// --- the permanent one ------------------------------------------------------

const capacitor = read('capacitor.config.ts');
if (capacitor.includes(PLACEHOLDER_BUNDLE_ID)) {
  blockers.push(
    `Bundle id is still the placeholder "${PLACEHOLDER_BUNDLE_ID}" in capacitor.config.ts.\n` +
      '    It becomes the App Store record permanently at first upload.\n' +
      '    Brent confirms it; then change capacitor.config.ts, PRODUCT_CATALOGUE,\n' +
      '    APPLE_BUNDLE_ID, and the iOS project (Codex). See D-001.',
  );
}

const types = read('packages/core/src/contracts/types.ts');
if (types.includes(PLACEHOLDER_BUNDLE_ID)) {
  blockers.push('PRODUCT_CATALOGUE still carries placeholder product ids derived from the bundle id.');
}

const infoPlist = read('ios/App/App/Info.plist');
if (infoPlist.includes('Nihi Mahjong')) {
  blockers.push('ios/App/App/Info.plist still says "Nihi Mahjong" (Codex owns iOS — D-001).');
}

// --- things that make a submission fail review or launch broken -------------

if (!read('.github/workflows/ci.yml')) warnings.push('No CI workflow found.');

const iconDir = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
if (existsSync(join(root, iconDir))) {
  warnings.push(
    'App icon and splash are still Capacitor defaults. They are placeholders,\n' +
      '    not borrowed art, but original replacements are required before release (D-006).',
  );
}

const storekitConfigured = process.env.APPLE_ROOT_CA_G3_BASE64 && process.env.IAP_PRODUCT_ID;
if (!storekitConfigured) {
  warnings.push(
    'StoreKit verification is not configured, so contract 8 fails closed and no\n' +
      '    purchase can be granted. Blocked on D-005.',
  );
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  warnings.push(
    'No Supabase project configured. Instrumentation is mandatory before launch\n' +
      '    (D-014/D-016) — run `npm run smoke:events` against the real project first.',
  );
}

// --- report -----------------------------------------------------------------

if (warnings.length > 0) {
  console.warn('\nWarnings — will not block, but launch is not complete without them:\n');
  for (const w of warnings) console.warn(`  ! ${w}\n`);
}

if (blockers.length > 0) {
  console.error('\nBLOCKED — do not submit:\n');
  for (const b of blockers) console.error(`  x ${b}\n`);
  console.error(`${blockers.length} blocker(s). These are permanent once uploaded.\n`);
  process.exit(1);
}

console.info('\nPreflight clear. Nothing permanent is unresolved.\n');
