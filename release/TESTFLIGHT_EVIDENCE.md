# TestFlight evidence record

Copy this file for each release candidate and replace every `PENDING` value.
Do not infer a later stage from an earlier one: a successful archive is not an
upload, an upload is not processing, and processing is not tester availability.

## Candidate identity

| Field | Evidence |
|---|---|
| Marketing version | PENDING |
| Build number | PENDING; must be greater than 2 |
| Bundle ID | `com.nihi.mahjong` |
| Apple app ID | `6800468742` |
| Git commit | PENDING; must be the merged release SHA |
| Working tree clean | PENDING |
| Archive path | PENDING |
| Archive verification command/output | PENDING |

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
| `npm test` | PENDING |
| `npm run build` | PENDING |
| `npm run preflight` | PENDING; must exit 0 |
| `npm run check:design-drift` | PENDING |
| `npm run check:brand-assets` | PENDING |
| `npm run ios:prepare` | PENDING |
| PR checks | PENDING |

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
| Xcode archive completed | PENDING |
| Upload completed | PENDING |
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
