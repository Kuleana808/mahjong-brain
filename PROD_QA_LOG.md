# Production QA log — gameplay and audio

Run against the checklist Brent gave on 2026-09-02 after reporting that "some
of the tiles and the audio were weird" in past builds.

| | |
|---|---|
| **Date** | 2026-09-02 |
| **Branch / commit** | `gameplay-qa-claude`, on top of `main` @ `e41f1af` |
| **Version / build** | 1.0 (7) |
| **Automated** | `tests/gameplay/` — 37 cases, all passing |
| **Full suite** | 414 passing across 36 files |
| **Manual** | iPhone 17 Pro simulator + browser at 375x812 |
| **Physical device** | **NOT TESTED — no device paired.** See Risks |

**Two real bugs were found and fixed.** Both are in the class Brent described,
and one of them is visible in a screenshot.

---

## Tiles

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Every tile renders, no missing glyphs or fallback boxes | **PASS** | 144-tile board rendered; bamboo, circles, 萬 characters, 東南西北 winds, 白/中 dragons and a flower all legible. Faces are drawn in code (`src/render/tileArt.ts`), not a font, so glyph substitution cannot occur. Automated: every one of the 42 distinct faces produces a non-empty name with no `undefined`/`NaN`. |
| 2 | Matching: suit+rank exact; winds/dragons exact; flowers and seasons by category | **PASS** | `matchGroup` returns the bare suit for flower/season and `suit-rank` otherwise — the traditional bonus-tile rule. Automated: exact-match, cross-suit rejection, wind≠dragon at equal rank, flower≠season, and symmetry/reflexivity across all 144 faces. |
| 3 | Free-tile detection: uncovered AND one open side | **PASS** | `isCovered` checks **every** higher layer, not just z+1, so a tile cannot be lifted out from under a bridging tile. Automated: lone tile, covered-from-two-layers-up, one-side-blocked, both-sides-blocked, half-offset neighbour, full-gap neighbour, different row, different layer. Also verified there is **no** same-layer pair in any shipped layout with `1 < dx < 2`, so the `(x-2, x)` side-blocking window is exact in practice. |
| 4 | Selection, deselection, pair removal | **PASS** | Holder fixture shows two unmatched tiles held, counter at 142, no stuck selection. `canPair` refuses a tile against itself, a mismatched face, and any blocked tile. |
| 5 | Undo restores exact prior state | **PASS** | Automated: remaining-id set, `removed` history length and the free-tile set all return to their pre-move values. No-op when there is nothing to undo. Undo button correctly greys out on a fresh board and enables after the first move. |
| 6 | Hint offers a genuinely legal pair | **PASS** | Automated across 5 seeds: every pair `availableMoves` returns satisfies both `facesMatch` and `canPair`. |
| 7 | Deadlock detected, reshuffle offered | **PASS** | Automated: `isStuck` agrees exactly with "no available moves" at every step of a 40-move walk. On a stuck board, either `canReshuffle` is true and a reshuffle yields ≥2 free tiles with the tile count preserved, or fewer than two positions are free and the geometry genuinely cannot be played — in which case the button is correctly not offered. |
| 8 | Win / lose states | **PASS** | Win path exercised by the existing suite (XP grant, level, IQ, Game Center report). Holder-full renders the revive screen with reassuring copy and three exits. |
| 9 | **Every layout renders correctly, no floating or overlapping tiles** | **FIXED** | **Real bug — see below.** Now automated: even tile count, no duplicate positions, and every tile above z=0 supported by a footprint-overlapping tile beneath it, for all three layouts. |

### BUG FIXED — two tiles floated in mid-air on the Lotus Terrace layout

The `turtle` layout's crown layer was declared at `offset: [3, 0.5]` while the
layer beneath it spans y 4–5:

```
z=3  offset [3, 4]     → y 4-5
z=4  offset [3, 0.5]   → y 0.5     ← ~3.5 tile-widths clear of anything
```

Both crown tiles had nothing under them and nothing beside them, so they were
**permanently free** and drawn hovering over open felt above the stack. Fixed
to `offset: [3, 4.5]`, which straddles the two rows of the z=3 block.

Verified three ways: geometrically (support went from 0 tiles to 2 tiles each),
by regression test (the new floating-tile check fails on the old value), and
visually — a before/after capture on the turtle layout shows 北 and a circles
tile detached above the board, then correctly seated on top of the stack.

Tile count stays 144. This is almost certainly the "weird tiles" report: the
layout is the **second** one players reach (`relativeDifficulty` 0.30 → 0.55),
so it is hit early. It never appeared in the App Store screenshots because
every QA fixture uses the `pyramid` layout.

---

## Audio

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Sound assets load — no 404s, silent files, wrong format | **N/A by design** | There are no sample files. Every sound is synthesized WebAudio (`src/audio/sounds.ts`), so this entire failure class cannot occur. Automated instead: all 9 sounds create oscillators, every oscillator is both started and scheduled to stop, and each has at least one gain ramp above the audible floor — a "silent file" equivalent would fail here. |
| 2 | Timing — synchronous with the visual | **PASS** | Everything is scheduled at `ctx.currentTime + 0.004`. Automated: no sound schedules before now, and no component lags more than 200 ms. |
| 3 | Rapid taps layer without dropping or clipping | **PASS** | Each play builds its own oscillator/gain pair rather than reusing a shared node. Automated: three rapid taps produce exactly 3× the nodes, all scheduled to stop. |
| 4 | Volume mixing | **PASS (by inspection)** | SFX peak 0.018–0.028; ambient music sits at 0.012 behind a 920 Hz lowpass, so music stays under SFX. Both go through the system output and respect the hardware volume. **Not verified audibly — see Risks.** |
| 5 | Mute honoured, persists across restart | **PASS** | Automated: with sounds disabled, the audio context is never even opened; re-enabling restores output; disabling music ramps the gain down rather than cutting. Settings persist through the normal settings store, covered by the existing suite. |
| 6 | Silent switch respected | **FIXED** | See below. Now `.ambient`, which obeys the ring/silent switch. |
| 7 | Background audio / ducking behaves per iOS convention | **FIXED** | See below. Previously the app **stopped** the player's other audio. |
| 8 | Interruption (call, alarm, Siri) recovers | **FIXED** | See below — two separate causes, one native and one web. |
| 9 | No audio bleed on loading, splash or age gate | **PASS** | Automated: importing the module opens no audio context; music does not start while the document is hidden. The context is created on first play only. |

### BUG FIXED — the app stopped whatever the player was listening to

**No `AVAudioSession` category was ever set.** `AppDelegate` was stock
boilerplate, `Info.plist` declares no `UIBackgroundModes`, and Capacitor sets
none. A WKWebView with no configured category inherits **`soloAmbient`**, which
interrupts other audio on launch.

So a player listening to a podcast or music lost it the moment they opened a
calm tile game. That is the most likely other half of "the audio was weird".

Fixed by declaring `.ambient` in `AppDelegate`: mixes with other apps rather
than interrupting them, and obeys the ring/silent switch — both of which are
what a player expects from optional game audio.

### BUG FIXED — audio stayed dead after an interruption

Two independent causes, both fixed:

1. **Native.** Nothing observed `AVAudioSession.interruptionNotification`. After
   a call, alarm or Siri the session stayed deactivated for the rest of the run
   and the web layer could not bring it back on its own. Now the session is
   reactivated on interruption-ended and on `applicationDidBecomeActive`.
2. **Web.** `AudioContext.resume()` is asynchronous, and `startAmbientMusic`
   bailed on `state !== 'running'` *immediately after calling it* — so the
   resume completed with nothing left to start the music. Now it retries once
   resume settles, and a new `resumeAudio()` is called on `visibilitychange`
   and `focus`. Covered by two regression tests.

---

## The hum (2026-09-02, second pass)

> Brent: "There is a hum for the sound in the app that isn't pleasant."

**Root cause: the ambient music WAS the hum.** Not an artifact in it — the
thing itself. The bed was three oscillators at 146.83 / 220 / 293.66 Hz,
started once and never stopped or modulated, under a 920 Hz lowpass. A
sustained low chord playing forever is the acoustic definition of a hum.

None of the six suspected causes applied: there are no audio files in the repo
at all, so a bad recording, a loop-point artifact, a sample-rate mismatch and a
silent buffer are all impossible; and the session category was already `.ambient`
rather than `.playAndRecord` from the earlier pass.

**Fix.** Sounds are now data (`src/audio/spec.ts`) and the bed is a slow
sequence of struck bell tones, one every 3.4 s, each decaying to silence before
the next. Nothing sustains, so nothing can drone. No partial anywhere in the
game sits below 180 Hz, and a 150 Hz highpass backstops the noise bursts.

**Measured, in the browser's real WebAudio engine via OfflineAudioContext:**

| measure | old drone | new bed | test threshold |
|---|---:|---:|---:|
| 146.83 Hz energy / peak | 0.1811 | **0.0001** | < 0.02 |
| tail / peak (does it decay?) | 0.9042 | **0** | < 0.01 |

**Regression:** `tests/gameplay/audio-analysis.test.ts` renders every sound to a
buffer and measures DC offset, energy at 50/60/120/146.83 Hz, clipping, and
whether the bed decays. Re-rendering the old drone through the same maths fails
it 9x over on hum energy and 90x over on sustain.

Also fixed while measuring: the ambient bed was **louder than the quietest sound
effect** (0.022 vs 0.020). Now 0.016, and a test enforces the ordering.

| # | Item | Result |
|---|---|---|
| Hum root-caused and removed | | **PASS** |
| No DC offset in any sound | | **PASS** — all < 1e-3 |
| No persistent low-frequency energy | | **PASS** — all < 2% of peak |
| No clipping | | **PASS** |
| Music quieter than effects | | **PASS** — enforced by test |
| Hum gone on a real device | | **NOT TESTED — no device paired** |

## UI defect sweep (2026-09-02)

> Brent: "still sees UI defects", without a list yet.

Screenshotting 49 fixtures on two devices is ~100 images and a poor way to find
truncation, hit areas or contrast — those are measurable. `npm run ui:sweep`
drives CDP over every QA fixture at iPhone (393x852 @3x) and iPad (1032x1376
@2x) and reports overflow, clipped text, sub-44pt targets, WCAG contrast,
placeholder strings, broken or low-res images, and modals with no exit.

### Result: the automated sweep found ZERO genuine defects

98 page-states measured. Every one of the 242 raw findings was a probe bug, and
all three classes are now suppressed with the reason recorded in the script:

| raw class | count | verdict |
|---|---:|---|
| `safe-area-top` / `safe-area-bottom` | 231 | **False positive.** A headless browser reports `env(safe-area-inset-*)` as 0, so every element near an edge looks like a violation. The shell pads all four insets (`app.css:168`), `viewport-fit=cover` is deliberate, and the simulator screenshot shows the top bar below the status bar. Safe-area is a simulator check, and the check was removed. |
| `text-clipped` / `text-clipped-y` | 6 | **False positive.** All six are `class="visually-hidden"`, `clip-path: inset(50%)`, `aria-live="polite"`, 1x1px — correct screen-reader live regions. Now skipped. |
| `progress-visible` | 5 | **Informational.** The loading bar and the home level bar are both legitimately present. Narrowed to `aria-busy="true"` only. |
| `contrast` | 0 after fix | The first run reported the win card as failing at 1.50:1. That was a probe bug: it read only `background-color` and walked past a card painted with a `linear-gradient` onto the dark scrim behind it. Real ratio is ~11:1. Fixed to read gradient stops. |

**What that means.** The measurable defect classes are clean. Every real defect
found today came from looking at screens and interacting with them, not from
static measurement — which is worth knowing about where to spend future effort.

### Real defects found, by inspection

| # | Defect | Severity | Status |
|---|---|---|---|
| U1 | **Paywall dismiss unreachable after a failed purchase.** The error paragraph pushes content past the card's `min(90dvh, 780px)` cap; "Not now" rendered at y 760-808 against a visible box ending at 771. `elementFromPoint` at the button's own centre returned `DIV.overlay`. Error state only. | **Blocker** | **FIXED** — PR #25, actions pinned in a sticky footer |
| U2 | **Levelling up was completely invisible.** No level-up UI existed anywhere in `src/ui/`. XP moved, the level changed, nothing said so. | **High** | **FIXED** — PR #24, result screen shows the bar and a "Level N reached" line |
| U3 | **Level bar could caption "0 XP to Level 2".** `homeLevelBar` trusted the caller's level instead of deriving it from XP; when they disagreed it rendered an empty bar with a nonsense caption, and announced a self-contradicting `aria-valuetext`. | **High** | **FIXED** — PR #24, level derived from XP |
| U4 | **Shuffle at zero is labelled by state, not action.** `aria-label="Shuffle, 0 available"` while tapping opens the purchase sheet. Sighted players see a badge; screen-reader users are told a count and nothing about the action changing. | Medium | Punch list |
| U5 | **Win screen shows no XP gained.** It now shows progress toward the next level, but never says how much this board earned. | Low | Punch list |

Two of the three fixes were themselves verified by hit test rather than by eye,
because U1 proves a screenshot can look correct while a control is untappable.

### Competitor comparison — not done as specified

There are no Vita Mahjong **screenshots** in the repo, only a written parity
audit (`docs/VITA_LIVE_PARITY_AUDIT_2026-08-13.md`). Its open gaps are product
scope rather than UI defects: rewarded Hint/Revive providers, the consumable
shuffle ledger, daily-reward UI, and production tile/background theme sets. A
visual side-by-side needs reference captures that do not exist here.

## Risks and what was not tested

1. **No physical device.** `xcrun devicectl list devices` reports none paired,
   so there was no on-device play-through. Haptics, real speaker mixing, the
   hardware silent switch, and true call interruption behave differently from
   the simulator and remain **unverified on hardware**. The three audio-session
   fixes above are the highest-value items to re-check on the TestFlight build,
   because they are precisely the behaviours a simulator cannot demonstrate.
2. **Audio was never actually heard.** Everything above is verified structurally
   — nodes created, envelopes scheduled, gains non-zero — not by listening.
   Volume balance (item 4) is an inspection judgement, not a measurement.
3. **Solvability is guaranteed by construction, not proven by search.** The
   dealer builds each board backwards by removing currently-free pairs, so a
   winning line exists by definition; that order is not recoverable from public
   board state, and mahjong solitaire is NP-hard, so a heuristic search with a
   200,000-node budget does not clear a 144-tile board. Rather than ship a test
   that measures search strength, the suite asserts the property that actually
   protects the player: they are never left stuck without a reshuffle or an
   honest explanation.
4. **Undo depth.** Undo restores one move at a time and is verified for a single
   step and for the empty case. Deep multi-step undo chains are not exercised.
