/**
 * Contract 3 — Sign in with Apple.
 *
 * Only ever used to sync settings and the unlock across a player's own devices.
 * Free play never requires it, and the game must remain fully playable by
 * someone who never signs in at all.
 *
 * WHAT IS VERIFIED: the identity token is a JWS. It is only accepted when the
 * signature checks out against Apple's published keys, the issuer is Apple, the
 * audience is our bundle id, and it has not expired. A token that fails any of
 * those is refused — there is no "trust the client" path, because the same
 * account carries the purchase unlock.
 *
 * NOT CONFIGURED YET: the audience is the bundle id, which is still open
 * (D-001), and there is no Supabase project. Until both exist this answers
 * `source_available` and says what is missing. It does not mint sessions.
 */

import { fail, notConfigured, ok, type ContractEnvelope } from '../envelope';
import { nowOf, type Ports } from '../ports';
import { CONTRACT_VERSION, type AppleAuthRequest, type AppleAuthResponse } from '../types';

const CONTRACT = 'api/auth/apple-id';

export async function authenticateWithApple(
  request: AppleAuthRequest,
  ports: Ports = {},
): Promise<ContractEnvelope<AppleAuthResponse>> {
  const now = nowOf(ports);

  if (typeof request.identityToken !== 'string' || request.identityToken.split('.').length !== 3) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'invalid_request',
      message: 'Expected an Apple identity token.',
      field: 'identityToken',
    }, { now });
  }

  const missing: string[] = [];
  if (!ports.apple) missing.push('APPLE_BUNDLE_ID (blocked on D-001, the final app name)');
  if (!ports.store) missing.push('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  if (!ports.session) missing.push('SESSION_SIGNING_KEY');
  if (missing.length > 0) return notConfigured(CONTRACT, CONTRACT_VERSION, missing, { now });

  let identity;
  try {
    identity = await ports.apple!.verifyIdentityToken(request.identityToken);
  } catch (cause) {
    // Never echo the verifier's internals to a client — it is an oracle.
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'unauthenticated',
      message: 'That sign-in could not be verified.',
    }, {
      now,
      fallbackReason: `Apple identity token rejected: ${(cause as Error).message}`,
    });
  }

  // Apple's `sub` is the only stable identifier; the email is optional and may
  // be a relay address, so it is never the key.
  if (request.userIdentifier && request.userIdentifier !== identity.subject) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: 'unauthenticated',
      message: 'That sign-in could not be verified.',
    }, { now, fallbackReason: 'userIdentifier did not match the token subject' });
  }

  const store = ports.store!;
  const existing = await store.findAccountByAppleSubject(identity.subject);
  const account = existing ?? (await store.createAccount(identity.subject));
  const session = await ports.session!.issue(account.accountId);

  return ok<AppleAuthResponse>(
    CONTRACT,
    CONTRACT_VERSION,
    {
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      accountId: account.accountId,
      created: existing === null,
    },
    { now, state: 'configured' },
  );
}
