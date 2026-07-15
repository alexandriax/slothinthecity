export const DEBUG_SCENE_CHECKPOINTS = {
  park: "park",
  mobile: "park",
  canopy: "autobranch",
  bridge: "bowbridge",
  boat: "rowboat",
  island: "ticketisland",
  zoo: "zoo",
  subway: "subway",
  station: "subwayplatform",
  train: "trainride",
  transfer: "lexingtontransfer",
  "train-5": "trainride5",
  bronx: "finale",
} as const;

export type DebugSceneName = keyof typeof DEBUG_SCENE_CHECKPOINTS;

const SUBWAY_CHECKPOINTS = new Set([
  "subway",
  "subwayplatform",
  "trainride",
  "trainride5",
  "lexington",
  "lexingtontransfer",
  "westfarms",
  "finale",
]);

function localHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Public `debug` aliases are intentionally named and bounded so a Vercel
 * preview can jump to review scenes without exposing arbitrary QA commands.
 * The older `qa` parameter remains available only on localhost for automated
 * gameplay tests.
 */
export function requestedGameCheckpoint(search: string, hostname: string) {
  const parameters = new URLSearchParams(search);
  const requestedDebugScene = parameters.get("debug");
  if (requestedDebugScene && requestedDebugScene in DEBUG_SCENE_CHECKPOINTS) {
    return DEBUG_SCENE_CHECKPOINTS[requestedDebugScene as DebugSceneName];
  }
  return localHostname(hostname) ? parameters.get("qa") : null;
}

export function debugSceneName(search: string) {
  const requested = new URLSearchParams(search).get("debug");
  return requested && requested in DEBUG_SCENE_CHECKPOINTS ? requested as DebugSceneName : null;
}

export function isDirectDebugSession(search: string, hostname: string) {
  return requestedGameCheckpoint(search, hostname) !== null;
}

export function checkpointUsesSubway(checkpoint: string | null) {
  return checkpoint !== null && SUBWAY_CHECKPOINTS.has(checkpoint);
}
