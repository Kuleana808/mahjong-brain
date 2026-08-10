/**
 * COPY SCAFFOLD. Structure and words are a starting point for Codex, not a
 * finished page — the locked visual spec lives in Notion and is not readable
 * from here, so nothing below claims to match it.
 *
 * Two rules this page must keep whatever else changes:
 *
 *   1. Every claim is true of the shipping app. The retired "no ads / $4.99
 *      once / no streaks" copy is gone, not softened.
 *   2. Nothing borrowed. Copy, structure and any future art are original —
 *      that is the trademark firewall, and marketing is where a clone gets
 *      noticed first (D-006, D-014).
 */

const HOW_IT_PLAYS = [
  'Tap a free tile and it moves to your holder.',
  'Two that match clear themselves.',
  'Four slots. Fill them all without a match and the run is over.',
];

const READABILITY = [
  'Every tile carries a number and a shape, not just a colour',
  'Three text sizes, applied to the whole game',
  'A high-contrast theme, and a dark one',
  'Colours chosen to stay distinct for colourblind players',
  'Playable by keyboard, readable by VoiceOver',
];

export default function Home() {
  return (
    <main>
      <h1>Tile matching that keeps you sharp.</h1>
      <p className="lede">
        The classic tile game, with tiles big enough to actually read and a board that meets you
        where you are. Free to play.
      </p>

      <section>
        <h2>How it plays</h2>
        <ol className="steps">
          {HOW_IT_PLAYS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          So the game is really about which tile you take next, not which two you can see. Turtle,
          pyramid and dragon boards, getting harder as you get better — quietly, without ever making
          you pick a difficulty.
        </p>
      </section>

      <section>
        <h2>Made to be read</h2>
        <ul className="checks">
          {READABILITY.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="cta-card">
        {/*
          App Store badge placeholder. The real badge is Apple's artwork and
          comes with its own usage rules, so it is deliberately not faked with a
          look-alike here — that would be borrowed art on the one page most
          likely to be looked at.
        */}
        <div className="badge-placeholder" role="img" aria-label="App Store badge placeholder">
          App Store badge
          <small>placeholder — Apple artwork, added at submission</small>
        </div>
        <p className="cta-note">
          Early build. Rough edges expected, and your feedback shapes what comes next.
        </p>
      </section>

      <footer>
        <p>
          Mahjong Brain is an independent game. It is not affiliated with or endorsed by any other
          mahjong app. All artwork, iconography and branding are original to this project.
        </p>
        <p>Made in Hawai&#699;i.</p>
      </footer>
    </main>
  );
}
