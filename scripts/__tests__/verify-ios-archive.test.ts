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
  const plist = {
    CFBundleIdentifier: bundleId,
    CFBundleDisplayName: 'Mahjong Brain',
    CFBundleShortVersionString: '1.0',
    CFBundleVersion: '2',
    MinimumOSVersion: '15.0',
    UIDeviceFamily: [1, 2],
  };
  writeFileSync(join(app, 'Info.plist'), execFileSync('plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], { input: JSON.stringify(plist) }));
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
