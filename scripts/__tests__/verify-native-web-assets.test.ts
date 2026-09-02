import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = new URL('../verify-native-web-assets.mjs', import.meta.url).pathname;
const created: string[] = [];

function fixture(nativeContents = 'current') {
  const root = mkdtempSync(join(tmpdir(), 'mahjong-native-bundle-'));
  created.push(root);
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'ios/App/App/public'), { recursive: true });
  writeFileSync(join(root, 'dist/index.html'), 'current');
  writeFileSync(join(root, 'ios/App/App/public/index.html'), nativeContents);
  return root;
}

afterEach(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
  created.length = 0;
});

describe('native web bundle verification', () => {
  it('passes when every production file matches', () => {
    expect(() => execFileSync(process.execPath, [script, fixture()], { stdio: 'pipe' })).not.toThrow();
  });

  it('fails closed when a native file is stale', () => {
    expect(() => execFileSync(process.execPath, [script, fixture('old')], { stdio: 'pipe' })).toThrow();
  });
});
