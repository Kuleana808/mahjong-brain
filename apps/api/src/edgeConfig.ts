/** Deno-safe production port assembly for Supabase Edge Functions. */

import type { Ports } from '@mahjong-brain/core/contracts';

import { createAppleIdentityPort } from './adapters/appleIdentity';
import { createSessionPort } from './adapters/session';
import { createStoreKitPort } from './adapters/storekit';
import { createSupabaseStore } from './adapters/supabaseStore';
import { APPLE_ROOT_CA_G3_BASE64 } from './certs/appleRootCaG3';
import type { ConfigReport, EnvironmentReader } from './config';

export function createEdgePorts(readEnvironment: EnvironmentReader): ConfigReport {
  const ports: { -readonly [K in keyof Ports]: Ports[K] } = {};
  const lines: string[] = [];
  const env = (key: string) => {
    const value = readEnvironment(key);
    return value && value.length > 0 ? value : undefined;
  };

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceRoleKey) {
    ports.store = createSupabaseStore({ url: supabaseUrl, serviceRoleKey });
    lines.push('store       supabase');
  } else {
    lines.push('store       DISABLED — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  }

  const signingKey = env('SESSION_SIGNING_KEY');
  if (signingKey) {
    try {
      ports.session = createSessionPort({ signingKey });
      lines.push('session     hs256');
    } catch (cause) {
      lines.push(`session     DISABLED — ${(cause as Error).message}`);
    }
  } else {
    lines.push('session     DISABLED — set SESSION_SIGNING_KEY (32+ chars)');
  }

  const bundleId = env('APPLE_BUNDLE_ID');
  if (bundleId) {
    ports.apple = createAppleIdentityPort({ bundleId });
    lines.push(`apple       verifying aud=${bundleId}`);
  } else {
    lines.push('apple       DISABLED — set APPLE_BUNDLE_ID');
  }

  const productIds = (env('IAP_PRODUCT_IDS') ?? env('IAP_PRODUCT_ID') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (productIds.length > 0 && bundleId) {
    try {
      ports.storekit = createStoreKitPort({
        appleRootCaG3Base64: env('APPLE_ROOT_CA_G3_BASE64') ?? APPLE_ROOT_CA_G3_BASE64,
        expectedProductIds: productIds,
        expectedBundleId: bundleId,
      });
      lines.push(`storekit    verifying ${productIds.join(', ')}`);
    } catch (cause) {
      lines.push(`storekit    DISABLED — ${(cause as Error).message}`);
    }
  } else {
    lines.push('storekit    DISABLED — set APPLE_BUNDLE_ID + IAP_PRODUCT_IDS');
  }

  return { ports, lines };
}
