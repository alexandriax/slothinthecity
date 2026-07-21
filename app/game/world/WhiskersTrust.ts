export type WhiskersTrustState =
  | "APPROACH"
  | "CONNECTING"
  | "FACE_WHISKERS"
  | "GIVE_SPACE"
  | "READY"
  | "SETTLE";

export type WhiskersTrustSample = {
  alignment: number;
  distance: number;
  playerSpeed: number;
};

export type WhiskersTrustResult = {
  engaged: boolean;
  progress: number;
  state: WhiskersTrustState;
};

export const WHISKERS_TRUST_SECONDS = 1.35;
export const WHISKERS_TRUST_MIN_DISTANCE = 1.3;
export const WHISKERS_TRUST_MAX_DISTANCE = 5.2;
export const WHISKERS_TRUST_MIN_ALIGNMENT = .93;
export const WHISKERS_TRUST_MAX_SPEED = .3;

/**
 * A quiet spatial interaction rather than a repeated button prompt. Trust
 * grows only while the player gives Whiskers room, settles, and keeps her in
 * view. Missing one condition gently releases progress instead of resetting
 * the whole gallery moment.
 */
export function advanceWhiskersTrust(
  previousProgress: number,
  delta: number,
  sample: WhiskersTrustSample,
): WhiskersTrustResult {
  const safeProgress = Number.isFinite(previousProgress)
    ? Math.min(1, Math.max(0, previousProgress))
    : 0;
  const safeDelta = Number.isFinite(delta) ? Math.min(.1, Math.max(0, delta)) : 0;
  const distance = Number.isFinite(sample.distance) ? sample.distance : Infinity;
  const alignment = Number.isFinite(sample.alignment) ? sample.alignment : -1;
  const playerSpeed = Number.isFinite(sample.playerSpeed) ? Math.max(0, sample.playerSpeed) : Infinity;

  let state: WhiskersTrustState;
  if (distance < WHISKERS_TRUST_MIN_DISTANCE) state = "GIVE_SPACE";
  else if (distance > WHISKERS_TRUST_MAX_DISTANCE) state = "APPROACH";
  else if (alignment < WHISKERS_TRUST_MIN_ALIGNMENT) state = "FACE_WHISKERS";
  else if (playerSpeed > WHISKERS_TRUST_MAX_SPEED) state = "SETTLE";
  else state = "CONNECTING";

  const engaged = state === "CONNECTING";
  const progress = Math.min(1, Math.max(0, safeProgress + safeDelta * (engaged ? 1 / WHISKERS_TRUST_SECONDS : -.42)));
  return {
    engaged,
    progress,
    state: progress >= 1 ? "READY" : state,
  };
}

export function whiskersTrustInstruction(state: WhiskersTrustState) {
  switch (state) {
    case "APPROACH": return "COME A LITTLE CLOSER";
    case "GIVE_SPACE": return "GIVE WHISKERS A LITTLE SPACE";
    case "FACE_WHISKERS": return "KEEP WHISKERS IN VIEW";
    case "SETTLE": return "HOLD STILL AND LET WHISKERS CHOOSE";
    case "CONNECTING": return "HOLD THE QUIET MOMENT";
    case "READY": return "WHISKERS TRUSTS YOU";
  }
}
