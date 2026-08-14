# Release status

Last verified: 2026-08-13 (HST)

This is the operational handoff for Mahjong Brain. It separates source,
archive, upload, processing, and tester availability so an earlier green step
cannot be mistaken for a shipped build.

## Current evidence ladder

| Stage | State | Evidence |
|---|---|---|
| Local source | verified | Branch `codex/build-mobile-shell`; clean worktree before this documentation update |
| Committed | verified | `628f4ee` is the current pushed candidate source checkpoint |
| Pushed | verified | Local HEAD matched its upstream branch |
| Pull request | open | PR #10; `check`, `native-ios`, and `original-art` passed on `628f4ee`; review is still required |
| Merged | not verified | PR #10 remains open and blocked on review |
| Simulator build | verified | The production web bundle was copied into the Capacitor target and verified byte-for-byte; Xcode simulator build succeeded |
| Native iPhone QA | verified | Build installed and launched into gameplay on iPhone 17 Pro simulator; 144-tile board rendered |
| Native iPad QA | verified | Clean install launched onboarding on iPad Pro 13-inch simulator |
| Earlier archive | verified, stale | Xcode archive `Mahjong Brain 8-11-26, 11.02 AM.xcarchive`, version 1.0 build 2, bundle `com.nihi.mahjong` |
| Earlier upload | verified, stale | Apple app ID `6800468742`; Xcode distribution record says build 2 uploaded successfully at 2026-08-11T21:05:49Z |
| Current release archive | missing | Build 2 predates commit `3a3e79d` and its bundled asset hashes differ from current `dist/` |
| Processing | verified, stale | App Store Connect lists build 2 as `Testing`, expiring in 89 days |
| Internal TestFlight | verified, stale | Build 2 is assigned to `Mahjong Internal`; App Store Connect shows 1 invite, 1 install, and 1 session |
| External tester group | not verified | No tester-group evidence captured |

Build 1 is not a candidate. Its Xcode upload record failed with Apple error
90474 because the iPad orientation declaration did not satisfy multitasking
requirements. Build 2 prepared and uploaded successfully after that issue was
resolved.

## Current release gates

The public marketing, support, and privacy site is live at
`https://mahjong-brain.pages.dev/`. The dedicated Supabase project is
`Mahjong Brain` (`dxtzbidjtkeekthompqb`): migrations 0001-0004 are applied and
the public contracts function is deployed.

Production verification on 2026-08-13 established:

- board generation returned `live_verified`;
- unsigned settings access returned the expected `401` boundary;
- contract smoke covered settings persistence, unlock status, retention,
  analytics, and fail-closed receipt handling;
- event smoke persisted all 184 emitted rows across 38 event names;
- the consumable grant ledger is deployed and the server allow-list contains
  `com.nihi.mahjong.removeads` and `com.nihi.mahjong.shuffle5`;
- the public board endpoint returned HTTP 200, `live_verified`, 144 tiles, and
  nine opening moves after the 2026-08-13 deployment.

An environment audit found shell-global Supabase variables belonging to the
unrelated `signalmarket` project (`qynsncdqxdqiloxnrizj`). They must never be
used for this release. The repository-linked project above is authoritative.
Migrations 0001-0004 and one event smoke batch were inadvertently also applied
to that unrelated project; cleanup requires explicit approval and is not part
of Mahjong Brain release evidence.

Remaining release gates are App Store Connect product creation, sandbox
purchase and restore, final privacy/accessibility answers, final native QA,
screenshots, a fresh signed archive above build 2, upload, processing, and
TestFlight verification.

Build 3 was prepared from candidate commit `9a063a9` on 2026-08-13. All 307
tests, preflight, native asset verification, simulator compilation, and a clean
iPhone onboarding launch passed. `/tmp/MahjongBrain-build3.xcarchive` archived
successfully and passed `ios:verify-archive`. Upload is currently blocked at the
Apple account boundary: Xcode's distribution log says it cannot find an App
Store Connect account for team `RCCA2K8UXV`. The user must restore that account
session in Xcode Settings > Accounts before upload can continue. PR #10 also
remains protected by its required external review; do not bypass it.

The Mac keychain currently exposes only `Apple Development: Created via API` to
command-line signing. Xcode nevertheless produced and uploaded build 2 using
Apple's managed distribution preparation. A new release must repeat the signed
archive and upload from Xcode, then record the new archive and distribution
events. An old organizer success dialog is not signing evidence for current
source.

## Resume sequence

1. Approve and merge PR #10, recording the merged SHA.
2. In App Store Connect app `6800468742`, configure the permanent StoreKit
   product under bundle `com.nihi.mahjong`; set identical server and client
   product IDs. Verify a sandbox purchase and restore before describing contract
   8 as live verified.
3. Build with the production URLs and product ID, run `npm run preflight`,
   `npm run ios:prepare`, and the full test suite.
4. Increment the iOS build number above 2, archive the merged SHA, and run
   `npm run ios:verify-archive -- /path/to/archive.xcarchive`.
5. Upload the verified archive. Record the archive path, SHA, version, build,
   Apple upload event, processing result, export-compliance result, internal
   tester availability, and tester-group availability separately.

Use [TESTFLIGHT_EVIDENCE.md](TESTFLIGHT_EVIDENCE.md) as the release evidence
record. A release is not complete until every required row has a value and the
final TestFlight install has been exercised on a clean device.

Do not revive a player, grant an unlock, or enable purchase UI from client-side
success alone. Backend, Apple identity, and StoreKit verification continue to
fail closed until their production paths are proven.
