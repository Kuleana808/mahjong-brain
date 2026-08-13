#!/usr/bin/env node
/**
 * Pre-submission preflight.
 *
 * Run before any TestFlight or App Store upload:  npm run preflight
 *
 * WHY THIS EXISTS. Permanent App Store identity, public policy URLs, StoreKit,
 * and production service configuration must all agree before upload. This
 * check makes those unresolved release decisions impossible to overlook.
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

const requiredAssetIds = [
  'brand-mark',
  'wordmark',
  'app-icon',
  'splash',
  'felt-background',
  'panel-ornament',
  'botanical-sprig',
  'tile-faces',
  'tile-back',
  'holder-frame',
  'icon-profile',
  'icon-appearance',
  'icon-settings',
  'icon-hint',
  'icon-undo',
  'icon-shuffle',
  'game-sounds',
  'tutorial-match',
  'tutorial-edge',
  'tutorial-holder',
];
const assetInventory = read('design/ASSETS.md');
for (const id of requiredAssetIds) {
  const row = assetInventory.split('\n').find((line) => line.startsWith(`| \`${id}\``));
  if (!row || !/\| approved(?: code)? \|/.test(row)) {
    blockers.push(`Required release asset is not approved in design/ASSETS.md: ${id}.`);
  }
}

const metadataFiles = [
  'fastlane/metadata/en-US/name.txt',
  'fastlane/metadata/en-US/subtitle.txt',
  'fastlane/metadata/en-US/description.txt',
  'fastlane/metadata/en-US/keywords.txt',
  'fastlane/metadata/en-US/release_notes.txt',
  'fastlane/metadata/en-US/support_url.txt',
  'fastlane/metadata/en-US/privacy_url.txt',
  'release/APP_STORE_SUBMISSION.md',
];
for (const path of metadataFiles) {
  if (!read(path).trim()) blockers.push(`Required App Store submission file is missing or empty: ${path}.`);
}

const supportUrl = read('fastlane/metadata/en-US/support_url.txt').trim();
const privacyUrl = read('fastlane/metadata/en-US/privacy_url.txt').trim();
if (!/^https:\/\//.test(supportUrl)) blockers.push('App Store support URL is not a final public HTTPS URL.');
if (!/^https:\/\//.test(privacyUrl)) blockers.push('App Store privacy policy URL is not a final public HTTPS URL.');

// --- the permanent one ------------------------------------------------------

const capacitor = read('capacitor.config.ts');
const capacitorBundleId = capacitor.match(/appId:\s*['"]([^'"]+)['"]/)?.[1] ?? null;
if (capacitor.includes(PLACEHOLDER_BUNDLE_ID)) {
  blockers.push(
    `Bundle id is still the placeholder "${PLACEHOLDER_BUNDLE_ID}" in capacitor.config.ts.\n` +
      '    It becomes the App Store record permanently at first upload.\n' +
      '    Brent confirms it; then change capacitor.config.ts, PRODUCT_CATALOGUE,\n' +
      '    APPLE_BUNDLE_ID, and the iOS project (Codex). See D-001.',
  );
}

const project = read('ios/App/App.xcodeproj/project.pbxproj');
const xcodeBundleIds = [
  ...new Set([...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)].map((match) => match[1].trim())),
];
if (xcodeBundleIds.length !== 1) {
  blockers.push(`The iOS project does not have one consistent bundle id: ${xcodeBundleIds.join(', ') || 'none found'}.`);
} else if (capacitorBundleId && xcodeBundleIds[0] !== capacitorBundleId) {
  blockers.push(
    `Bundle id mismatch: Capacitor uses ${capacitorBundleId}, while Xcode uses ${xcodeBundleIds[0]}.\n` +
      '    Native auth, StoreKit, and the App Store record must use one permanent identifier.',
  );
}
if (process.env.APPLE_BUNDLE_ID && capacitorBundleId && process.env.APPLE_BUNDLE_ID !== capacitorBundleId) {
  blockers.push(`APPLE_BUNDLE_ID (${process.env.APPLE_BUNDLE_ID}) does not match the app bundle id (${capacitorBundleId}).`);
}

const marketingVersions = [...new Set([...project.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map((match) => match[1].trim()))];
const buildNumbers = [...new Set([...project.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/g)].map((match) => match[1].trim()))];
if (marketingVersions.length !== 1 || !/^\d+\.\d+(?:\.\d+)?$/.test(marketingVersions[0] ?? '')) {
  blockers.push(`The iOS project does not have one valid marketing version: ${marketingVersions.join(', ') || 'none found'}.`);
}
if (buildNumbers.length !== 1 || !/^\d+$/.test(buildNumbers[0] ?? '') || Number(buildNumbers[0]) < 1) {
  blockers.push(`The iOS project does not have one positive integer build number: ${buildNumbers.join(', ') || 'none found'}.`);
}

const types = read('packages/core/src/contracts/types.ts');
if (types.includes(PLACEHOLDER_BUNDLE_ID)) {
  blockers.push('PRODUCT_CATALOGUE still carries placeholder product ids derived from the bundle id.');
}

const configuredProductId = process.env.IAP_PRODUCT_ID;
const configuredClientProductId = process.env.VITE_IAP_PRODUCT_ID;
if (configuredProductId && configuredClientProductId && configuredProductId !== configuredClientProductId) {
  blockers.push('IAP_PRODUCT_ID and VITE_IAP_PRODUCT_ID disagree. The client and verifier must name the same product.');
}
if (configuredProductId && capacitorBundleId && !configuredProductId.startsWith(`${capacitorBundleId}.`)) {
  blockers.push(`IAP_PRODUCT_ID (${configuredProductId}) is not namespaced under ${capacitorBundleId}.`);
}

const infoPlist = read('ios/App/App/Info.plist');
if (infoPlist.includes('Nihi Mahjong')) {
  blockers.push('ios/App/App/Info.plist still says "Nihi Mahjong" (Codex owns iOS — D-001).');
}

const purchaseClient = read('src/iap/index.ts');
const purchaseUi = read('src/ui/Overlays.tsx');
const storeKitBridge = read('ios/App/App/StoreKitPlugin.swift');
if (/PRICE_DISPLAY|\$4\.99/.test(purchaseUi)) {
  blockers.push('The purchase UI contains a hard-coded price instead of StoreKit displayPrice.');
}
if (!purchaseClient.includes('displayPrice') || !storeKitBridge.includes('product.displayPrice')) {
  blockers.push('The purchase UI is not wired to StoreKit localized product pricing.');
}

// --- things that make a submission fail review or launch broken -------------

if (!read('.github/workflows/ci.yml')) warnings.push('No CI workflow found.');

const privacyManifest = read('ios/App/App/PrivacyInfo.xcprivacy');
if (!privacyManifest.includes('NSPrivacyAccessedAPICategoryUserDefaults') || !privacyManifest.includes('CA92.1')) {
  blockers.push('PrivacyInfo.xcprivacy is missing the required UserDefaults declaration and CA92.1 reason.');
}
if (
  !privacyManifest.includes('NSPrivacyCollectedDataTypeUserID') ||
  !privacyManifest.includes('NSPrivacyCollectedDataTypePurchaseHistory')
) {
  blockers.push('PrivacyInfo.xcprivacy does not disclose optional linked account and purchase data.');
}
if (!project.includes('PrivacyInfo.xcprivacy in Resources')) {
  blockers.push('PrivacyInfo.xcprivacy is not included in the iOS app target resources.');
}

const entitlements = read('ios/App/App/App.entitlements');
if (!entitlements.includes('com.apple.developer.applesignin') || !entitlements.includes('<string>Default</string>')) {
  blockers.push('The iOS target is missing the Sign in with Apple entitlement.');
}
if (!project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
  blockers.push('The iOS target is not wired to App.entitlements.');
}

if (!project.includes('DEVELOPMENT_TEAM =')) {
  warnings.push('No Apple development team is committed in the Xcode project. A signed archive requires an explicit team.');
}

const icon = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
const splash = 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png';
const iconMaster = 'design/assets/app-icon-generated-source.png';
const splashMaster = 'scripts/render-brand-splash.py';
const assetIsApproved = (path, master) =>
  existsSync(join(root, path)) &&
  statSync(join(root, path)).size > 100_000 &&
  existsSync(join(root, master));

if (!assetIsApproved(icon, iconMaster) || !assetIsApproved(splash, splashMaster)) {
  warnings.push(
    'Approved app icon or splash assets are missing. Both raster launch assets and\n' +
      '    their approved deterministic sources are required before release (D-006).',
  );
}

if (!process.env.IAP_PRODUCT_ID || !process.env.VITE_IAP_PRODUCT_ID) {
  blockers.push(
    'The StoreKit 2 bridge and Apple Root CA G3 pin are installed, but server and\n' +
      '    client product ids are not configured. Purchases therefore remain hidden.',
  );
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  blockers.push(
    'No Supabase project configured. Instrumentation is mandatory before launch\n' +
      '    (D-014/D-016) — run `npm run smoke:events` against the real project first.',
  );
}

if (!process.env.VITE_API_BASE_URL) {
  blockers.push(
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
  console.error(`${blockers.length} submission blocker(s) remain. No archive should be uploaded yet.\n`);
  process.exit(1);
}

console.info('\nPreflight clear. Nothing permanent is unresolved.\n');
