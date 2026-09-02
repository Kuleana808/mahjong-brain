#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');
const board = read('src/ui/BoardView.tsx');
const app = read('src/ui/App.tsx');
const overlays = read('src/ui/Overlays.tsx');
const dock = read('src/ui/BottomDock.tsx');
const css = read('src/styles/app.css');
const failures = [];

const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};

requireText(board, 'role="grid"', 'The playable board must remain an accessibility grid.');
requireText(board, 'faceName(tile.face)', 'Every tile must expose its full spoken face name.');
requireText(board, 'tabIndex={isFree ? 0 : -1}', 'Only playable tiles should enter keyboard focus order.');
requireText(board, 'aria-disabled={!isFree || Boolean(flight)}', 'Blocked or moving tiles must expose their unavailable state.');
requireText(board, "ArrowUp: 'up'", 'Board tiles must preserve directional keyboard navigation.');
requireText(board, "aria-describedby={hintedIds.includes(tile.id) ? 'hint-text' : undefined}", 'Hinted tiles must reference the spoken hint.');
requireText(app, 'aria-live="polite"', 'Invisible gameplay announcements must remain available to VoiceOver.');
requireText(overlays, 'role="switch"', 'Settings toggles must retain switch semantics.');
requireText(overlays, 'aria-pressed={settings.theme === theme.id}', 'Theme choices must expose their selected state.');
requireText(dock, '`Hint, ${inventory.hint} available`', 'Hint inventory must be included in its accessible name.');
requireText(css, '@media (prefers-reduced-motion: reduce)', 'System Reduce Motion must suppress decorative motion.');
requireText(css, ".app[data-reduce-motion='true'] .match-celebration { display: none; }", 'The in-app Reduce Motion setting must suppress match debris.');
requireText(css, 'min-height: 44px', 'Interactive controls must retain a 44-point minimum target.');

if (failures.length) {
  console.error('Accessibility contract failed:\n');
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.info('Accessibility contract verified: spoken gameplay, keyboard play, reduced motion, selection state, and 44-point targets.');
