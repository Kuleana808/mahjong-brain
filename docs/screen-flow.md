# Screen flow

The nine screens, as a tested state machine in
[`@mahjong-brain/core/flow`](../packages/core/src/flow/screens.ts). Codex renders
views over it; no screen owns any sequencing logic of its own.

> **This document does not contain the visual spec.** The locked UX/UI spec is a
> private Notion page — palette, typography, motion, exact copy, dimensions and
> art direction all live there and none of it is reproduced or guessed at here.
> What follows is the sequencing and instrumentation half, which is independent
> of how any of it looks.

---

## The machine

```ts
import { initialState, reduce, eventsFor, resumeScreen } from '@mahjong-brain/core';

let state = initialState(savedProgress);        // where a returning player lands
const next = reduce(state, { type: 'accept_tos', at: new Date().toISOString() });
for (const name of eventsFor(action, state, next)) queue(name);   // instrumentation
```

Pure and synchronous. `reduce` returns the same object when an action is not
legal from the current screen, so an illegal transition is a no-op rather than a
crash or a silent jump.

## Order

```
tos → age_gate → loading → tutorial_a → tutorial_b → tutorial_c → home
                                                                    ↓
                                              home → gameplay → game_over → home
                                                                    ↓
                                                              revive → gameplay
```

## What the machine guarantees

These are the failure modes that survive a visual review, because they only
appear on the *second* launch. All are tested.

| Guarantee | Why it matters |
|---|---|
| Gameplay is unreachable until terms are accepted | Legal, and it is the one gate that cannot be skipped |
| A returning player never sees the age gate again | Re-asking reads as not trusting the answer |
| **A failed age gate stays failed across relaunches** | A retry loop teaches people to lie. `ageBlocked` is sticky |
| The tutorial resumes at the step you left | Restarting after a phone call is how people quit |
| A skipped tutorial is never re-offered | |
| Revive returns to `gameplay`, not `home` | It is the entire reason the ad is worth watching |
| Only a win increments `boardsCompleted` | |

## Persisted state

`FlowProgress` is the whole of it — five fields, all gates:

```ts
{
  tosAcceptedAt: string | null,
  agePassed: boolean | null,          // null = unanswered, false = blocked
  tutorialCompleted: 'tutorial_a' | 'tutorial_b' | 'tutorial_c' | null,
  tutorialSkipped: boolean,
  boardsCompleted: number,
}
```

Board state, level and IQ are separate — this is only "what has this person
already been through".

## Instrumentation

`eventsFor(action, before, after)` returns the events a transition must emit.
Calling it is not optional: it is how "no feature without a metric" is enforced
by construction rather than by review attention. Every arrival at a gated screen
fires its `*_shown` event, so a funnel drop always has a location.

A test asserts the machine only ever emits names the catalogue knows. If you
need an event that is not in `EVENT_NAMES`, open a contract PR — see
[api-contracts.md](api-contracts.md) contract 11.

---

## Gameplay screen

The board itself is [`@mahjong-brain/core/play`](../packages/core/src/play/session.ts):
`startSession`, `tapTile`, `revive`, `shuffle`, `hintPair`, `HOLDER_CAPACITY`.

Also pure and synchronous, and replayable from `(layout, seed, taps)` — which
means a bug report only needs three values to reproduce exactly.

The holder filling is the moment `game_over` opens with the Revive offer. That
is the monetisation surface; see D-015.

## Level and IQ

[`@mahjong-brain/core/progression`](../packages/core/src/progression/progression.ts):
`recordBoard`, `levelProgress`, `leveledUp`.

Two numbers, deliberately not collapsed into one:

- **Level** is a ratchet. It only goes up. A lost board still pays XP, at half
  rate. There is a test asserting twenty consecutive losses never reduce it —
  a progress bar that moves backwards is the fastest way to make someone close
  the app.
- **IQ** is an estimate, 60–160, moving both ways and slowly. It responds to
  *how* a board was played, not just whether it was finished. Using hints and
  revives discounts it rather than cratering it: those are products we sell, and
  a score that collapses when someone buys one makes the product feel like a
  trap.

> **The tuning constants are provisional.** They are defaults chosen to behave
> sensibly, not the specified ones, because the spec is unread. They are all in
> one `TUNING` object so the swap is a single edit, and no logic depends on
> their particular values.

## Daily reward

Contract 12. Seven-day cycle, streaks, idempotent claiming, keyed to the
player's local date rather than the server's — see
[api-contracts.md](api-contracts.md).

---

## Ownership

| | |
|---|---|
| **Claude Code** | this machine, the play session, progression, contracts, instrumentation catalogue |
| **Codex** | every view, the visual language, motion, art, `src/render`, `src/ui`, `apps/mobile`, `ios/` |

Adding a screen or changing the order is a change to `screens.ts` and therefore
a contract PR — ping me rather than sequencing inside a view, or the guarantees
above stop holding.
