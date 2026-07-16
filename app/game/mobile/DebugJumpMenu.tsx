"use client";

import { useState } from "react";
import { type DebugSceneName } from "../debugCheckpoints";

const DEBUG_DESTINATIONS: Array<{ scene: DebugSceneName; label: string; detail: string }> = [
  { scene: "park", label: "Ramble start", detail: "Foraging trail" },
  { scene: "mobile", label: "Mobile start", detail: "Touch-control review" },
  { scene: "canopy", label: "Canopy", detail: "Branch traversal" },
  { scene: "bridge", label: "Bow Bridge", detail: "Lake checkpoint" },
  { scene: "boat", label: "Rowboat", detail: "On The Lake" },
  { scene: "island", label: "Ticket island", detail: "Zoo-ticket quest" },
  { scene: "zoo", label: "Central Park Zoo", detail: "Attendant encounter" },
  { scene: "subway", label: "Subway entrance", detail: "Street stairwell" },
  { scene: "station", label: "5 Av station", detail: "Fare gate and platform" },
  { scene: "train", label: "N / R train", detail: "First train ride" },
  { scene: "transfer-concourse", label: "59 St concourse", detail: "Choose a transfer" },
  { scene: "transfer", label: "Uptown transfer", detail: "5 train platform" },
  { scene: "train-5", label: "5 train", detail: "Bronx-bound ride" },
  { scene: "bronx", label: "Bronx Zoo", detail: "Final approach" },
];

export function DebugJumpMenu({ activeScene }: { activeScene: DebugSceneName | null }) {
  const [open, setOpen] = useState(true);

  return <aside className={`debug-jump-menu ${open ? "open" : "collapsed"}`} aria-label="QA scene jump menu">
    <button className="debug-jump-toggle" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span>QA</span>{open ? "Close" : "Jump"}
    </button>
    {open && <div className="debug-jump-panel">
      <div className="debug-jump-heading"><span>Private QA</span><strong>Jump to playable scene</strong></div>
      <div className="debug-jump-grid">
        {DEBUG_DESTINATIONS.map(destination => <a
          className={destination.scene === activeScene ? "active" : undefined}
          href={`?debug=${encodeURIComponent(destination.scene)}&debugMenu=1`}
          key={destination.scene}
        >
          <strong>{destination.label}</strong><small>{destination.detail}</small>
        </a>)}
        <a href="/debug/characters"><strong>Character lab</strong><small>Meshes and animation</small></a>
      </div>
    </div>}
  </aside>;
}
