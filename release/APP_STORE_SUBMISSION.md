# App Store submission packet

This is the QA reference for the first TestFlight/App Store build. Listing copy
lives under `fastlane/metadata`; this file records answers that App Store Connect
does not store in the repository automatically. Never replace a pending value
with a guessed URL, identifier, price, or review credential.

For the current evidence ladder and exact resume procedure, see
[RELEASE_STATUS.md](RELEASE_STATUS.md). In particular, version 1.0 build 2 was
uploaded successfully on 2026-08-11 but predates the current gameplay-polish
commit and is not the release candidate.

Complete [TESTFLIGHT_EVIDENCE.md](TESTFLIGHT_EVIDENCE.md) for the exact binary
being submitted. An Organizer success sheet for an older build does not satisfy
the current-candidate evidence requirement.

## Product identity

| Field | Release value | Gate |
|---|---|---|
| Name | Mahjong Brain | Locked |
| Bundle ID | `com.nihi.mahjong` | Confirmed 2026-08-11; matches Capacitor, Xcode, Apple audience, and App Store record |
| Apple app ID | `6800468742` | Verified from the successful Xcode build-2 upload record |
| SKU | `mahjong-brain-ios-001` | Prepared for the App Store Connect record |
| Primary category | Games / Board | Confirm in App Store Connect |
| Secondary category | Games / Puzzle | Confirm in App Store Connect |
| Age rating | Complete questionnaire from shipped content | No gambling, chat, UGC, or unrestricted web access |
| Support URL | `https://mahjong-brain.pages.dev/support/` | HTTP 200 verified 2026-08-13 |
| Privacy URL | `https://mahjong-brain.pages.dev/privacy/` | HTTP 200 verified 2026-08-13; must match the submitted binary |

## App privacy answers

Answer from the release candidate, not from planned features.

| Data type | Collected | Linked to identity | Tracking | Purpose |
|---|---:|---:|---:|---|
| User ID (Apple account identifier) | Only after optional sign-in | Yes | No | App functionality; settings and verified unlock sync |
| Purchases (original transaction identifier/status) | Only when purchase/restore is enabled | Yes when signed in | No | App functionality; entitlement verification and fraud prevention |
| Gameplay content (board/session state) | Anonymous session summaries only | No | No | Analytics and app functionality |
| Product interaction | Anonymous event names/properties | No | No | Analytics |
| Email address | No | — | No | — |
| Coarse location (IP-derived) | Yes, by Google Mobile Ads | No | No | Third-party advertising, analytics, fraud prevention |
| Advertising data | Yes, by Google Mobile Ads | No | No | Third-party advertising and analytics |
| Product interaction (ad views/interactions) | Yes, by Google Mobile Ads | No | No | Third-party advertising and analytics |
| Diagnostics and performance data | Yes, by Google Mobile Ads | No | No | App functionality, analytics, and advertising |
| Device ID (app- or developer-bounded) | Yes, by Google Mobile Ads | No | No | Third-party advertising, analytics, fraud prevention |
| Apple advertising identifier (IDFA) | No; the app does not request ATT access | — | No | — |

The analytics schema intentionally has no account column. Do not label anonymous
session analytics as linked merely because optional account features exist in the
same app. Conversely, do not describe Apple account or verified purchase records
as anonymous. The release config disables ad personalization and Google's
publisher first-party identifier. Recheck the exact Google Mobile Ads privacy
manifest in the submitted archive before answering App Store Connect because
SDK disclosures can change between versions.

## Encryption and export compliance

The app uses standard HTTPS/TLS and Apple platform cryptography for authentication
and receipt verification. Confirm the App Store Connect export-compliance answer
against the exact archive and current Apple questionnaire before submission; do
not infer an exemption in automation.

## Review notes

Use this factual outline and update it for the submitted build:

1. The game is playable without an account.
2. First launch shows Terms, an optional demographic age-range question, a short
   setup screen, and a three-step interactive tutorial.
3. On the home screen, tap **Level 1** to start. Match identical free-edge tiles.
4. The holder accepts up to four unmatched tiles. Matching pairs clear
   automatically. Shuffle, Hint, and Undo remain at the bottom of gameplay.
5. Sign in with Apple and purchase controls are hidden unless their production
   services and StoreKit product are configured. No mock entitlement can unlock
   the release build.
6. No review account is required for local gameplay. If account/purchase features
   ship in the submitted build, provide a real sandbox review path here.
7. Game Center is optional. Open Settings, then Game Center, to authenticate and
   view the two leaderboards and five achievements documented in
   `release/GAME_CENTER_SETUP.md`.

## Screenshot set

Capture only from the signed release candidate after all permanent configuration
passes `npm run preflight`. Required narrative:

1. Home — one clear **Level 1** action.
2. Gameplay — large layered tiles and fixed control anchors.
3. Holder warning — three of four slots filled.
4. Hint or blocked-tile guidance — truthful, non-reflowing feedback.
5. Accessibility/settings — readable choices without unsupported claims.

Create current App Store Connect-required iPhone and iPad sizes from native
captures. Do not upscale browser screenshots, show debug chrome, or advertise a
feature hidden in the submitted binary.

## Evidence ladder

Record each separately in the release handoff:

- local source and tests
- committed SHA
- pushed branch
- pull request and CI
- merged SHA
- signed archive and validation result
- upload/build number
- App Store processing state
- internal TestFlight availability
- tester-group availability

## Archive preparation

Run `npm run ios:prepare` immediately before creating the signed archive. It
fails closed on release configuration, rebuilds and syncs the production app
into the ignored Capacitor native bundle, and verifies every bundled file
byte-for-byte. A successful Xcode build without this check is not evidence that
the archive contains the current UI or brand assets.

After archiving, run `npm run ios:verify-archive -- /path/to/MahjongBrain.xcarchive`.
This independently checks the bundle identifier, display name, marketing/build
versions, minimum iOS, iPhone/iPad support, privacy manifest, compiled icons,
and current web brand assets inside the archive. The archive still requires
Apple signing, validation, upload, and processing evidence afterward.

CI also runs `npm run ios:build-simulator` on macOS. That is authoritative proof
that the committed Swift/SPM/Xcode target compiles for iPhone and iPad without
signing; it is deliberately not treated as proof of distribution signing,
archive validation, upload, processing, or TestFlight availability.

### Prior upload evidence

Xcode Organizer contains two version 1.0 archives from 2026-08-11. Build 1's
upload failed with Apple error 90474 for its iPad orientation declaration.
Build 2's distribution record reports `Uploaded to Apple` with no errors at
2026-08-11T21:05:49Z. This proves upload only. It does not prove processing,
TestFlight availability, or that the binary contains current source. Its web
asset hashes differ from the current production build.
