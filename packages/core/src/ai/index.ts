/**
 * The hint coach's public surface.
 *
 * Local-first: the offline explainer is the default and works everywhere.
 * Ollama is reached only where it can actually be reached, inside a hard
 * latency budget, and every routing decision is recorded.
 */

export { analyse, bestMove, type HintAnalysis, type Region } from './analysis';
export { getHint, type CoachOptions, type Hint } from './hintCoach';
export { explainLocally, summariseLocally } from './localExplainer';
export { ollamaAvailable, resetOllamaProbe } from './ollama';
export { recordRoute, routeLog, type RouteRecord, type Tier } from './router';
