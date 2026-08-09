/**
 * Builds the `Ports` from the environment.
 *
 * Every adapter is optional and every one of them fails closed: if the
 * credentials for a port are absent, the port is absent, and the handler that
 * needs it answers `source_available` naming exactly what is missing. Nothing
 * here ever substitutes a permissive default for a missing key.
 *
 * A partially-configured port is treated as unconfigured, and says so loudly at
 * boot. Half a set of Supabase credentials is a deployment mistake, and the
 * failure mode of guessing is worse than the failure mode of refusing.
 */

import type { Ports } from '@nihi/core/contracts';

import { createAppleIdentityPort } from './adapters/appleIdentity';
import { createMemoryStore } from './adapters/memoryStore';
import { createSessionPort } from './adapters/session';
import { createStoreKitPort } from './adapters/storekit';
import { createSupabaseStore } from './adapters/supabaseStore';

export interface ConfigReport {
  readonly ports: Ports;
  /** One line per port, for the boot banner. */
  readonly lines: readonly string[];
}

const env = (key: string): string | undefined => {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

export function createPorts(): ConfigReport {
  const ports: { -readonly [K in keyof Ports]: Ports[K] } = {};
  const lines: string[] = [];

  // --- store ---------------------------------------------------------------
  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const devStore = env('NIHI_DEV_STORE');

  if (supabaseUrl && serviceRoleKey) {
    ports.store = createSupabaseStore({ url: supabaseUrl, serviceRoleKey });
    lines.push('store       supabase');
  } else if (supabaseUrl || serviceRoleKey) {
    lines.push(
      'store       DISABLED — only half the Supabase credentials are set; refusing to guess',
    );
  } else if (devStore === 'memory') {
    ports.store = createMemoryStore({ file: env('NIHI_DEV_STORE_FILE') });
    lines.push(
      `store       in-memory (dev)${env('NIHI_DEV_STORE_FILE') ? ` → ${env('NIHI_DEV_STORE_FILE')}` : ''}`,
    );
  } else {
    lines.push('store       none — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or NIHI_DEV_STORE=memory');
  }

  // --- session -------------------------------------------------------------
  const signingKey = env('SESSION_SIGNING_KEY');
  if (signingKey) {
    try {
      ports.session = createSessionPort({ signingKey });
      lines.push('session     hs256');
    } catch (cause) {
      lines.push(`session     DISABLED — ${(cause as Error).message}`);
    }
  } else {
    lines.push('session     none — set SESSION_SIGNING_KEY (32+ chars)');
  }

  // --- apple identity ------------------------------------------------------
  const bundleId = env('APPLE_BUNDLE_ID');
  if (bundleId) {
    ports.apple = createAppleIdentityPort({ bundleId });
    lines.push(`apple       verifying aud=${bundleId}`);
  } else {
    lines.push('apple       none — set APPLE_BUNDLE_ID (blocked on D-001)');
  }

  // --- storekit ------------------------------------------------------------
  const appleRoot = env('APPLE_ROOT_CA_G3_BASE64');
  const productId = env('IAP_PRODUCT_ID');
  if (appleRoot && productId && bundleId) {
    try {
      ports.storekit = createStoreKitPort({
        appleRootCaG3Base64: appleRoot,
        expectedProductId: productId,
        expectedBundleId: bundleId,
      });
      lines.push(`storekit    verifying ${productId}`);
    } catch (cause) {
      lines.push(`storekit    DISABLED — ${(cause as Error).message}`);
    }
  } else {
    const missing = [
      !appleRoot && 'APPLE_ROOT_CA_G3_BASE64',
      !productId && 'IAP_PRODUCT_ID',
      !bundleId && 'APPLE_BUNDLE_ID',
    ].filter(Boolean);
    lines.push(`storekit    none — set ${missing.join(', ')} (blocked on D-005)`);
  }

  return { ports, lines };
}
