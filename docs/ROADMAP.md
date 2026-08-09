# Roadmap to TestFlight

Scaffold is done. What follows is the next three PRs, in order, each shippable
on its own. Target is TestFlight in 2–4 weeks.

The same TODOs are marked at their call sites in the code so they are findable
from where the work happens, not only from here.

---

## PR 2 — Make it feel like a real board

*The scaffold plays correctly. It does not yet feel good under a thumb.*

- **Tile lift and land.** The one animation the brief allows: 120ms lift on
  select, land on match. Nothing else moves. Must no-op under reduced motion.
- **Match feedback.** Matched tiles fade rather than vanish, so the eye can
  follow what left the board.
- **Board fill on start.** Tiles arrive in construction order over ~600ms. This
  is the "board fills → play" beat in the brief; it is also the only moment in
  the app where motion is doing narrative work.
- **Portrait/landscape reflow** without a redeal — the deal is seed-based, so
  this is a view concern only.
- **Real app icon and launch screen.** Currently Capacitor defaults.
- Golden-image tests for the tile art, so a refactor cannot silently change a
  face.

Files: `src/render/`, `src/ui/BoardView.tsx`, `ios/App/App/Assets.xcassets`.

---

## PR 3 — Coach the mistake, not just the move

*Right now the coach explains the move it recommends. The teachable moment is
the move the player is about to get wrong.*

- **Look-ahead on player intent.** When the tapped pair is legal but strands the
  other two tiles of its group, say so *before* the move: "those two work, but
  the other two 3 of Bamboo are under the stack." Offer it, do not block it.
- **Stuck prediction.** Warn one move before a deadlock is unavoidable, once,
  quietly. No modal.
- **Hint escalation.** First tap points at a region. Second tap on the same
  position names the tiles. Nobody gets handed the answer on the first ask.
- Wire `getHint` into the coach's second mode; extend `HintAnalysis` with the
  candidate move rather than only the recommended one.

Files: `src/ai/analysis.ts`, `src/ai/hintCoach.ts` (TODO is marked there),
`src/ai/localExplainer.ts`.

---

## PR 4 — Ship the unlock and get onto TestFlight

*Everything above is playable without an Apple developer account. This is the
part that is not.*

- **Resolve D-005** (StoreKit bridge) and implement `Purchases` for real.
  Recommendation in the doc is an in-house StoreKit 2 plugin.
- **Restore purchases** verified on a second device and a fresh install — App
  Review checks this and rejects for it.
- **StoreKit configuration file** so the paywall can be tested in the simulator
  without a sandbox account.
- **Supabase project** for optional settings/unlock sync. Free tier. Opt-in, and
  never a precondition for playing — no login for free play, ever. TODO is
  marked in `src/state/persist.ts`.
- **App Store Connect record**, screenshots, privacy nutrition label (it is
  genuinely "no data collected" — keep it that way), age rating.
- First TestFlight build, internal testers only.

Files: `src/iap/`, `src/state/persist.ts`, `ios/`.

---

## Not in scope before TestFlight

Listed so they do not creep in:

- More layouts. Three is enough to validate; the difficulty ladder needs rungs,
  not variety.
- Android. Capacitor gives it to us nearly free, but it splits review attention.
- Sound. Would need original audio, which is a commissioning decision.
- Any form of account, leaderboard, or social feature.
- Anything that nudges a player to return — that is the whole point.

---

## Open decisions blocking work

See [DECISIONS.md](DECISIONS.md).

| | Blocks |
|---|---|
| **D-001** final app name | App Store record, and it is permanent |
| **D-004** domain purchase | marketing site going live |
| **D-005** StoreKit bridge | PR 4 |
