"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type TouchControlsProps = {
  arboreal: boolean;
  prompt: string;
  showSense?: boolean;
  vehicle: "cart" | "rowboat" | null;
};

const emitKey = (code: string, down: boolean) =>
  document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));

export function TouchControls({ arboreal, prompt, showSense = true, vehicle }: TouchControlsProps) {
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
  const actionLabel = vehicle ? "Exit" : prompt.includes("EXIT TRAIN") ? "Exit" : prompt.includes("DRIVE") ? "Drive" : prompt.includes("FORAGE") ? "Forage" : prompt.includes("CLIMB TRUNK") ? "Climb" : prompt.includes("STEP ONTO") || prompt.includes("TAKE THIS") || prompt.includes("REACH ACROSS") ? "Grab" : prompt.includes("ROWBOAT") || prompt.includes("BOARD") ? "Board" : prompt.includes("ATTENDANT") ? "Talk" : prompt.includes("SUBWAY") || prompt.includes("EXIT") ? "Enter" : "";

  useEffect(() => {
    const release = () => { for (const code of [...held.current]) emitKey(code, false); held.current.clear(); };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener("blur", release); window.addEventListener("pagehide", release); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", release); window.removeEventListener("pagehide", release); document.removeEventListener("visibilitychange", visibility); release(); };
  }, []);

  useEffect(() => {
    // A mode change can unmount Grip / Brake before iOS delivers pointerup.
    // Release Shift at the state boundary so it can never remain latched.
    if (held.current.delete("ShiftLeft")) emitKey("ShiftLeft", false);
  }, [arboreal, vehicle]);

  return <div className={`touch-ui ${expanded ? "expanded" : "collapsed"}`}>
    <button className="touch-toggle" aria-label={`${expanded ? "Hide" : "Show"} touch controls`} aria-expanded={expanded} onClick={() => { if (expanded) releaseHeld(); setExpanded(value => !value); }}>
      {expanded ? "− UI" : "+ UI"}
    </button>
    {expanded && <>
      <div className="touch-stick" aria-label="Movement joystick" onPointerDown={(event) => { try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {} moveStick(event); }} onPointerMove={(event) => { if (typeof event.currentTarget.hasPointerCapture !== "function" || event.currentTarget.hasPointerCapture(event.pointerId)) moveStick(event); }} onPointerUp={stopStick} onPointerCancel={stopStick} onLostPointerCapture={stopStick}><span /></div>
      <div className="touch-look" aria-label="Look area" onPointerDown={(event) => { try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {} lookPoint.current = { x: event.clientX, y: event.clientY }; }} onPointerMove={(event) => { if (typeof event.currentTarget.hasPointerCapture !== "function" || event.currentTarget.hasPointerCapture(event.pointerId)) moveLook(event); }} onPointerUp={() => { lookPoint.current = null; }} onPointerCancel={() => { lookPoint.current = null; }} onLostPointerCapture={() => { lookPoint.current = null; }}/>
      {actionLabel && <button className="touch-action" aria-label={vehicle ? `Exit ${vehicle === "cart" ? "field-services cart" : "rowboat"}` : prompt} onClick={() => { emitKey("KeyE", true); emitKey("KeyE", false); }}>{actionLabel}</button>}
      {(vehicle === "cart" || arboreal) && <button className="touch-grip" aria-label={vehicle === "cart" ? "Hold cart brake" : "Hold grip"} onPointerDown={(event) => { try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {} setHeld("ShiftLeft", true); }} onPointerUp={() => setHeld("ShiftLeft", false)} onPointerCancel={() => setHeld("ShiftLeft", false)} onLostPointerCapture={() => setHeld("ShiftLeft", false)}>{vehicle === "cart" ? "Brake" : "Grip"}</button>}
      {arboreal && <button className="touch-down" aria-label="Descend from canopy" onClick={() => { emitKey("ControlLeft", true); emitKey("ControlLeft", false); }}>Down</button>}
      {!vehicle && showSense && <button className="touch-sense" aria-label="Toggle scent vision" onClick={() => { emitKey("KeyC", true); emitKey("KeyC", false); }}>Sense</button>}
    </>}
  </div>;
}
