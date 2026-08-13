# TestFlight evidence record

Copy this file for each release candidate and replace every `PENDING` value.
Do not infer a later stage from an earlier one: a successful archive is not an
upload, an upload is not processing, and processing is not tester availability.

## Candidate identity

| Field | Evidence |
|---|---|
| Marketing version | `1.0` |
| Build number | `3` |
| Bundle ID | `com.nihi.mahjong` |
| Apple app ID | `6800468742` |
| Git commit | `9a063a9` candidate SHA; PR #10 remains review-required and unmerged |
| Working tree clean | PENDING |
| Archive path | `/tmp/MahjongBrain-build3.xcarchive` |
| Archive verification command/output | `npm run ios:verify-archive -- /tmp/MahjongBrain-build3.xcarchive` passed: identity, version/build, iPhone+iPad, privacy and brand assets |

## Configuration gates

| Gate | Evidence |
|---|---|
| Public support URL returns 200 over HTTPS | `https://mahjong-brain.pages.dev/support/`, HTTP 200 verified 2026-08-13 |
| Public privacy URL returns 200 over HTTPS | `https://mahjong-brain.pages.dev/privacy/`, HTTP 200 verified 2026-08-13 |
| `VITE_API_BASE_URL` points to the verified production contracts endpoint | `https://dxtzbidjtkeekthompqb.supabase.co/functions/v1/contracts` |
| Server and client StoreKit product IDs match App Store Connect | PENDING |
| Correct Supabase project ref recorded | `dxtzbidjtkeekthompqb` (`Mahjong Brain`, Operator.fyi, `us-west-1`) |
| Migrations 0001-0003 applied to that project | Verified by `supabase migration list --linked`, 2026-08-13 |
| Contracts smoke test passed against production | Passed: settings persistence, unlock, daily retention, analytics, fail-closed receipts |
| Events smoke test passed and rows read back | Passed: 184/184 rows stored, 38 distinct event names |
| Sandbox purchase verified by the server | PENDING |
| Sandbox restore verified on a second clean install | PENDING |

## Automated proof

| Check | Evidence |
|---|---|
| `npm test` | 307 passed, 2026-08-13 |
| `npm run build` | passed, production bundle generated |
| `npm run preflight` | passed with production Supabase/API and StoreKit IDs configured |
| `npm run check:design-drift` | Design lock v4 passed |
| `npm run check:brand-assets` | Brand assets v2 passed |
| `npm run ios:prepare` | passed; native web assets verified byte-for-byte |
| PR checks | `check`, `native-ios`, and `original-art` passed on `4a9b0df`; build-3 SHA checks pending after push |

## Native QA matrix

Record device, OS, clean-install status, result, and screenshot/video path.

| Flow | iPhone | iPad |
|---|---|---|
| Terms and privacy links | PENDING | PENDING |
| Age gate and loading | PENDING | PENDING |
| Tutorial A/B/C | PENDING | PENDING |
| Home to level start | PENDING | PENDING |
| Legal pair selection | PENDING | PENDING |
| Blocked tile feedback | PENDING | PENDING |
| Tile-to-tray motion and separators | PENDING | PENDING |
| Three-tile match break celebration | PENDING | PENDING |
| Holder warning, full, revive, restart | PENDING | PENDING |
| Hint, shuffle, and undo states | PENDING | PENDING |
| Theme and tile-style switching | PENDING | PENDING |
| Settings persistence | PENDING | PENDING |
| Game win, IQ, and next level | PENDING | PENDING |
| Relaunch/resume without redeal | PENDING | PENDING |
| Dynamic Type / VoiceOver / Reduce Motion | PENDING | PENDING |
| Offline queue and reconnect flush | PENDING | PENDING |
| Sign in with Apple and account restore | PENDING | PENDING |
| Purchase and Restore Purchases | PENDING | PENDING |

## Apple delivery proof

| Stage | Evidence |
|---|---|
| Xcode archive completed | Build 3 archive succeeded and passed repository archive verifier |
| Upload completed | BLOCKED: Xcode reports no App Store Connect account for team `RCCA2K8UXV`; user must restore the account session in Xcode Settings > Accounts |
| App Store Connect processing completed | PENDING |
| Export compliance resolved | PENDING |
| Internal testing group assigned | PENDING |
| Build available to internal testers | PENDING |
| Clean TestFlight install launched | PENDING |
| Onboarding-to-game smoke completed from TestFlight | PENDING |
| Crash/console review | PENDING |

## Release decision

- Decision: PENDING (`GO` or `NO-GO`)
- Decider: PENDING
- Date/time and timezone: PENDING
- Known limitations communicated to testers: PENDING
- Rollback or replacement-build plan: upload a higher build number; never
  overwrite or describe an earlier binary as the current candidate.
