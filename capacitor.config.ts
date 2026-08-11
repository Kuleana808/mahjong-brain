import type { CapacitorConfig } from '@capacitor/cli';

/**
 * `appName` is settled: Mahjong Brain (D-001, locked 2026-08-09).
 *
 * `appId` is NOT. It becomes the App Store record and cannot be changed
 * afterwards without a new listing, so it stays on the old value until Brent
 * picks — deliberately, rather than being guessed at and then changed twice.
 * Candidates and the trade-offs are in D-001.
 *
 * The iOS project carries its own copy of both (Info.plist, project.pbxproj).
 * That is Codex's side of the line and is not updated here.
 */
const config: CapacitorConfig = {
  appId: 'com.mahjongbrain.game',
  appName: 'Mahjong Brain',
  webDir: 'dist',
  ios: {
    // The felt colour, so there is no white flash behind the board while the
    // web view paints, and none when the board is over-scrolled.
    backgroundColor: '#003B32',
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
