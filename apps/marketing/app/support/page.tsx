import Link from 'next/link';

export const metadata = {
  title: 'Support — Mahjong Brain',
  description: 'Help with gameplay, purchases, account sync, accessibility, and troubleshooting in Mahjong Brain.',
};

export default function Support() {
  return (
    <main className="legal-page">
      <header className="site-header">
        <Link className="wordmark" href="/">Mahjong Brain</Link>
        <nav aria-label="Site navigation"><Link href="/privacy/">Privacy</Link></nav>
      </header>

      <article className="paper-panel policy">
        <p className="eyebrow">Player support</p>
        <h1>How can we help?</h1>
        <p className="lede">Most play stays safely on your device. These steps resolve the most common interruptions without losing your completed levels.</p>

        <h2>How do I choose a tile?</h2>
        <p>A tile is available when nothing covers it and either its left or right edge is open. Available tiles remain bright; blocked tiles can be dimmed in Settings.</p>

        <h2>What happens in the holder?</h2>
        <p>Every chosen tile moves into the four-slot holder. Two matching tiles clear automatically. If four unmatched tiles fill the holder, the round pauses and you can restart or return home.</p>

        <h2>My progress did not load</h2>
        <p>Close and reopen the app once. Local progress should restore without a network connection. If stored data is damaged, Mahjong Brain starts safely at Level 1 instead of showing a blank screen.</p>

        <h2>Sign in with Apple</h2>
        <p>Sign-in is optional. When available, it lets settings and a securely verified unlock follow you to another device. Free play and local progress never require an account.</p>

        <h2>Restore a purchase</h2>
        <p>Open Settings and choose Restore purchase. Use the same Apple ID that made the purchase. An unlock is granted only after Apple&apos;s purchase record passes secure verification; a network failure never creates or removes an entitlement.</p>

        <h2>Accessibility</h2>
        <p>Settings include larger text, reduced motion, high contrast, sound, vibration, and blocked-tile visibility. The board also provides VoiceOver labels for tile identity and availability.</p>

        <h2>Still need help?</h2>
        <p>Use the support contact shown on Mahjong Brain&apos;s App Store listing. Include your device model, iOS version, and what you saw. Never send an Apple identity token, purchase receipt, or password.</p>
      </article>

      <footer><Link href="/">Home</Link><Link href="/privacy/">Privacy Policy</Link></footer>
    </main>
  );
}
