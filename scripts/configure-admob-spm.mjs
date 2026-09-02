#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'ios/App/CapApp-SPM/Package.swift');
let source = readFileSync(packagePath, 'utf8');

if (!source.includes('googleads-mobile-ios-spm')) {
  source = source.replace(
    '        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"),',
    '        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"),\n' +
      '        .package(url: "https://github.com/googleads/swift-package-manager-google-mobile-ads.git", exact: "13.7.0"),\n' +
      '        .package(url: "https://github.com/googleads/swift-package-manager-google-user-messaging-platform.git", exact: "3.1.0"),',
  );
  source = source.replace(
    '                .product(name: "Cordova", package: "capacitor-swift-pm"),',
    '                .product(name: "Cordova", package: "capacitor-swift-pm"),\n' +
      '                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads"),\n' +
      '                .product(name: "GoogleUserMessagingPlatform", package: "swift-package-manager-google-user-messaging-platform"),',
  );
  writeFileSync(packagePath, source);
}

console.log('AdMob Swift packages configured.');
