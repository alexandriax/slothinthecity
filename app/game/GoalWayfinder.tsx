"use client";

import type { CSSProperties } from "react";

type GoalWayfinderProps = {
  active: boolean;
  bearing: number;
  distance: number;
  label: string;
};

export function GoalWayfinder({ active, bearing, distance, label }: GoalWayfinderProps) {
  if (!active) return null;
  const meters = Math.max(0, Math.round(distance));
  const style = { "--goal-bearing": `${bearing.toFixed(1)}deg` } as CSSProperties;
  return <div className="goal-wayfinder" style={style} aria-label={`${label}, ${meters} meters away`}>
    <span className="goal-wayfinder-arrow" aria-hidden="true"><i /></span>
    <span className="goal-wayfinder-copy"><b>{label}</b><small>{meters} m</small></span>
  </div>;
}
