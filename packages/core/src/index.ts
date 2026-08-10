/**
 * `@mahjong-brain/core` — everything both sides of the build share.
 *
 * Ownership: this package is Claude Code's. The rendering layer, the native
 * shell and the UI are Codex's, under `apps/mobile/**` and `ios/**`. The two
 * meet at the contracts in `./contracts` and at the types re-exported here.
 * Neither side changes the other's shapes without a contract PR.
 *
 * Nothing in here touches the DOM, React, Capacitor, or the filesystem.
 */

export * from './game';
export * from './play';
export * from './ai';
export * from './contracts';
export { config, configure, resetConfig, type CoreConfig } from './env';
