"use client";

import type { CSSProperties } from "react";

type GoalWayfinderProps = {
  active: boolean;
  bearing: number;
  distance: number;
};

export function GoalWayfinder({ active, bearing, distance }: GoalWayfinderProps) {
  if (!active) return null;
  const meters = Math.max(0, Math.round(distance));
  const style = { "--goal-bearing": `${bearing.toFixed(1)}deg` } as CSSProperties;
  return <div className="goal-wayfinder" style={style} aria-label={`Sanctuary gate, ${meters} meters away`}>
    <span className="goal-wayfinder-arrow" aria-hidden="true"><i /></span>
    <span className="goal-wayfinder-copy"><b>Sanctuary gate</b><small>{meters} m</small></span>
  </div>;
}
