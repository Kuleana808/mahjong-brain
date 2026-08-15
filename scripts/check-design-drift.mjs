#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');
const lock = JSON.parse(read('design/design-lock.json'));
const css = read('src/styles/app.css');
const palette = read('src/render/palette.ts');
const geometry = read('src/render/geometry.ts');
const holder = read('packages/core/src/play/session.ts');
const purchases = read('src/iap/index.ts');
const qaReference = read('design/QA_REFERENCE.md');
const assetReference = read('design/ASSETS.md');
const failures = [];

for (const [token, value] of Object.entries(lock.cssTokens)) {
  const pattern = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value}`, 'i');
  if (!pattern.test(css)) failures.push(`CSS token ${token} drifted from ${value}`);
}

for (const [name, value] of Object.entries(lock.calmPalette)) {
  const pattern = new RegExp(`${name}\\s*:\\s*['\"]${value}['\"]`, 'i');
  if (!pattern.test(palette)) failures.push(`Calm palette ${name} drifted from ${value}`);
}

const semanticCssNames = {
  backgroundApp: '--color-bg-app', backgroundRaised: '--color-bg-raised',
  surfacePrimary: '--color-surface', surfaceElevated: '--color-surface-elevated',
  textOnDark: '--color-text-dark', textOnLight: '--color-text-light',
  textMutedOnLight: '--color-text-muted', actionPrimary: '--color-action',
  focus: '--color-focus', success: '--color-success', warning: '--color-warning',
  danger: '--color-danger', info: '--color-info',
};
for (const [name, token] of Object.entries(semanticCssNames)) {
  const value = lock.semantic[name];
  const pattern = new RegExp(`${token}\\s*:\\s*${value}`, 'i');
  if (!pattern.test(css)) failures.push(`Semantic token ${name} is not wired to ${token}: ${value}`);
}
for (const undefinedAlias of ['--danger', '--success', '--warning', '--info']) {
  if (css.includes(`var(${undefinedAlias})`)) {
    failures.push(`CSS references undefined semantic alias ${undefinedAlias}; use the locked --color-* token`);
  }
}

if (!css.includes(`--font-display: ${lock.presentation.fontDisplay};`)) {
  failures.push(`Display typography drifted from ${lock.presentation.fontDisplay}`);
}
if (!geometry.includes(`CELL_STEP_X = ${lock.presentation.cellStepX}`)) {
  failures.push(`Horizontal tile presentation drifted from ${lock.presentation.cellStepX}`);
}
if (!geometry.includes(`CELL_STEP_Y = ${lock.presentation.cellStepY}`)) {
  failures.push(`Vertical tile presentation drifted from ${lock.presentation.cellStepY}`);
}
if (!holder.includes(`HOLDER_CAPACITY = ${lock.presentation.holderSlots}`)) {
  failures.push(`Holder capacity drifted from ${lock.presentation.holderSlots}`);
}
if (!palette.includes(`dimAlpha: ${lock.semantic.blockedTileOpacity}`)) {
  failures.push(`Blocked tile opacity drifted from ${lock.semantic.blockedTileOpacity}`);
}
if (!read('src/render/boardRenderer.ts').includes('function drawCeramicGlaze(')) {
  failures.push('Tile renderer is missing the approved restrained ceramic glaze');
}
if (css.includes('.app--gameplay .holder') || css.includes('.app--gameplay .bottom-dock')) {
  failures.push('Gameplay controls drifted into a device-specific rail');
}
if (!purchases.includes('let active: Purchases = new UnavailablePurchases()')) {
  failures.push('Release purchase provider no longer fails closed by default');
}

for (const states of Object.values(lock.components)) {
  for (const state of states) {
    if (!qaReference.includes(state)) failures.push(`QA reference is missing component state "${state}"`);
  }
}
for (const requiredAsset of ['app-icon', 'splash', 'tile-faces', 'tile-back', 'holder-frame']) {
  if (!assetReference.includes(`\`${requiredAsset}\``)) failures.push(`Asset reference is missing ${requiredAsset}`);
}

if (failures.length) {
  console.error('Design drift detected against design/design-lock.json:\n');
  for (const failure of failures) console.error(`  x ${failure}`);
  console.error('\nUpdate the implementation back to the approved system, or update the lock in an explicit design review.');
  process.exit(1);
}

console.info(`Design lock v${lock.version} verified: ${lock.approvedReference}.`);
