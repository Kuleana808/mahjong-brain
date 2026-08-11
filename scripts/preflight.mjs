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

import { readFileSync, existsSync, statSync } from 'node:fs';
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

const icon = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
const splash = 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png';
const iconMaster = 'design/assets/app-icon-master.svg';
const splashMaster = 'design/assets/splash-master.svg';
const assetIsApproved = (path, master) =>
  existsSync(join(root, path)) &&
  statSync(join(root, path)).size > 100_000 &&
  existsSync(join(root, master));

if (!assetIsApproved(icon, iconMaster) || !assetIsApproved(splash, splashMaster)) {
  warnings.push(
    'Approved app icon or splash assets are missing. Both raster launch assets and\n' +
      '    their deterministic SVG masters are required before release (D-006).',
  );
}

if (!process.env.IAP_PRODUCT_ID || !process.env.VITE_IAP_PRODUCT_ID) {
  warnings.push(
    'The StoreKit 2 bridge and Apple Root CA G3 pin are installed, but server and\n' +
      '    client product ids are not configured. Purchases therefore remain hidden.',
  );
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  warnings.push(
    'No Supabase project configured. Instrumentation is mandatory before launch\n' +
      '    (D-014/D-016) — run `npm run smoke:events` against the real project first.',
  );
}

if (!process.env.VITE_API_BASE_URL) {
  warnings.push(
    'VITE_API_BASE_URL is not configured. Anonymous gameplay events remain safely\n' +
      '    queued on-device, but production telemetry and account sync cannot reach the API.',
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
