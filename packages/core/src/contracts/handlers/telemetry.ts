/**
 * Contract 11 — event ingestion.
 *
 * Nothing launches without this (D-014). Every funnel step the weekly cohort
 * review needs comes through here.
 *
 * PRIVACY POSTURE, stated plainly because it changed. Under the earlier spec
 * analytics was opt-in and mostly absent. Under the parity doctrine it is
 * mandatory, so the protection moved from "ask first" to "cannot identify
 * anyone":
 *
 *   - first-party only — our own storage, no third-party analytics SDK,
 *   - a rotating device id the player can reset, never an IDFA, never Apple's
 *     `sub`, never anything that survives a reinstall,
 *   - a closed event catalogue and an allow-listed property set, so nothing
 *     identifying can arrive by accident,
 *   - no `account_id` column, so product analytics can never be joined to an
 *     identity even by someone with database access.
 *
 * That is product analytics, not tracking, and it stays that way as long as no
 * ad SDK is wired into the same pipeline. When ads land they bring their own
 * identifiers and their own ATT prompt — see the note in docs/api-contracts.md.
 */

import {
  EVENT_SCHEMA_VERSION,
  MAX_EVENTS_PER_BATCH,
  sanitiseProperties,
  validateBatch,
  type EventBatch,
} from '../../telemetry/events';
import { fail, notConfigured, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import { CONTRACT_VERSION, type EventsBatchResponse } from '../types';

const CONTRACT = 'api/events/batch';

export async function ingestEvents(
  batch: EventBatch,
  ports: Ports = {},
): Promise<ContractEnvelope<EventsBatchResponse>> {
  const now = nowOf(ports);

  if (!batch || !Array.isArray(batch.events)) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'A batch needs an events array.',
      field: 'events',
    }, { now });
  }

  if (typeof batch.anonymousDeviceId !== 'string' || batch.anonymousDeviceId.length < 8) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'A rotating anonymous device id is required.',
      field: 'anonymousDeviceId',
    }, { now });
  }

  if (batch.events.length > MAX_EVENTS_PER_BATCH) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: `A batch holds at most ${MAX_EVENTS_PER_BATCH} events. Send several.`,
      field: 'events',
    }, { now });
  }

  const { accepted, rejected } = validateBatch(batch);

  if (!ports.store) {
    // Losing events is not an error the player should ever see, but it is one
    // we must never hide: the batch is dropped and the response says so.
    return notConfigured(CONTRACT, CONTRACT_VERSION, ['SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'], {
      now,
    });
  }

  if (accepted.length > 0) {
    await ports.store.recordEvents(
      accepted.map((event) => ({
        schema_version: EVENT_SCHEMA_VERSION,
        anonymous_device_id: batch.anonymousDeviceId,
        session_id: batch.sessionId,
        app_version: batch.appVersion,
        platform: batch.platform,
        name: event.name,
        client_at: event.at,
        server_at: now,
        sequence: event.sequence,
        properties: sanitiseProperties(event.properties),
      })),
    );
  }

  return ok<EventsBatchResponse>(
    CONTRACT,
    CONTRACT_VERSION,
    { accepted: accepted.length, rejected, schemaVersion: EVENT_SCHEMA_VERSION },
    {
      now,
      state: 'configured',
      // A partially-accepted batch is a client bug, and a silent one is a
      // funnel that quietly under-reports for a release.
      fallbackReason:
        rejected.length > 0
          ? `${rejected.length} of ${batch.events.length} events were rejected and not stored.`
          : null,
    },
  );
}
