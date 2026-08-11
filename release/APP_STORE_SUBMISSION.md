# App Store submission packet

This is the QA reference for the first TestFlight/App Store build. Listing copy
lives under `fastlane/metadata`; this file records answers that App Store Connect
does not store in the repository automatically. Never replace a pending value
with a guessed URL, identifier, price, or review credential.

## Product identity

| Field | Release value | Gate |
|---|---|---|
| Name | Mahjong Brain | Locked |
| Bundle ID | `PENDING_PERMANENT_BUNDLE_ID` | Must match Capacitor, Xcode, Apple audience, and App Store record |
| SKU | `PENDING_APP_STORE_SKU` | Internal only; choose before creating record |
| Primary category | Games / Board | Confirm in App Store Connect |
| Secondary category | Games / Puzzle | Confirm in App Store Connect |
| Age rating | Complete questionnaire from shipped content | No gambling, chat, UGC, or unrestricted web access |
| Support URL | `PENDING_SUPPORT_URL` | Must resolve publicly over HTTPS |
| Privacy URL | `PENDING_PRIVACY_POLICY_URL` | Must resolve publicly over HTTPS and match the labels below |

## App privacy answers

Answer from the release candidate, not from planned features.

| Data type | Collected | Linked to identity | Tracking | Purpose |
|---|---:|---:|---:|---|
| User ID (Apple account identifier) | Only after optional sign-in | Yes | No | App functionality; settings and verified unlock sync |
| Purchases (original transaction identifier/status) | Only when purchase/restore is enabled | Yes when signed in | No | App functionality; entitlement verification and fraud prevention |
| Gameplay content (board/session state) | Anonymous session summaries only | No | No | Analytics and app functionality |
| Product interaction | Anonymous event names/properties | No | No | Analytics |
| Email address | No | — | No | — |
| Advertising data | No | — | No | — |
| Device ID for advertising | No | — | No | — |

The analytics schema intentionally has no account column. Do not label anonymous
session analytics as linked merely because optional account features exist in the
same app. Conversely, do not describe Apple account or verified purchase records
as anonymous.

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
