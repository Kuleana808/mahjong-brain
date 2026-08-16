# TestFlight evidence record

Copy this file for each release candidate and replace every `PENDING` value.
Do not infer a later stage from an earlier one: a successful archive is not an
upload, an upload is not processing, and processing is not tester availability.

## Candidate identity

| Field | Evidence |
|---|---|
| Marketing version | `1.0` |
| Build number | `5` |
| Bundle ID | `com.nihi.mahjong` |
| Apple app ID | `6800468742` |
| Git commit | PR #10 head `93c70cc`; remains review-required and unmerged |
| Working tree clean | Verified before release-evidence documentation on 2026-08-16 |
| Archive path | `/tmp/MahjongBrain-build5.xcarchive` |
| Archive verification command/output | `npm run ios:verify-archive -- /tmp/MahjongBrain-build5.xcarchive` passed: `com.nihi.mahjong` 1.0 (5), iPhone + iPad, required privacy and brand assets present |

## Configuration gates

| Gate | Evidence |
|---|---|
| Public support URL returns 200 over HTTPS | `https://mahjong-brain.pages.dev/support/`, HTTP 200 verified 2026-08-13 |
| Public privacy URL returns 200 over HTTPS | `https://mahjong-brain.pages.dev/privacy/`, HTTP 200 verified 2026-08-13 |
| `VITE_API_BASE_URL` points to the verified production contracts endpoint | `https://dxtzbidjtkeekthompqb.supabase.co/functions/v1/contracts`; HTTP 200 `live_verified` after current deploy |
| Server and client StoreKit product IDs match App Store Connect | Verified: `com.nihi.mahjong.removeads` and `com.nihi.mahjong.shuffle5` are present in App Store Connect and in the deployed server allow-list |
| Correct Supabase project ref recorded | `dxtzbidjtkeekthompqb` (`Mahjong Brain`, Operator.fyi, `us-west-1`) |
| Migrations 0001-0004 applied to that project | Verified by `supabase migration list --linked`, 2026-08-13 |
| Contracts smoke test passed against production | Passed: settings persistence, unlock, daily retention, analytics, fail-closed receipts |
| Events smoke test passed and rows read back | Passed against dedicated Mahjong Brain project: 184/184 rows stored, 38 distinct event names |
| Sandbox purchase verified by the server | PENDING |
| Sandbox restore verified on a second clean install | PENDING |

## Automated proof

| Check | Evidence |
|---|---|
| `npm test` | 328 passed, 2026-08-14 |
| `npm run build` | passed after the latest UI changes, production bundle generated |
| `npm run preflight` | passed against the release config and live production canaries: solvable board `live_verified`; malformed StoreKit JWS rejected fail-closed |
| `npm run check:design-drift` | Design lock v6 passed |
| `npm run check:brand-assets` | Brand assets v3 passed |
| `npm run check:accessibility` | passed on PR #10 head, 2026-08-14; verifies spoken tile names, keyboard navigation, live announcements, selection state, Reduce Motion, and 44-point targets in source; native assistive-technology QA remains separate below |
| `npm run ios:prepare` | Passed on unmerged PR #10 head `a1aadbd`; production preflight clear and nine native web files matched byte-for-byte. Must rerun on the final merged SHA |
| PR checks | `check`, `native-ios`, and `original-art` passed on `a1aadbd`, 2026-08-14 |

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
| Game win, progress score, and next level | PENDING | PENDING |
| Relaunch/resume without redeal | PENDING | PENDING |
| Dynamic Type / VoiceOver / Reduce Motion | PENDING | PENDING |
| Offline queue and reconnect flush | PENDING | PENDING |
| Sign in with Apple and account restore | PENDING | PENDING |
| Purchase and Restore Purchases | PENDING | PENDING |

## Apple delivery proof

| Stage | Evidence |
|---|---|
| Xcode archive completed | Verified for build 5 at `/tmp/MahjongBrain-build5.xcarchive` using Apple Distribution certificate SHA-1 `B4A70969B20667DC4878512311E6F263424FC871` and profile UUID `909cee20-780f-4d6e-af0c-fc2799cb130d` |
| Upload completed | Verified in Xcode Organizer: build 5 `Uploaded to Apple`, 2026-08-16 08:02 HST; Google Mobile Ads and UMP missing-dSYM warnings were non-blocking |
| App Store Connect processing completed | Verified: Build Uploads lists version 1.0 build 5 as `Complete` |
| Export compliance resolved | No blocking compliance prompt appeared; build proceeded to `Testing` |
| Internal testing group assigned | Verified: `Mahjong Internal` |
| Build available to internal testers | Verified: build 5 status `Testing`, expires in 90 days, 1 invite |
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
