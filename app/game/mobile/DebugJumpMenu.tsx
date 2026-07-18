"use client";

import { useState } from "react";
import { DEBUG_LOOK_REQUEST_EVENT, type DebugSceneName } from "../debugCheckpoints";

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
  { scene: "bronx", label: "Bronx Zoo", detail: "Ticket forecourt" },
  { scene: "bronx-polar", label: "Gary", detail: "Polar bear habitat" },
  { scene: "bronx-birds", label: "World of Birds", detail: "Sun conure aviary" },
  { scene: "bronx-monkeys", label: "Monkey habitat", detail: "Ropes and canopy" },
  { scene: "bronx-sloths", label: "Sloth habitat", detail: "Rescue enclosure" },
  { scene: "rescue", label: "Rescued friends", detail: "Follower-party review" },
  { scene: "bus-stop", label: "Shuttle stop", detail: "Doorway and group boarding" },
  { scene: "bus-bronx", label: "Bronx streets", detail: "Zoo gate to highway ramp" },
  { scene: "bus", label: "Museum shuttle", detail: "West Side Highway drive" },
  { scene: "bus-exit", label: "AMNH exit", detail: "W 79 St highway turn" },
  { scene: "bus-city", label: "Upper West Side", detail: "Crosstown to Central Park West" },
  { scene: "bus-reroute", label: "Bus reroute", detail: "Wrong turn · recover through the street grid" },
  { scene: "bus-arrival", label: "Bus arrival", detail: "Central Park West parking" },
  { scene: "museum", label: "AMNH exterior", detail: "Central Park West entrance" },
  { scene: "museum-rotunda", label: "Museum rotunda", detail: "Dinosaurs and galleries" },
  { scene: "museum-megatherium", label: "Fossil mammals", detail: "Megatherium approach" },
  { scene: "finale", label: "Finale", detail: "Giant ground sloth reunion" },
];

export function DebugJumpMenu({ activeScene }: { activeScene: DebugSceneName | null }) {
  const [open, setOpen] = useState(true);
  const toggleMenu = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen) document.dispatchEvent(new Event(DEBUG_LOOK_REQUEST_EVENT));
  };

  return <aside className={`debug-jump-menu ${open ? "open" : "collapsed"}`} aria-label="QA scene jump menu">
    <button className="debug-jump-toggle" type="button" onClick={toggleMenu} aria-expanded={open} aria-label={open ? "Close QA menu and resume mouse look" : "Open QA scene jump menu"}>
      <span>QA</span>{open ? "Resume look" : "Jump"}
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
        <a href="/debug/animals"><strong>Animal lab</strong><small>Anatomy, mesh and motion</small></a>
      </div>
    </div>}
  </aside>;
}
