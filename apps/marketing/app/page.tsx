import Link from 'next/link';
import Image from 'next/image';

const HOW_IT_PLAYS = [
  'Choose a free tile from either open edge.',
  'Matching tiles clear automatically in the four-slot holder.',
  'Use hint, shuffle, or undo when you want a little help.',
];

const READABILITY = [
  'Large, high-contrast tile faces',
  'Three comfortable text sizes',
  'Five original background choices',
  'Reduced-motion and blocked-tile controls',
  'VoiceOver labels and generous touch targets',
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="wordmark" href="/">Mahjong Brain</Link>
        <nav aria-label="Site navigation">
          <Link href="/support/">Support</Link>
          <Link href="/privacy/">Privacy</Link>
        </nav>
      </header>

      <section className="hero">
        <Image className="logo-tile" src="/brand-mark.png" width={512} height={512} priority alt="" />
        <p className="eyebrow">A satisfying daily puzzle</p>
        <h1>Big tiles. Clear choices. One more match.</h1>
        <p className="lede">
          Settle into a layered mahjong board with comfortably readable tiles, tactile matches,
          and just enough help when you need it.
        </p>
      </section>

      <section className="paper-panel">
        <h2>How it plays</h2>
        <ol className="steps">
          {HOW_IT_PLAYS.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section>
        <h2>Made to be read</h2>
        <ul className="checks">
          {READABILITY.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="cta-card">
        <h2>Coming to TestFlight</h2>
        <p>Mahjong Brain is in active testing. The first build focuses on the complete core game.</p>
      </section>

      <footer>
        <div><Link href="/support/">Support</Link><Link href="/privacy/">Privacy Policy</Link></div>
        <p>Mahjong Brain is an independent game with original artwork and branding.</p>
        <p>Made in Hawai&#699;i.</p>
      </footer>
    </main>
  );
}
