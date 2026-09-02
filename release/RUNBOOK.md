# Submit runbook

One page, in order, from a clean checkout to a TestFlight build waiting for
Brent. Everything before **Step 0** is already done and merged.

> **Stop at Step 7.** Do not press *Submit for Review*. Brent does that himself
> after seeing the build in TestFlight.

---

## Step 0 — the one blocker (Brent only)

Everything below is blocked on this, and it cannot be done from a terminal
because it writes to the Apple Developer account.

```
error: Provisioning profile "iOS Team Provisioning Profile: com.nihi.mahjong"
       doesn't include the Game Center capability.
error: ...doesn't include the com.apple.developer.game-center entitlement.
** ARCHIVE FAILED **
```

Signing itself is fine — `security find-identity -v -p codesigning` reports a
valid `Apple Distribution: Brent Akamine (RCCA2K8UXV)`. What is missing is a
**Game Center-capable App Store provisioning profile for `com.nihi.mahjong`**.
There is none on this machine; the six installed profiles belong to People by
Place and Mochi Mash.

Either path works:

- **Xcode** → Settings → Accounts → select the team → *Download Manual
  Profiles*. If the downloaded profile still lacks Game Center, delete it in
  the developer portal and let Xcode regenerate.
- **developer.apple.com** → Certificates, Identifiers & Profiles → Profiles →
  create an *App Store* profile for `com.nihi.mahjong` with the Game Center
  capability enabled on the App ID, then download and double-click it.

Confirm before continuing:

```bash
ls ~/Library/MobileDevice/Provisioning\ Profiles/ | wc -l
security find-identity -v -p codesigning | grep Distribution
```

---

## Step 1 — sync and verify the source

```bash
cd ~/mahjong-brain
git checkout main && git pull
npm ci
npm test          # expect: 377+ passing, 0 failing
npm run typecheck # expect: silent
```

## Step 2 — prepare the native bundle

Never skip this. It fails closed on release configuration, rebuilds the web
app, syncs it into the Capacitor native bundle, and verifies every bundled file
byte-for-byte. A green Xcode build without it is not evidence that the archive
contains the current UI or brand assets.

```bash
npm run ios:prepare
# expect: "Preflight clear" and "Native iOS bundle verified: 9 production files match byte-for-byte."
```

## Step 3 — confirm the build number

Build 6 is already on TestFlight from the pre-merge branch head, so the merged
source needs its own number. `CURRENT_PROJECT_VERSION` is currently **7**.

```bash
grep -m2 CURRENT_PROJECT_VERSION ios/App/App.xcodeproj/project.pbxproj
```

If 7 has already been uploaded, bump both occurrences before archiving —
App Store Connect rejects a duplicate build number for a version.

## Step 4 — archive

```bash
xcodebuild -project ios/App/App.xcodeproj \
           -scheme App \
           -configuration Release \
           -destination 'generic/platform=iOS' \
           -archivePath /tmp/MahjongBrain-build7.xcarchive \
           archive
```

Expect `** ARCHIVE SUCCEEDED **`. Known non-blocking warnings: missing dSYMs
for `GoogleMobileAds.framework` and `UserMessagingPlatform.framework`. They
limit crash symbolication inside those third-party frameworks only.

Then verify the archive is what it claims to be:

```bash
npm run ios:verify-archive -- /tmp/MahjongBrain-build7.xcarchive
```

## Step 5 — regenerate screenshots

Do this **after** the archive, so the listing matches the candidate.

```bash
npm run dev            # in another shell; the QA fixtures need a dev build
npm run screenshots    # capture 12 sources, then composite
```

Produces, at exactly the sizes App Store Connect requires:

| Set | Size | Count |
|---|---|---|
| `release/app-store/screenshots/iphone-6.9/` | 1290 x 2796 | 6 |
| `release/app-store/screenshots/ipad-13/` | 2064 x 2752 | 6 |

Apple reuses the 6.9-inch set for the 6.5-inch slot. 5.5-inch is retired and is
not required.

The IAP review screenshots (`release/app-store/iap-review/`, 1170 x 2532) are
separate and already correct.

> **Caveat, stated plainly.** These are captured from a **dev** build, because
> the deterministic states come from QA fixtures that are compiled out of a
> production bundle. `APP_STORE_SUBMISSION.md` asks for captures from the
> signed release candidate. The pixels are identical — the same React tree
> renders in both — but if that rule is read strictly, capture by hand with
> `xcrun simctl io <udid> screenshot` against the release build instead.

## Step 6 — upload (Brent, or Brent-authorised)

**This step authenticates to Apple and publishes. Not automated here.**

Xcode Organizer is the path that produced builds 2, 5 and 6:

1. Xcode → Window → Organizer → Archives
2. Select the `MahjongBrain-build7` archive
3. *Distribute App* → **App Store Connect** → **Upload**
4. Automatic signing, include symbols
5. Confirm the upload succeeds and note the timestamp

Transporter is the alternative if Organizer refuses the account:

```bash
xcodebuild -exportArchive \
           -archivePath /tmp/MahjongBrain-build7.xcarchive \
           -exportOptionsPlist release/ExportOptions-AppStore.plist \
           -exportPath /tmp/MahjongBrain-build7-ipa
# then drag the .ipa into Transporter.app and Deliver
```

Four App Store Connect API keys exist on this machine (`~/Documents`,
`~/iCloud Drive (Archive) - 3/Desktop`). They are deliberately **not** used by
any script here — uploading with them means authenticating and publishing as
Brent.

## Step 7 — verify in TestFlight, then stop

1. App Store Connect → TestFlight → confirm build 7 processes to **Complete**
2. Confirm it appears in the **Mahjong Internal** group as *Testing*
3. Answer the export-compliance prompt if shown — the app already declares
   `ITSAppUsesNonExemptEncryption = false` in `Info.plist`, so it normally
   will not appear
4. Install on a clean device and play one board end to end
5. Record every row in [TESTFLIGHT_EVIDENCE.md](TESTFLIGHT_EVIDENCE.md)

**Stop here and report.** Submit for Review is Brent's call.

---

## Still needs Brent, independent of the above

| Item | Why it needs a person |
|---|---|
| Game Center-capable provisioning profile | Writes to the Apple Developer account — **blocks everything** |
| Apple sandbox test account | None exists; contracts 3 (`auth/apple-id`) and 8 (`receipts/validate`) stay `configured`, not `live_verified`, until a real sandbox purchase and a clean-install restore are observed |
| IAP products → Ready to Submit | Both sit in *Prepare for Submission*; they cannot advance until a build is attached |
| 4 of 5 Game Center achievements | Only `First Clear` exists in App Store Connect. The **code** reports all five with partial progress; the portal records are missing |
| AdMob account verification | Still pending with Google; production fill and payout unproven |
| Age rating questionnaire | The app now gates under-13 players. Confirm the rating and that the Kids category is not selected |
| `signalmarket` cleanup | [`release/cleanup/signalmarket-revert.sql`](cleanup/signalmarket-revert.sql) is written and **not executed**; it needs approval |
| RLS on `signalmarket` | Unrelated to this app, but 13 tables there are exposed to the anon key — see the cleanup file's companion note |
