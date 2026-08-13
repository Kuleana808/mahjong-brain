# Release status

Last verified: 2026-08-12 (HST)

This is the operational handoff for Mahjong Brain. It separates source,
archive, upload, processing, and tester availability so an earlier green step
cannot be mistaken for a shipped build.

## Current evidence ladder

| Stage | State | Evidence |
|---|---|---|
| Local source | verified | Branch `codex/build-mobile-shell`; clean worktree before this documentation update |
| Committed | verified | `959c0fc41ce4049de8028fcd1a0cca041a715d44` |
| Pushed | verified | Local HEAD matched its upstream branch |
| Pull request | open | PR #10; `check`, `native-ios`, and `original-art` passed on `959c0fc`; review is still required |
| Merged | not verified | PR #10 remains open and blocked on review |
| Simulator build | verified | The production web bundle was copied into the Capacitor target and verified byte-for-byte; Xcode simulator build succeeded |
| Native iPhone QA | verified | Build installed and launched into gameplay on iPhone 17 Pro simulator; 144-tile board rendered |
| Native iPad QA | verified | Clean install launched onboarding on iPad Pro 13-inch simulator |
| Earlier archive | verified, stale | Xcode archive `Mahjong Brain 8-11-26, 11.02 AM.xcarchive`, version 1.0 build 2, bundle `com.nihi.mahjong` |
| Earlier upload | verified, stale | Apple app ID `6800468742`; Xcode distribution record says build 2 uploaded successfully at 2026-08-11T21:05:49Z |
| Current release archive | missing | Build 2 predates commit `3a3e79d` and its bundled asset hashes differ from current `dist/` |
| Processing | not verified | No authoritative App Store Connect processing state captured for build 2 or a current build |
| Internal TestFlight | not verified | No tester-availability evidence captured |
| External tester group | not verified | No tester-group evidence captured |

Build 1 is not a candidate. Its Xcode upload record failed with Apple error
90474 because the iPad orientation declaration did not satisfy multitasking
requirements. Build 2 prepared and uploaded successfully after that issue was
resolved.

## Current release gates

`npm run preflight` currently fails closed on five items:

1. `fastlane/metadata/en-US/support_url.txt` is still pending.
2. `fastlane/metadata/en-US/privacy_url.txt` is still pending.
3. `IAP_PRODUCT_ID` and `VITE_IAP_PRODUCT_ID` are not configured for the release environment.
4. The shell contains Supabase credentials, but the referenced hosted project has not been proven to contain Mahjong Brain migrations and functions. Do not deploy into it based on credentials alone.
5. `VITE_API_BASE_URL` is not configured for the production mobile bundle.

Cloudflare Dashboard is signed in in Chrome, but the exact account/project was
not safely established. The repository's Cloudflare Pages project name is
`mahjong-brain`; no public production URL has been verified.

The Mac keychain currently exposes only `Apple Development: Created via API` to
command-line signing. Xcode nevertheless produced and uploaded build 2 using
Apple's managed distribution preparation. A new release must repeat the signed
archive and upload from Xcode, then record the new archive and distribution
events. An old organizer success dialog is not signing evidence for current
source.

## Resume sequence

1. Approve and merge PR #10, recording the merged SHA.
2. In the correct Cloudflare account, deploy `apps/marketing/out` as project
   `mahjong-brain`; verify `/support/` and `/privacy/` over public HTTPS; write
   those exact URLs into Fastlane metadata.
3. Identify or create the dedicated Mahjong Brain Supabase project. Verify the
   target before mutation, apply migrations 0001 through 0003, deploy the
   `contracts` function, configure its secrets, and run both contract and event
   smoke tests against the public endpoint.
4. In App Store Connect app `6800468742`, configure the permanent StoreKit
   product under bundle `com.nihi.mahjong`; set identical server and client
   product IDs. Verify a sandbox purchase and restore before describing contract
   8 as live verified.
5. Build with the production URLs and product ID, run `npm run preflight`,
   `npm run ios:prepare`, and the full test suite.
6. Increment the iOS build number above 2, archive the merged SHA, and run
   `npm run ios:verify-archive -- /path/to/archive.xcarchive`.
7. Upload the verified archive. Record the archive path, SHA, version, build,
   Apple upload event, processing result, export-compliance result, internal
   tester availability, and tester-group availability separately.

Use [TESTFLIGHT_EVIDENCE.md](TESTFLIGHT_EVIDENCE.md) as the release evidence
record. A release is not complete until every required row has a value and the
final TestFlight install has been exercised on a clean device.

Do not revive a player, grant an unlock, or enable purchase UI from client-side
success alone. Backend, Apple identity, and StoreKit verification continue to
fail closed until their production paths are proven.
