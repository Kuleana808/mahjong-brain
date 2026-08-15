# Release status

Last verified: 2026-08-14 (HST)

This is the operational handoff for Mahjong Brain. It separates source,
archive, upload, processing, and tester availability so an earlier green step
cannot be mistaken for a shipped build.

## Current evidence ladder

| Stage | State | Evidence |
|---|---|---|
| Local source | verified | Branch `codex/build-mobile-shell`; current source through `a1aadbd` passes the checks listed below |
| Committed | verified | `a1aadbd` adds the release accessibility contract; `fc160cf` records the current App Store screenshot set; `5bc3d9f` adds the original Game Center achievement artwork |
| Pushed | verified | Branch is published through `a1aadbd` |
| Pull request | open | PR #10; `check`, `original-art`, and `native-ios` pass on `a1aadbd`; external review is still required |
| Merged | not verified | PR #10 remains open and blocked on review |
| Simulator build | verified | Build 4 compiles with Google Mobile Ads 13.7.0 and Google User Messaging Platform 3.1.0; production web and marketing builds pass |
| Native iPhone QA | verified | Build installed and launched into gameplay on iPhone 17 Pro simulator; 144-tile board rendered |
| Native iPad QA | verified | Clean install launched onboarding on iPad Pro 13-inch simulator |
| Earlier archive | verified, stale | Xcode archive `Mahjong Brain 8-11-26, 11.02 AM.xcarchive`, version 1.0 build 2, bundle `com.nihi.mahjong` |
| Earlier upload | verified, stale | Apple app ID `6800468742`; Xcode distribution record says build 2 uploaded successfully at 2026-08-11T21:05:49Z |
| Current release archive | missing | Build 4 has not yet been signed and archived from the final merged SHA |
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

Production monetization work verified on 2026-08-14:

- App Store Connect contains `com.nihi.mahjong.removeads` at $4.99 and
  `com.nihi.mahjong.shuffle5` at $0.99; both remain **Prepare for Submission**
  until their review screenshots are attached;
- AdMob app `7685530816` and production Hint, Revive, and Between Rounds units
  are configured in the Release xcconfig; Google test units remain isolated to
  Debug builds;
- the iOS bridge compiles with Google Mobile Ads 13.7.0 and UMP 3.1.0, disables
  ad personalization and Google's publisher first-party identifier, and exposes
  consent/privacy choices from Settings;
- production contract `contracts` was redeployed to project
  `dxtzbidjtkeekthompqb`; a public Edge Function canary accepted both new
  interstitial events and rejected zero;
- 328 automated tests and the production web build pass locally; design-lock
  v6, brand-assets v3, and the source accessibility contract pass;
- browser visual QA covers compact phone plus iPad portrait/landscape for
  onboarding, tutorials, gameplay Hint/full/complete, themes, and 200% Settings
  with no clipped text, horizontal overflow, or touch targets below 44 points;
- `npm run preflight` now reads the ignored release client config, obtains a
  `live_verified` solvable board, and observes the deployed StoreKit verifier
  reject a malformed JWS as `unverified_transaction` without an unlock;
- the AdMob account is still under Google's account verification, so production
  fill and payout are not live-verified;
- the corrected advertising privacy policy was uploaded through the authenticated
  Cloudflare dashboard and deployed to production. The public URL returned HTTP
  200 and live text includes the 2026-08-14 effective date, Google Mobile Ads,
  non-personalized treatment, disabled publisher first-party identifier, and
  the in-app Ad privacy choices path.

An environment audit found shell-global Supabase variables belonging to the
unrelated `signalmarket` project (`qynsncdqxdqiloxnrizj`). They must never be
used for this release. The repository-linked project above is authoritative.
Migrations 0001-0004 and one event smoke batch were inadvertently also applied
to that unrelated project; cleanup requires explicit approval and is not part
of Mahjong Brain release evidence.

The App Store version now has six ordered iPhone 6.9-inch screenshots and six
ordered iPad 13-inch screenshots in App Store Connect. Both sets use the same
approved sequence: readable board, match flow, visible hint, themes, progress,
and backgrounds. Apple reuses the iPhone 6.9-inch set for the 6.5-inch slot.
These are deterministic browser QA compositions; they must still be recaptured
from the exact signed release candidate before submission if the native archive
does not match them.

Remaining release gates are attaching IAP review screenshots, sandbox
purchase/restore and rewarded-ad QA, final native QA, verifying the uploaded
screenshots against the signed candidate, review/merge of PR #10, a fresh
signed build-4 archive, upload, processing, TestFlight verification, and App
Review submission.

On 2026-08-14, the Apple Developer App ID `com.nihi.mahjong` was updated to
enable Game Center after the first build-4 archive attempt proved that the
managed provisioning profile did not contain the entitlement.
All nine selected App Privacy data types were completed and published in App
Store Connect on 2026-08-14. The published label declares no tracking. Gameplay
Content and Crash Data are unlinked; Coarse Location, User ID, Device ID,
Purchase History, Product Interaction, Advertising Data, and Performance Data
are linked. The usage purposes reflect the configured App Functionality,
Analytics, and Third-Party Advertising behavior.

The `Boards Cleared` classic Game Center leaderboard was created with production
identifier `com.nihi.mahjong.boardsCleared`, integer best-score submission, and
high-to-low sorting. Its localization and review attachment still require final
verification, and the second leaderboard plus five achievements remain to be
created.

Build 3 was prepared from candidate commit `9a063a9` on 2026-08-13. All 307
tests, preflight, native asset verification, simulator compilation, and a clean
iPhone onboarding launch passed. `/tmp/MahjongBrain-build3.xcarchive` archived
successfully and passed `ios:verify-archive`. Upload is currently blocked at the
Apple account boundary: Xcode's distribution log says it cannot find an App
Store Connect account for team `RCCA2K8UXV`. The user must restore that account
session in Xcode Settings > Accounts before upload can continue. PR #10 also
remains protected by its required external review; do not bypass it.

The current `a1aadbd` candidate passed production preflight, rebuilt and synced
the native web bundle byte-for-byte, and passed all three PR checks. On
2026-08-14 Xcode's Apple Accounts UI showed `brent.akamine@gmail.com` on the
Brent Akamine Admin team, and manual profiles were refreshed. Two build-4
archive retries still failed with `No Accounts: Add a new account in Accounts
settings`; the downloaded `iOS Team Provisioning Profile: com.nihi.mahjong`
also remained stale and omitted Game Center. Xcode lists three Apple
Distribution certificates as `Not in Keychain`, while command-line signing
reports zero valid identities. No build-4 archive or upload exists yet.

The Mac keychain currently exposes zero valid code-signing identities to
command-line signing. Xcode's certificate manager still displays an older
`Created via API` development certificate and three Apple Distribution
certificates that are explicitly `Not in Keychain`. Xcode nevertheless produced
and uploaded build 2 using Apple's managed distribution preparation. A new
release must restore or create an authorized local distribution identity,
regenerate the Game Center-capable profile, repeat the signed archive and upload
from Xcode, and record the new archive and distribution events. An old organizer
success dialog is not signing evidence for current source.

## Resume sequence

1. Finish CI and external review, then approve and merge PR #10, recording the
   merged SHA.
2. Attach review screenshots to both existing StoreKit products, then verify a
   sandbox purchase and clean-install restore before describing contract 8 as
   live verified.
3. Build with the production URLs and product ID, run `npm run preflight`,
   `npm run ios:prepare`, and the full test suite.
4. Confirm the iOS build number remains 4, archive the merged SHA, and run
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
