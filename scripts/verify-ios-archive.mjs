#!/usr/bin/env node

/** Verify the contents and identity of an iOS archive before upload. */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const archive = process.argv[2];
if (!archive) {
  console.error('Usage: node scripts/verify-ios-archive.mjs /path/to/App.xcarchive');
  process.exit(2);
}

const expectedBundleId = process.env.IOS_BUNDLE_ID || 'com.nihi.mahjong';
const expectedVersion = process.env.IOS_MARKETING_VERSION || '1.0';
const expectedBuild = process.env.IOS_BUILD_NUMBER || '2';
const app = join(archive, 'Products/Applications/App.app');
const infoPath = join(app, 'Info.plist');
const failures = [];

const plistValue = (key) => {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, infoPath], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

if (!existsSync(infoPath)) {
  failures.push('Archive does not contain Products/Applications/App.app/Info.plist.');
} else {
  const expected = {
    CFBundleIdentifier: expectedBundleId,
    CFBundleDisplayName: 'Mahjong Brain',
    CFBundleShortVersionString: expectedVersion,
    CFBundleVersion: expectedBuild,
    MinimumOSVersion: '15.0',
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = plistValue(key);
    if (actual !== value) failures.push(`${key} is ${actual || 'missing'}, expected ${value}.`);
  }
  const deviceFamily = plistValue('UIDeviceFamily');
  if (!deviceFamily.includes('1') || !deviceFamily.includes('2')) {
    failures.push('Archive must support both iPhone and iPad device families.');
  }
}

const required = [
  'PrivacyInfo.xcprivacy',
  'AppIcon60x60@2x.png',
  'AppIcon76x76@2x~ipad.png',
  'public/index.html',
  'public/brand-mark.png',
  'public/favicon.png',
];
for (const path of required) {
  if (!existsSync(join(app, path))) failures.push(`Archive is missing ${path}.`);
}

const indexPath = join(app, 'public/index.html');
if (existsSync(indexPath) && !readFileSync(indexPath, 'utf8').includes('/favicon.png')) {
  failures.push('Archived app does not reference the approved favicon.');
}

if (failures.length > 0) {
  console.error('iOS archive verification failed:\n');
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.info(`iOS archive verified: ${expectedBundleId} ${expectedVersion} (${expectedBuild}), iPhone + iPad, required privacy and brand assets present.`);
