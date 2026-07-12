"use client";

type MobileHudProps = {
  alert: number;
  buds: number;
  driving: boolean;
  energy: number;
  hawkPhase: "PATROL" | "WATCHING" | "DIVING" | "SNATCHED" | "RECOVERING";
  motion: string;
  showMotion: boolean;
  speed: number;
  swimming: boolean;
};

function threatLabel({ alert, driving, hawkPhase, swimming }: Pick<MobileHudProps, "alert" | "driving" | "hawkPhase" | "swimming">) {
  if (hawkPhase === "SNATCHED") return "SNATCH";
  if (hawkPhase === "DIVING") return "DIVE";
  if (hawkPhase === "RECOVERING") return "SAFE";
  if (driving) return "COVER";
  if (swimming) return "WATER";
  if (hawkPhase === "WATCHING" || alert >= 68) return "WATCH";
  return "HAWK";
}

function motionLabel({ motion, speed }: Pick<MobileHudProps, "motion" | "speed">) {
  if (motion === "ON GROUND") return "";
  if (motion === "DRIVING") return `DRIVING · ${Math.round(Math.abs(speed) * 3.6)} KM/H`;
  if (motion === "ON BRANCH") return "CANOPY ROUTE";
  if (motion === "HAWK DIVE") return "HAWK DIVE · FIND COVER";
  if (motion === "PATH BLOCKED") return "PATH BLOCKED";
  return motion;
}

export function MobileHud(props: MobileHudProps) {
  const warning = props.hawkPhase === "DIVING" || props.hawkPhase === "SNATCHED" || props.alert >= 85;
  const state = motionLabel(props);
  return <div className="mobile-hud" aria-label="Game status">
    <div className="mobile-telemetry">
      <div className="mobile-objective"><span>{props.buds >= 5 ? "GATE" : "FORAGE"}</span><strong>{props.buds >= 5 ? "SOUTH" : `${props.buds}/5`}</strong></div>
      <div className="mobile-energy">
        <span>ENERGY <b>{Math.round(props.energy)}</b></span>
        <div className="mobile-bar" role="progressbar" aria-label="Energy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.energy)}><i style={{ width: `${props.energy}%` }}/></div>
      </div>
      <div className={`mobile-threat ${warning ? "warning" : ""}`}><span>{threatLabel(props)}</span><strong>{Math.round(props.alert)}</strong></div>
    </div>
    {props.showMotion && state && <div className={`mobile-motion ${warning || props.motion === "PATH BLOCKED" ? "warning" : ""}`}>{state}</div>}
  </div>;
}
