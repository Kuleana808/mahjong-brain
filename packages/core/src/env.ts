/**
 * Configuration, readable from anywhere.
 *
 * `packages/core` runs in three places — the Vite app, the API process, and
 * Vitest — and each exposes environment variables differently. `import.meta.env`
 * is a syntax error in some Node contexts and `process` does not exist in the
 * browser, so neither can be referenced directly from shared code.
 *
 * Everything reads through here instead, and a host can override any value at
 * startup with `configure()`.
 */

export interface CoreConfig {
  /** Base URL of an Ollama server, if one should be tried at all. */
  ollamaHost: string;
  ollamaModel: string;
  ollamaEnabled: boolean;
  /** Verbose routing logs. Off in production. */
  debug: boolean;
}

const DEFAULTS: CoreConfig = {
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'gemma3:4b',
  ollamaEnabled: true,
  debug: false,
};

function readEnv(): Record<string, string | undefined> {
  // Vite replaces `import.meta.env` at build time; Node has `process.env`.
  // Both accesses are guarded because referencing the missing one throws.
  const fromVite = ((): Record<string, string | undefined> => {
    try {
      return (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
    } catch {
      return {};
    }
  })();

  const fromNode = ((): Record<string, string | undefined> => {
    try {
      const nodeProcess = (globalThis as {
        process?: { env?: Record<string, string | undefined> };
      }).process;
      return nodeProcess?.env ?? {};
    } catch {
      return {};
    }
  })();

  return { ...fromNode, ...fromVite };
}

function fromEnvironment(): CoreConfig {
  const env = readEnv();
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = env[key];
      if (value !== undefined && value !== '') return value;
    }
    return undefined;
  };

  return {
    ollamaHost: pick('VITE_OLLAMA_HOST', 'OLLAMA_HOST') ?? DEFAULTS.ollamaHost,
    ollamaModel: pick('VITE_OLLAMA_MODEL', 'OLLAMA_MODEL') ?? DEFAULTS.ollamaModel,
    ollamaEnabled: pick('VITE_DISABLE_OLLAMA', 'DISABLE_OLLAMA') !== 'true',
    debug: pick('DEV', 'NODE_ENV') === 'development' || env.DEV === true.toString(),
  };
}

let current: CoreConfig = fromEnvironment();

export function config(): CoreConfig {
  return current;
}

/** Host override. Call once at startup, before any hint is requested. */
export function configure(patch: Partial<CoreConfig>): void {
  current = { ...current, ...patch };
}

/** Test helper — restores whatever the environment says. */
export function resetConfig(): void {
  current = fromEnvironment();
}
