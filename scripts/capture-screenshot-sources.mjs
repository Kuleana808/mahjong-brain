#!/usr/bin/env node
/**
 * Capture the six source screens the App Store compositor draws into.
 *
 * `render-app-store-screenshots.py` does NOT capture anything — it composites
 * static PNGs from `release/app-store/source/` behind a headline and a device
 * frame. Those sources were captured by hand at some point and then drifted:
 * any change to the home screen, the board, or the theme pickers silently
 * leaves the store listing showing an older build. That is how the shipped
 * listing ended up carrying a pre-build-6 app icon.
 *
 * This closes that gap so the whole set is one command.
 *
 * ── Why this drives CDP instead of `chrome --screenshot` ──────────────────
 *
 * Headless Chrome clamps `--window-size` to a 500px minimum, and
 * `--force-device-scale-factor` does not change that. Asking for 393x852 at 3x
 * silently produced a 500x765 CSS viewport: the app laid out at desktop-ish
 * width, the compositor squeezed that into a phone frame, and the home screen
 * title came out clipped at the right edge.
 *
 * `Emulation.setDeviceMetricsOverride` is the only way to get a true phone
 * viewport at retina density. Node 22 ships a WebSocket client, so this talks
 * to CDP directly and adds no dependency.
 *
 * ── Why this captures a DEV build ─────────────────────────────────────────
 *
 * The deterministic states come from the QA fixtures (`?qa=S07-home-progress`),
 * which are gated behind `import.meta.env.DEV` and dynamically imported, so
 * they do not exist in a production bundle at all. Capturing from the signed
 * release build would mean manually playing into each of the six states and
 * hoping the framing matched — exactly the manual process that drifted.
 *
 * The pixels are the same either way: the same React tree renders in both
 * builds. Only the way the app is put into each state differs.
 *
 * NOTE: `release/APP_STORE_SUBMISSION.md` says to capture only from the signed
 * release candidate and not to upscale browser screenshots. This satisfies the
 * second half — sources are 1179x2556 and the compositor DOWNSCALES them to
 * 971px wide — but not the first. That is a deliberate, documented trade-off.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 *   npm run dev          # in another shell — the fixtures need the dev server
 *   npm run screenshots  # capture + composite
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5183';
const PORT = 9222;

/**
 * One entry per source directory the compositor reads.
 *
 * The compositor picks `source/ipad` for any output wider than 1500px, so the
 * iPad set needs its own capture at an iPad viewport. Capturing only the phone
 * is why the iPad screenshots kept the old app icon after the phone set was
 * refreshed.
 */
const DEVICES = [
  { dir: 'iphone', width: 393, height: 852, scale: 3 },
  { dir: 'ipad', width: 1032, height: 1376, scale: 2 },
];

/** Source file -> the QA fixture that puts the app in that state. */
const SCREENS = [
  ['gameplay.png', 'S08-game-empty'],
  ['home.png', 'S07-home-progress'],
  ['hint.png', 'S08-game-hint'],
  ['themes.png', 'S19-theme-tiles'],
  ['complete.png', 'S10-complete'],
  ['backgrounds.png', 'S19-theme-backgrounds'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message, ...detail) {
  console.error(message);
  for (const line of detail) console.error(line);
  process.exit(2);
}

async function assertPortFree() {
  // A previous run that died without cleanup leaves Chrome holding the port.
  // The new spawn then silently fails to bind and the script attaches to the
  // stale browser instead, which behaves like a hang. Fail loudly instead.
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return;
  }
  fail(
    `Something is already listening on CDP port ${PORT}.`,
    'That is usually a Chrome left over from an interrupted run:',
    '  pkill -f mahjong-shot-profile',
  );
}

function assertReady() {
  if (!existsSync(CHROME)) fail(`Chrome not found at ${CHROME}.`);
  try {
    execFileSync('curl', ['-fsS', '-o', '/dev/null', '--max-time', '5', BASE], { stdio: 'ignore' });
  } catch {
    fail(
      `No dev server at ${BASE}.`,
      'The QA fixtures only exist in a dev build, so this needs:',
      '  npm run dev',
    );
  }
}

/** Minimal CDP client over the websocket Node already provides. */
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

  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
    });
    return new Session(ws);
  }
}

async function main() {
  assertReady();
  await assertPortFree();

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--hide-scrollbars',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--user-data-dir=/tmp/mahjong-shot-profile',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  // Wait for the debugging endpoint rather than guessing at a sleep.
  let up = false;
  for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
    await sleep(250);
    try {
      await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      up = true;
    } catch {
      /* not up yet */
    }
  }
  if (!up) {
    chrome.kill();
    fail('Chrome did not expose a CDP endpoint.');
  }

  // CAPTURE_ONLY=ipad or CAPTURE_ONLY=iphone limits the run to one device.
  const only = process.env.CAPTURE_ONLY;

  try {
    for (const device of DEVICES) {
      if (only && device.dir !== only) continue;
      const out = join(ROOT, 'release/app-store/source', device.dir);
      mkdirSync(out, { recursive: true });

      for (const [file, fixture] of SCREENS) {
        // A FRESH page target per capture.
        //
        // Reusing one target failed partway through the set with "Not attached
        // to an active page": some fixture detaches the renderer, and after
        // that every later command on that session fails. One target per shot
        // costs a second and makes the run immune to it.
        const created = await (
          await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, {
            method: 'PUT',
          })
        ).json();

        const session = await Session.open(created.webSocketDebuggerUrl);
        try {
          await session.send('Page.enable');
          await session.send('Emulation.setDeviceMetricsOverride', {
            width: device.width,
            height: device.height,
            deviceScaleFactor: device.scale,
            mobile: true,
          });
          await session.send('Page.navigate', { url: `${BASE}/?qa=${fixture}` });
          // The board deals and animates in. Settle before capturing rather
          // than catching a half-painted canvas.
          await sleep(2500);
          const { data } = await session.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
          });
          writeFileSync(join(out, file), Buffer.from(data, 'base64'));
          console.info(`  ${device.dir.padEnd(7)} ${file.padEnd(18)} <- ?qa=${fixture}`);
        } finally {
          session.ws.close();
          await fetch(`http://127.0.0.1:${PORT}/json/close/${created.id}`).catch(() => {});
        }
      }

      console.info(`  -> ${device.dir} at ${device.width * device.scale}x${device.height * device.scale}\n`);
    }
  } finally {
    // `--headless=new` spawns helper processes that survive killing the parent,
    // and a leftover holds the CDP port so the next run cannot bind. Kill the
    // whole tree by its unique profile path.
    chrome.kill('SIGKILL');
    try {
      execFileSync('pkill', ['-f', 'mahjong-shot-profile'], { stdio: 'ignore' });
    } catch {
      /* nothing left to kill */
    }
  }

  console.info('Next: npm run screenshots:compose');
}

await main();
