export const DEBUG_SCENE_CHECKPOINTS = {
  park: "park",
  mobile: "park",
  canopy: "autobranch",
  bridge: "bowbridge",
  boat: "rowboat",
  island: "ticketisland",
  duck: "lakeduck",
  "duck-rescue": "lakeduck",
  "duck-rowboat": "lakeduck",
  "duck-passenger": "duckpassenger",
  "duck-following": "duckfollowing",
  squirrel: "squirrelquest",
  "squirrel-quest": "squirrelquest",
  "squirrel-acorn": "squirrelacorn",
  "squirrel-following": "squirrelfollowing",
  zap: "squirrelquest",
  subway: "subway",
  station: "subwayplatform",
  train: "trainride",
  transfer: "lexingtontransfer",
  "transfer-concourse": "lexingtonconcourse",
  "train-5": "trainride5",
  bronx: "bronxentry",
  "bronx-entry": "bronxentry",
  "bronx-city-north": "bronxcitynorth",
  "bronx-city-east": "bronxcityeast",
  "bronx-city-west": "bronxcitywest",
  "bronx-polar": "bronxpolar",
  "bronx-gary-fed": "bronxgaryfed",
  "bronx-birds": "bronxbirds",
  "bronx-monkeys": "bronxmonkeys",
  "quest-birds": "bronxquestbirds",
  "quest-sealion": "bronxquestsealion",
  "quest-monkey": "bronxquestmonkey",
  "quest-zebra": "bronxquestzebra",
  "quest-red-panda": "bronxquestredpanda",
  "quest-tortoise": "bronxquesttortoise",
  "quest-flamingo": "bronxquestflamingo",
  "quest-bison": "bronxquestbison",
  "bronx-sloths": "bronxsloths",
  rescue: "rescuefollowers",
  "bus-stop": "busboarding",
  "bus-bronx": "busbronx",
  bus: "busdrive",
  "bus-exit": "busexit",
  "bus-highway-continuation": "busmissedexit",
  "bus-city": "buscity",
  "bus-reroute": "busreroute",
  "bus-collision": "buscollision",
  "bus-rear-impact": "busrearimpact",
  "bus-building": "busbuilding",
  "bus-failure": "busfailure",
  "bus-arrival": "busarrival",
  museum: "museumentry",
  "museum-whiskers": "museumwhiskers",
  "museum-scooters": "museumscooters",
  "museum-gary-scooter": "museumgaryscooter",
  "museum-rotunda": "museumrotunda",
  "museum-collections": "museumcollections",
  "museum-african": "museumafrican",
  "museum-megatherium": "museummegatherium",
  "return-westfarms": "returnwestfarms",
  "return-train-5": "returntrain5",
  "return-lexington": "returnlexington",
  "return-train-nr": "returntrainnr",
  homecoming: "homecoming",
  finale: "museumfinale",
} as const;

export type DebugSceneName = keyof typeof DEBUG_SCENE_CHECKPOINTS;

export const DEBUG_LOOK_REQUEST_EVENT = "sloth-debug-look-requested";

const SUBWAY_CHECKPOINTS = new Set([
  "subway",
  "subwayplatform",
  "trainride",
  "trainride5",
  "lexington",
  "lexingtontransfer",
  "lexingtonconcourse",
  "westfarms",
  "bronxentry",
  "bronxcitynorth",
  "bronxcityeast",
  "bronxcitywest",
  "bronxpolar",
  "bronxgaryfed",
  "bronxbirds",
  "bronxmonkeys",
  "bronxquestbirds",
  "bronxquestsealion",
  "bronxquestmonkey",
  "bronxquestzebra",
  "bronxquestredpanda",
  "bronxquesttortoise",
  "bronxquestflamingo",
  "bronxquestbison",
  "bronxsloths",
  "rescuefollowers",
  "busboarding",
  "busbronx",
  "busdrive",
  "busexit",
  "busmissedexit",
  "buscity",
  "busreroute",
  "buscollision",
  "busrearimpact",
  "busbuilding",
  "busfailure",
  "busarrival",
  "museumentry",
  "museumwhiskers",
  "museumscooters",
  "museumgaryscooter",
  "museumrotunda",
  "museumcollections",
  "museumafrican",
  "museummegatherium",
  "museumfinale",
  "returnwestfarms",
  "returntrain5",
  "returnlexington",
  "returntrainnr",
  "homecoming",
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

/**
 * The QA jump palette is deliberately opt-in.  A secondary flag is retained
 * after choosing a destination so reviewers can move between scenes without
 * replaying the campaign, while normal players never see the controls.
 */
export function debugMenuRequested(search: string) {
  const parameters = new URLSearchParams(search);
  const debug = parameters.get("debug")?.toLowerCase();
  const persistent = parameters.get("debugMenu")?.toLowerCase();
  return debug === "1" || debug === "true" || persistent === "1" || persistent === "true";
}

export function isAutomatedQaSession(search: string, hostname: string) {
  return localHostname(hostname) && new URLSearchParams(search).has("qa");
}

export function checkpointUsesSubway(checkpoint: string | null) {
  return checkpoint !== null && SUBWAY_CHECKPOINTS.has(checkpoint);
}
