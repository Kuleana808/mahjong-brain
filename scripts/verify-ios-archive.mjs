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

const xmlValue = (key) => {
  const xml = readFileSync(infoPath, 'utf8');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scalar = xml.match(new RegExp(`<key>${escaped}</key>\\s*<(string|integer)>([^<]*)</\\1>`));
  if (scalar) return scalar[2];
  const array = xml.match(new RegExp(`<key>${escaped}</key>\\s*<array>([\\s\\S]*?)</array>`));
  if (!array) return '';
  return [...array[1].matchAll(/<(?:string|integer)>([^<]*)<\/(?:string|integer)>/g)]
    .map((match) => match[1])
    .join('\n');
};

const plistValue = (key) => {
  if (process.platform !== 'darwin') return xmlValue(key);
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, infoPath], { encoding: 'utf8' }).trim();
  } catch {
    try {
      return xmlValue(key);
    } catch {
      return '';
    }
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
  const orientationValues = (key) => [...plistValue(key).matchAll(/UIInterfaceOrientation[A-Za-z]+/g)].map((match) => match[0]);
  const phoneOrientations = orientationValues('UISupportedInterfaceOrientations');
  if (phoneOrientations.length !== 1 || phoneOrientations[0] !== 'UIInterfaceOrientationPortrait') {
    failures.push('iPhone launch build must remain portrait-only.');
  }
  const tabletOrientations = orientationValues('UISupportedInterfaceOrientations~ipad');
  const expectedTabletOrientations = ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown'];
  const actualTabletOrientations = tabletOrientations.sort();
  if (actualTabletOrientations.join('\n') !== expectedTabletOrientations.sort().join('\n')) {
    failures.push('iPad launch build must remain portrait and portrait-upside-down only.');
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
if (existsSync(indexPath)) {
  const index = readFileSync(indexPath, 'utf8');
  if (!index.includes('/favicon.png')) {
    failures.push('Archived app does not reference the approved favicon.');
  }
  if (!index.includes('class="boot-shell"') || !index.includes('/brand-mark.png')) {
    failures.push('Archived app does not contain the branded pre-hydration boot shell.');
  }
}

if (failures.length > 0) {
  console.error('iOS archive verification failed:\n');
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.info(`iOS archive verified: ${expectedBundleId} ${expectedVersion} (${expectedBuild}), iPhone + iPad, required privacy and brand assets present.`);
