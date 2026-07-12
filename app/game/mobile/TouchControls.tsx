"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type TouchControlsProps = {
  arboreal: boolean;
  driving: boolean;
  prompt: string;
};

const emitKey = (code: string, down: boolean) =>
  document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));

export function TouchControls({ arboreal, driving, prompt }: TouchControlsProps) {
  const [expanded, setExpanded] = useState(true);
  const held = useRef(new Set<string>());
  const lookPoint = useRef<{ x: number; y: number } | null>(null);

  const setHeld = (code: string, down: boolean) => {
    const active = held.current.has(code);
    if (down === active) return;
    if (down) held.current.add(code); else held.current.delete(code);
    emitKey(code, down);
  };
  const releaseHeld = () => {
    for (const code of [...held.current]) setHeld(code, false);
  };
  const moveStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    setHeld("KeyA", x < -.22); setHeld("KeyD", x > .22);
    setHeld("KeyW", y < -.18); setHeld("KeyS", y > .25);
    event.currentTarget.style.setProperty("--stick-x", `${Math.max(-1, Math.min(1, x)) * 28}px`);
    event.currentTarget.style.setProperty("--stick-y", `${Math.max(-1, Math.min(1, y)) * 28}px`);
  };
  const stopStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD"]) setHeld(code, false);
    event.currentTarget.style.setProperty("--stick-x", "0px"); event.currentTarget.style.setProperty("--stick-y", "0px");
  };
  const moveLook = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!lookPoint.current) { lookPoint.current = { x: event.clientX, y: event.clientY }; return; }
    const dx = event.clientX - lookPoint.current.x, dy = event.clientY - lookPoint.current.y;
    lookPoint.current = { x: event.clientX, y: event.clientY };
    document.dispatchEvent(new CustomEvent("sloth-look", { detail: { dx, dy } }));
  };
  const actionLabel = driving ? "Exit" : prompt.includes("DRIVE") ? "Drive" : prompt.includes("FORAGE") ? "Forage" : prompt.includes("CLIMB") ? "Climb" : prompt.includes("REACH") || prompt.includes("BRANCH") || prompt.includes("GUIDE") ? "Grab" : "Use";

  useEffect(() => () => {
    for (const code of held.current) emitKey(code, false);
    held.current.clear();
  }, []);

  return <div className={`touch-ui ${expanded ? "expanded" : "collapsed"}`}>
    <button className="touch-toggle" aria-label={`${expanded ? "Hide" : "Show"} touch controls`} aria-expanded={expanded} onClick={() => { if (expanded) releaseHeld(); setExpanded(value => !value); }}>
      {expanded ? "Hide controls" : "Touch controls"}
    </button>
    {expanded && <>
      <div className="touch-stick" aria-label="Movement joystick" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); moveStick(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveStick(event); }} onPointerUp={stopStick} onPointerCancel={stopStick}><span /></div>
      <div className="touch-look" aria-label="Look area" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); lookPoint.current = { x: event.clientX, y: event.clientY }; }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveLook(event); }} onPointerUp={() => { lookPoint.current = null; }} onPointerCancel={() => { lookPoint.current = null; }}><span>Drag to look</span></div>
      <button className="touch-action" aria-label="Context action" onClick={() => { emitKey("KeyE", true); emitKey("KeyE", false); }}>{actionLabel}</button>
      <button className="touch-grip" aria-label={driving ? "Hold cart brake" : "Hold grip"} onPointerDown={() => setHeld("ShiftLeft", true)} onPointerUp={() => setHeld("ShiftLeft", false)} onPointerCancel={() => setHeld("ShiftLeft", false)}>{driving ? "Brake" : "Grip"}</button>
      {arboreal && <button className="touch-down" aria-label="Descend from canopy" onClick={() => { emitKey("ControlLeft", true); emitKey("ControlLeft", false); }}>Down</button>}
      <button className="touch-sense" aria-label="Toggle scent vision" onClick={() => { emitKey("KeyC", true); emitKey("KeyC", false); }}>Sense</button>
    </>}
  </div>;
}
