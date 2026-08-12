#!/usr/bin/env node
/**
 * Runs the instrumentation smoke test against the local Supabase stack.
 *
 *   npx supabase start        # once
 *   npm run smoke:supabase
 *
 * Reads the URL and service-role key out of `supabase status` rather than
 * asking anyone to copy them around, because a key pasted into a shell is a key
 * that ends up in shell history.
 *
 * This is the run that means something. The dev-store run proves the handler
 * shape; this one proves the migrations, the PostgREST calls, the column names
 * and the row-level-security posture — against real Postgres.
 *
 * What it still does NOT prove: hosted networking and hosted key handling.
 * A hosted project is two environment variables away.
 */

import { execFileSync, spawnSync } from 'node:child_process';

function supabaseStatus() {
  try {
    // `-o env` prints shell-style assignments, which is stable across CLI
    // versions in a way the human-readable output is not.
    return execFileSync('npx', ['--yes', 'supabase@latest', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.error('Could not read `supabase status`. Is the stack running?');
    console.error('  npx supabase start');
    console.error(String(error.stderr ?? error.message).trim());
    process.exit(2);
  }
}

const status = supabaseStatus();
const value = (key) => status.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, 'm'))?.[1];

const url = value('API_URL');
const serviceRoleKey = value('SERVICE_ROLE_KEY');

if (!url || !serviceRoleKey) {
  console.error('supabase status did not report API_URL and SERVICE_ROLE_KEY.');
  console.error(status);
  process.exit(2);
}

console.info(`Supabase: ${url}\n`);

const result = spawnSync('npm', ['run', 'smoke:events'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    // The dev store must not be able to answer instead — that would make a
    // green run meaningless.
    MAHJONG_BRAIN_DEV_STORE: '',
    SESSION_SIGNING_KEY:
      process.env.SESSION_SIGNING_KEY ?? 'local-smoke-signing-key-not-a-secret-0123456789',
    APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID ?? 'com.mahjongbrain.game',
  },
});

process.exit(result.status ?? 1);
