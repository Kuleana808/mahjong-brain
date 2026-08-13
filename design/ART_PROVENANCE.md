# Art provenance

Every image asset that ships must have a row here. No exceptions, including
placeholders.

This is the trademark firewall in ledger form. The product is a deliberate
functional clone (D-014); the *only* thing keeping that on the right side of the
line is that every pixel is ours (D-006). If a question is ever asked about a
particular asset, the answer has to be a record rather than a memory.

Clone litigation is live in this niche. "We think it was generated" is not an
answer.

---

## How to add a row

For anything AI-generated — which is the approved direction for tile art
(Brent, 2026-08-11: generate and curate, no commission) — record the model, the
date, and the prompt. Keep the prompt: it is the thing that shows the asset was
authored rather than copied.

| Field | Notes |
|---|---|
| Asset | Repo path |
| Origin | `generated` · `drawn-in-code` · `licensed` · `placeholder` |
| Source | Model and version, tool, or licence + link |
| Date | When it was produced |
| Prompt / notes | Verbatim prompt for generated art. Licence terms for licensed art |
| Reviewed | Who confirmed it is not derivative of an incumbent |

### Rules

- **Never** an asset traced from, sampled from, or prompted to imitate Vita
  Mahjong, Meowdoku or any other commercial title. Prompting a model with a
  competitor's name or "in the style of <app>" produces a derivative work and
  is exactly what this ledger exists to prevent.
- Prompts must describe the *thing* — "a bamboo stalk, minimal calligraphic
  line" — never another product.
- Placeholders are allowed and must be marked `placeholder`. Shipping one is
  a release decision, not an accident; `npm run preflight` warns about them.

---

## Ledger

| Asset | Origin | Source | Date | Prompt / notes | Reviewed |
|---|---|---|---|---|---|
| `src/render/tileArt.ts` (all tile faces) | drawn-in-code | Arcs, rounded rects and strokes written for this project | 2026-08-09 | No raster assets. Traditional suit *semantics* are centuries-old public domain; the drawings are original. See D-006 | Claude Code |
| `design/assets/app-icon-generated-source.png` and `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | generated | OpenAI built-in image generation | 2026-08-12 | Premium iOS game icon: one oversized glossy ivory `發` mahjong tile on dark emerald felt, narrow jade sidewall, warm amber match burst, sparse ceramic chips, compact bronze rim, and restrained olive leaves. Original composition; no competitor names or images in the prompt. Iterated from a calmer first-party generated candidate to add game energy. | Codex, visually checked at 60 px |
| `public/brand-mark.png` and `public/favicon.png` | derived | Deterministic downscales of `design/assets/app-icon-generated-source.png` | 2026-08-12 | Web/app brand renditions of the approved App Store icon; no generative edits after the approved source | Codex |
| `ios/App/App/Assets.xcassets/Splash.imageset/**` | derived | Deterministic composition from the approved generated icon via `scripts/render-brand-splash.py` | 2026-08-12 | The same approved `發` mark centered on an original emerald radial field with one restrained bronze rule; no new generated content | Codex |

---

## Tile art direction (Brent, 2026-08-11)

Approved approach: **AI-generate and curate.** No commission.

Set: bams 1–9, craks 1–9, dots 1–9, four winds, three dragons. Flowers and
seasons too if the deal uses the full 144-tile set.

**Direction: modern minimalist / calligraphic.** Explicitly *not* the incumbent's
chibi-mascot register — a distinct visual language, not a look-alike.

Two constraints that come from the code rather than taste, and which a generated
set will fail if nobody says so up front:

1. **Colour is never the only signal.** Every tile carries a suit badge *shape*
   and, on the numbered suits, an Arabic numeral. That is an accessibility
   requirement for a 60+ audience, not decoration, and it has to survive the
   restyle. See D-006.
2. **Legibility at thumbnail size beats detail.** A tile is roughly 40 px wide
   on a phone with 144 of them on screen. Fine calligraphic strokes that read
   beautifully at 512 px turn to mush at 40 px — check every candidate at the
   real size before curating it in.

Tile art is Codex's side of the line (`src/render`). This file is the ledger
they write into.
