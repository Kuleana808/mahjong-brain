#!/usr/bin/env node
/**
 * Automated UI defect sweep across every QA fixture, at phone and tablet size.
 *
 * Brent, 2026-09-02: "still sees UI defects" without a list yet. Screenshotting
 * 49 fixtures on two devices is ~100 images, which is both expensive and a poor
 * way to find the defects that actually matter — truncation, touch targets and
 * contrast are measurable, not eyeballable. This measures them everywhere, so
 * screenshots can be spent only on what it flags.
 *
 * Drives the same CDP path as capture-screenshot-sources.mjs.
 *
 *   npm run dev        # in another shell — fixtures need a dev build
 *   npm run ui:sweep
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5183';
const PORT = 9223;

const DEVICES = [
  { name: 'iphone', width: 393, height: 852, scale: 3 },
  { name: 'ipad', width: 1032, height: 1376, scale: 2 },
];

/** Apple HIG minimum hit area, in CSS points. */
const MIN_TAP = 44;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fixtureIds() {
  const source = readFileSync(join(ROOT, 'src/qa/fixtures.ts'), 'utf8');
  const block = source.slice(
    source.indexOf('QA_FIXTURE_IDS'),
    source.indexOf('] as const'),
  );
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Runs inside the page. Returns structured findings rather than a verdict, so
 * the report can rank them.
 */
const PROBE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const vh = de.clientHeight;
  const findings = [];

  const label = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.slice(0, 40);
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    return text ? text.slice(0, 40) : el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0];
  };

  // ── horizontal overflow ────────────────────────────────────────────────
  if (de.scrollWidth > vw + 1) {
    findings.push({ kind: 'overflow-x', detail: de.scrollWidth + 'px in a ' + vw + 'px viewport' });
  }

  for (const el of document.querySelectorAll('main *, header *, nav *, .overlay *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    // Elements pushed outside the viewport horizontally.
    if (r.right > vw + 1 || r.left < -1) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.overflow !== 'hidden') {
        findings.push({ kind: 'offscreen-x', el: label(el), detail: 'left ' + Math.round(r.left) + ' right ' + Math.round(r.right) });
      }
    }
  }

  // ── truncated / clipped text ───────────────────────────────────────────
  for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,label,li,dd,dt,strong')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    // Screen-reader live regions are 1x1 and clipped ON PURPOSE. Reporting
    // them as truncated text buried six real findings under six fake ones.
    const r0 = el.getBoundingClientRect();
    if (r0.width <= 2 || r0.height <= 2) continue;
    // scrollWidth exceeding clientWidth on a non-scrolling element is text
    // being cut off, which is what ellipsis or a hard clip looks like.
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'auto') {
      findings.push({ kind: 'text-clipped', el: label(el), detail: el.scrollWidth + ' > ' + el.clientWidth });
    }
    if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY === 'hidden') {
      findings.push({ kind: 'text-clipped-y', el: label(el), detail: el.scrollHeight + ' > ' + el.clientHeight });
    }
  }

  // ── touch targets ──────────────────────────────────────────────────────
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.disabled) continue;
    if (r.width < ${MIN_TAP} - 0.5 || r.height < ${MIN_TAP} - 0.5) {
      findings.push({
        kind: 'tap-target',
        el: label(el),
        detail: Math.round(r.width) + 'x' + Math.round(r.height) + ' (min ${MIN_TAP})',
      });
    }
  }

  // ── safe-area intrusion ────────────────────────────────────────────────
  //
  // DELIBERATELY NOT CHECKED HERE. A headless browser reports
  // env(safe-area-inset-*) as 0, so every fixed element near an edge looks like
  // a violation: the first run produced 231 of them and buried the real
  // findings. The app pads its shell by all four insets (app.css) and sets
  // viewport-fit=cover on purpose, and the simulator screenshots confirm the
  // top bar sits below the status bar. Safe-area is a SIMULATOR check.

  // ── placeholder / developer strings ────────────────────────────────────
  const body = document.body.innerText || '';
  for (const bad of ['TODO', 'FIXME', 'lorem ipsum', 'undefined', 'NaN', 'null', '[object Object]', 'Coming soon']) {
    if (body.toLowerCase().includes(bad.toLowerCase())) {
      findings.push({ kind: 'placeholder-string', detail: bad });
    }
  }

  // ── contrast on text ───────────────────────────────────────────────────
  const lum = (c) => {
    const m = c.match(/[\\d.]+/g);
    if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // Resolve the painted background behind an element.
  //
  // Must consider background-IMAGE as well as background-color: this app paints
  // most cards with a linear-gradient, and a colour-only walk skips straight
  // past a cream card onto the dark scrim behind it, then reports dark text on
  // a dark background. Every "contrast failure" in the first run was that bug.
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const image = style.backgroundImage;
      if (image && image !== 'none') {
        // First colour stop is a fair approximation of what sits behind text.
        const stop = image.match(/rgba?\\([^)]+\\)/);
        if (stop) return stop[0];
      }
      const bg = style.backgroundColor;
      const m = bg.match(/[\\d.]+/g);
      if (m && (m.length < 4 || Number(m[3]) > 0.5)) return bg;
      node = node.parentElement;
    }
    return 'rgb(0,59,50)';
  };
  for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,label,li')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const style = getComputedStyle(el);
    const fg = lum(style.color);
    const bg = lum(bgOf(el));
    if (fg === null || bg === null) continue;
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const required = large ? 3 : 4.5;
    if (ratio < required) {
      findings.push({
        kind: 'contrast',
        el: label(el),
        detail: ratio.toFixed(2) + ':1 needs ' + required + ':1 (' + Math.round(size) + 'px)',
      });
    }
  }

  // ── modals without a close affordance ──────────────────────────────────
  for (const el of document.querySelectorAll('[role="dialog"], .overlay')) {
    const buttons = [...el.querySelectorAll('button, a[href]')];
    const hasClose = buttons.some((b) => /close|not now|back|cancel|later|dismiss|done|continue|restart|home/i.test(
      (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || ''),
    ));
    if (buttons.length > 0 && !hasClose) {
      findings.push({ kind: 'modal-no-exit', el: label(el), detail: buttons.length + ' buttons, none dismisses' });
    }
  }

  // ── images that failed or are low-res ──────────────────────────────────
  for (const img of document.querySelectorAll('img')) {
    if (!img.complete || img.naturalWidth === 0) {
      findings.push({ kind: 'image-broken', el: img.getAttribute('src') || '(no src)' });
      continue;
    }
    const r = img.getBoundingClientRect();
    if (r.width > 0 && img.naturalWidth < r.width * 2) {
      findings.push({
        kind: 'image-lowres',
        el: img.getAttribute('src') || '',
        detail: img.naturalWidth + 'px natural for ' + Math.round(r.width) + 'pt (want ' + Math.round(r.width * 2) + '+)',
      });
    }
    if (img.getAttribute('alt') === null) {
      findings.push({ kind: 'image-no-alt', el: img.getAttribute('src') || '' });
    }
  }

  // ── stuck loading indicators ───────────────────────────────────────────
  //
  // Only a progress bar that claims to be BUSY is worth reporting. The home
  // level bar and the loading bar are both legitimately present; flagging every
  // progressbar just told us the app has progress bars.
  for (const el of document.querySelectorAll('[aria-busy="true"]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) {
      findings.push({ kind: 'busy-indicator', el: label(el), detail: 'aria-busy — confirm it clears' });
    }
  }

  return { url: location.search, findings };
})()`;

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
    });
    return new Session(ws);
  }
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error('Chrome not found.');
    process.exit(2);
  }
  try {
    execFileSync('curl', ['-fsS', '-o', '/dev/null', '--max-time', '5', BASE], { stdio: 'ignore' });
  } catch {
    console.error(`No dev server at ${BASE}. Run: npm run dev`);
    process.exit(2);
  }

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--hide-scrollbars',
      '--disable-gpu',
      '--no-first-run',
      '--user-data-dir=/tmp/mahjong-sweep-profile',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let up = false;
  for (let i = 0; i < 40 && !up; i += 1) {
    await sleep(250);
    try {
      await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      up = true;
    } catch { /* waiting */ }
  }
  if (!up) {
    chrome.kill('SIGKILL');
    console.error('Chrome did not expose CDP.');
    process.exit(2);
  }

  const ids = fixtureIds();
  const report = [];

  try {
    for (const device of DEVICES) {
      for (const fixture of ids) {
        const created = await (
          await fetch(`http://127.0.0.1:${PORT}/json/new?about%3Ablank`, { method: 'PUT' })
        ).json();
        const session = await Session.open(created.webSocketDebuggerUrl);
        try {
          await session.send('Page.enable');
          await session.send('Emulation.setDeviceMetricsOverride', {
            width: device.width,
            height: device.height,
            deviceScaleFactor: device.scale,
            mobile: device.name === 'iphone',
          });
          await session.send('Page.navigate', { url: `${BASE}/?qa=${fixture}` });
          await sleep(1800);
          const { result } = await session.send('Runtime.evaluate', {
            expression: PROBE,
            returnByValue: true,
            awaitPromise: false,
          });
          const findings = result?.value?.findings ?? [];
          if (findings.length) report.push({ device: device.name, fixture, findings });
          process.stdout.write(findings.length ? '!' : '.');
        } catch (error) {
          report.push({ device: device.name, fixture, findings: [{ kind: 'probe-error', detail: String(error.message) }] });
          process.stdout.write('E');
        } finally {
          session.ws.close();
          await fetch(`http://127.0.0.1:${PORT}/json/close/${created.id}`).catch(() => {});
        }
      }
      process.stdout.write(`\n${device.name} done\n`);
    }
  } finally {
    chrome.kill('SIGKILL');
    try {
      execFileSync('pkill', ['-f', 'mahjong-sweep-profile'], { stdio: 'ignore' });
    } catch { /* nothing left */ }
  }

  // Group by defect kind so the report reads as a punch list, not a log.
  const byKind = new Map();
  for (const entry of report) {
    for (const f of entry.findings) {
      const key = f.kind;
      if (!byKind.has(key)) byKind.set(key, []);
      byKind.get(key).push({ device: entry.device, fixture: entry.fixture, ...f });
    }
  }

  const out = join(ROOT, '.build/ui-sweep.json');
  writeFileSync(out, JSON.stringify({ report, generatedAt: new Date().toISOString() }, null, 2));

  console.info(`\n${'='.repeat(64)}`);
  console.info(`UI SWEEP — ${ids.length} fixtures x ${DEVICES.length} devices`);
  console.info('='.repeat(64));
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.info(`\n${kind}  (${list.length})`);
    const seen = new Set();
    for (const f of list) {
      const key = `${f.el ?? ''}|${f.detail ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > 6) { console.info('    …'); break; }
      console.info(`    [${f.device}] ${f.fixture}: ${f.el ?? ''} ${f.detail ?? ''}`);
    }
  }
  console.info(`\nFull JSON: ${out}`);
}

await main();
