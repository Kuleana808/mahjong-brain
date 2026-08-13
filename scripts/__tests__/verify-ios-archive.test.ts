import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = new URL('../verify-ios-archive.mjs', import.meta.url).pathname;
const created: string[] = [];

function archive(bundleId = 'com.nihi.mahjong') {
  const root = mkdtempSync(join(tmpdir(), 'mahjong-archive-'));
  created.push(root);
  const app = join(root, 'Products/Applications/App.app');
  mkdirSync(join(app, 'public'), { recursive: true });
  writeFileSync(join(app, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleId}</string>
<key>CFBundleDisplayName</key><string>Mahjong Brain</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>2</string>
<key>MinimumOSVersion</key><string>15.0</string>
<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
</dict></plist>`);
  for (const path of ['PrivacyInfo.xcprivacy', 'AppIcon60x60@2x.png', 'AppIcon76x76@2x~ipad.png', 'public/brand-mark.png', 'public/favicon.png']) {
    writeFileSync(join(app, path), 'asset');
  }
  writeFileSync(join(app, 'public/index.html'), '<link rel="icon" href="/favicon.png">');
  return root;
}

afterEach(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
  created.length = 0;
});

describe('iOS archive verification', () => {
  it('accepts a correctly identified iPhone and iPad archive', () => {
    expect(() => execFileSync(process.execPath, [script, archive()], { stdio: 'pipe' })).not.toThrow();
  });

  it('fails closed on a bundle identifier mismatch', () => {
    expect(() => execFileSync(process.execPath, [script, archive('com.example.wrong')], { stdio: 'pipe' })).toThrow();
  });
});
