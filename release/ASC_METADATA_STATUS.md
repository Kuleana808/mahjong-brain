# App Store Connect metadata — dry run

Everything verifiable from the repo and from live URLs, checked 2026-09-02
against merged `main`. Nothing in App Store Connect was read or changed; that
needs Brent's 2FA.

Legend: **READY** = verified here · **BRENT** = only a person in ASC can do it ·
**STALE** = in the repo but wrong now.

---

## Listing copy — all READY, all within limits

Source of truth is `fastlane/metadata/en-US/`. Character counts measured, not
estimated.

| Field | Chars | Limit | Value |
|---|---:|---:|---|
| `name` | 13 | 30 | Mahjong Brain |
| `subtitle` | 18 | 30 | Calm tile matching |
| `keywords` | 74 | 100 | mahjong, matching, tiles, puzzle, brain, solitaire, logic, large, readable, classic |
| `description` | 714 | 4000 | Clarity/comfort framing, holder mechanic explained |
| `promotional_text` | 80 | 170 | — |
| `release_notes` | 195 | 4000 | — |
| `copyright` | — | — | 2026 Mahjong Brain |

## URLs — READY, both live

| Field | Value | Checked |
|---|---|---|
| Support URL | `https://mahjong-brain.pages.dev/support/` | **HTTP 200** |
| Privacy URL | `https://mahjong-brain.pages.dev/privacy/` | **HTTP 200** |

## Identity — READY

| Field | Value | Source |
|---|---|---|
| Bundle ID | `com.nihi.mahjong` | Xcode project, matches the permanent ASC record |
| Apple app ID | `6800468742` | Recorded from the build-2 upload |
| Version | `1.0` | `MARKETING_VERSION` |
| Build | `7` | `CURRENT_PROJECT_VERSION`, bumped past the TestFlight build 6 |
| SKU | `mahjong-brain-ios-001` | Prepared |

## Export compliance — READY, pre-answered

`Info.plist` declares `ITSAppUsesNonExemptEncryption = false`, so the upload
should not prompt. The app uses only standard HTTPS/TLS and Apple platform
cryptography.

> Re-confirm against the current Apple questionnaire at upload. Do not infer an
> exemption from automation.

## Categories and age rating — BRENT

| Field | Prepared value | Note |
|---|---|---|
| Primary category | Games / Board | Set in ASC |
| Secondary category | Games / Puzzle | Set in ASC |
| Age rating | Questionnaire | See the change below — **this one matters now** |

**The age rating answers need a fresh look.** As of PR #18 the app has a real
age gate: answering *Under 13* blocks play permanently. That changes the
questionnaire conversation and makes the Kids category clearly inappropriate.
Confirm the rating reflects an app that declines under-13 players rather than
one aimed at them.

## Privacy nutrition label — mostly READY, one thing to re-check

Nine data types were completed and published in ASC on 2026-08-14, declaring
**no tracking**. Unlinked: Gameplay Content, Crash Data. Linked: Coarse
Location, User ID, Device ID, Purchase History, Product Interaction,
Advertising Data, Performance Data.

Two notes against the current build:

1. **The age band is never transmitted.** It is stored locally and used to set
   a boolean on the ad SDK. No new *data type* is collected, so the existing
   label still looks correct — but a reviewer may ask, and the honest answer is
   "a self-declared age band stays on device; only an under-age-of-consent flag
   reaches Google". Worth Brent's eye before submission.
2. Google Mobile Ads SDK disclosures change between versions. Re-read the
   privacy manifest inside the actual archive before answering.

## Review notes — **STALE, must be edited before submission**

`release/APP_STORE_SUBMISSION.md` tells App Review:

> "First launch shows Terms, **an optional demographic age-range question**, a
> short setup screen, and a three-step interactive tutorial."

That is no longer true and would be a rejection risk. Replacement text:

> First launch shows Terms, then a required age question with three answers.
> Choosing *Under 13* ends the session on a terminal screen and the app cannot
> be played; the answer persists across relaunch. Choosing *13–17* or *18 or
> older* continues to a short setup screen and a three-step interactive
> tutorial. A 13–17 answer additionally sets Google's under-age-of-consent flag
> for advertising.

Also worth adding for the reviewer, since it is not discoverable:

> To re-test the age gate, delete and reinstall the app. The answer is
> deliberately not resettable from inside the app.

## Screenshots — READY, regenerate after the archive

Correct sizes, verified by measurement:

| Slot | Required | Have |
|---|---|---|
| iPhone 6.9" | 1290 x 2796 | 6 ✅ |
| iPad 13" | 2064 x 2752 | 6 ✅ |
| IAP review | 1170 x 2532 | 2 ✅ |

Apple reuses the 6.9-inch set for 6.5-inch. 5.5-inch is retired.

Regenerate with `npm run screenshots` after the archive so the listing matches
the candidate — the previously shipped set carried a **pre-build-6 app icon**,
which the new capture step fixes.

## In-app purchases — BRENT

| Product | Price | State |
|---|---|---|
| `com.nihi.mahjong.removeads` | $4.99 | **Prepare for Submission** |
| `com.nihi.mahjong.shuffle5` | $0.99 | **Prepare for Submission** |

Review screenshots at 1170 x 2532 were accepted 2026-08-15. Neither product can
move to *Ready to Submit* until a build is attached, which is blocked on the
provisioning profile.

## Game Center — split

| | State |
|---|---|
| Leaderboards `boardsCleared`, `brainIq` | Created in ASC |
| Achievement `First Clear` | Created in ASC |
| Achievements `tenBoards`, `fiftyBoards`, `noHintClear`, `cleanClear` | **BRENT** — missing in ASC |
| All five in code | **READY** — reported with partial progress (PR #19), 20 tests |

## AdMob — BRENT

Account still under Google verification. Units are configured in the Release
xcconfig and the SDK initialises non-personalized, but production fill and
payout are unproven.
