import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Mahjong Brain',
  description: 'How Mahjong Brain handles local game progress, anonymous analytics, advertising, optional Apple sign-in, and purchases.',
};

export default function Privacy() {
  return (
    <main className="legal-page">
      <header className="site-header">
        <Link className="wordmark" href="/">Mahjong Brain</Link>
        <nav aria-label="Site navigation"><Link href="/support/">Support</Link></nav>
      </header>

      <article className="paper-panel policy">
        <p className="eyebrow">Effective August 14, 2026</p>
        <h1>Privacy Policy</h1>
        <p className="lede">Mahjong Brain is designed for local play and does not build an advertising profile about you.</p>

        <h2>Information stored on your device</h2>
        <p>The app saves game progress, an in-progress board, settings, and queued anonymous gameplay events on your device. This lets play continue offline and resume after the app closes.</p>

        <h2>Anonymous product analytics</h2>
        <p>Mahjong Brain may send a limited, closed list of events such as app open, tutorial completion, board start, board completion, holder fill, hint, shuffle, and purchase-flow steps. These records use a resettable random device identifier and session identifier. The analytics database has no account field, email address, advertising identifier, precise location, contacts, or tile-by-tile board history.</p>

        <h2>Optional Sign in with Apple</h2>
        <p>If you choose to sign in, we receive and verify Apple&apos;s identity token and store the Apple account identifier needed to maintain your account. We do not store your email address. Account records can hold synced settings and verified unlock status. Sign-in is not required for free play.</p>

        <h2>Purchases</h2>
        <p>Apple processes payments. To verify or restore an unlock, the service may store purchase status and the original transaction identifier. A transaction cannot unlock two accounts. Payment-card details are never received or stored by Mahjong Brain.</p>

        <h2>Tracking and advertising</h2>
        <p>Mahjong Brain uses Google Mobile Ads to offer an optional rewarded Hint or Revive and to show a frequency-capped ad after some completed rounds. A one-time purchase removes automatic round-boundary ads; optional rewarded ads remain available when you choose them.</p>
        <p>Advertising requests are configured as non-personalized, the Google publisher first-party identifier is disabled, and Mahjong Brain does not request access to Apple&apos;s advertising identifier. Google&apos;s advertising services may still process an IP-derived approximate location, app interactions, advertising data, diagnostics, performance data, and an app- or developer-bounded device identifier for ad delivery, frequency limits, fraud prevention, reporting, and analytics. These advertising records are not joined to a Mahjong Brain account or to our first-party gameplay analytics.</p>
        <p>Where legally required, Google&apos;s User Messaging Platform presents consent choices before ads are requested. Those choices can be reviewed again from Ad privacy choices in Settings.</p>

        <h2>Retention and security</h2>
        <p>Local information remains until you remove the app or clear its data. Server records are retained only as needed to provide account, entitlement, fraud-prevention, and aggregate product-analysis functions. Network requests use encrypted HTTPS. Authentication and purchase verification fail closed when they cannot be completed securely.</p>

        <h2>Your choices</h2>
        <p>You may play without signing in. You can sign out in Settings, change device permissions in iOS Settings, and remove local app data by deleting the app. For an account-data request, use the support contact on the App Store listing.</p>

        <h2>Children</h2>
        <p>Mahjong Brain is not directed to children under 13 and does not knowingly collect personal information from children under 13.</p>

        <h2>Changes</h2>
        <p>Material changes will be reflected here with a new effective date and, when appropriate, communicated in the app or App Store release notes.</p>

        <h2>Contact</h2>
        <p>Use the support contact on Mahjong Brain&apos;s App Store listing for privacy questions or requests.</p>
      </article>

      <footer><Link href="/">Home</Link><Link href="/support/">Support</Link></footer>
    </main>
  );
}
