import type { CapacitorConfig } from '@capacitor/cli';

/**
 * NOTE: `appId` and `appName` are provisional — the final name is Brent's call
 * (docs/DECISIONS.md, D-001). Changing `appId` after the first TestFlight build
 * means a new App Store record, so settle it before the first upload.
 */
const config: CapacitorConfig = {
  appId: 'com.nihi.mahjong',
  appName: 'Nihi Mahjong',
  webDir: 'dist',
  ios: {
    // The felt colour, so there is no white flash behind the board while the
    // web view paints, and none when the board is over-scrolled.
    backgroundColor: '#EDE8DE',
    contentInset: 'never',
    // A board is not a document. Nothing here should rubber-band.
    scrollEnabled: false,
  },
  server: {
    // Requests never leave the device in the shipped app. The AI coach runs
    // offline; Ollama is web/dev only. See src/ai/ollama.ts.
    androidScheme: 'https',
  },
};

export default config;
