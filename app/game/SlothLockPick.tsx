"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const LOCK_TENSION_MIN = 40;
export const LOCK_TENSION_MAX = 60;
export const LOCK_PIN_COUNT = 6;

type PinState = "searching" | "set" | "jammed";

type SlothLockPickProps = {
  onCancel: () => void;
  onComplete: () => void;
};

export function createBindingOrder(random = Math.random) {
  const order = Array.from({ length: LOCK_PIN_COUNT }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

export function SlothLockPick({ onCancel, onComplete }: SlothLockPickProps) {
  // One randomized order is created when the overlay mounts and remains fixed
  // through slack resets and jams for the entire pick session.
  const [bindingOrder] = useState(() => createBindingOrder());
  const tensionRef = useRef(0);
  const displayedTensionPercent = useRef(0);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const pinStatesRef = useRef<PinState[]>(Array.from({ length: LOCK_PIN_COUNT }, () => "searching"));
  const jammedUntil = useRef<number[]>(Array.from({ length: LOCK_PIN_COUNT }, () => 0));
  const completed = useRef(false);
  const completionTimer = useRef<number | null>(null);
  const [tension, setTension] = useState(0);
  const [pinStates, setPinStates] = useState<PinState[]>(() => Array.from({ length: LOCK_PIN_COUNT }, () => "searching"));
  const [status, setStatus] = useState("Tap tension into the green band, then test pins. A bright green pin is safely set.");
  const [falls, setFalls] = useState(0);
  const [unlocked, setUnlocked] = useState(false);

  const publishPins = useCallback((next: PinState[]) => {
    pinStatesRef.current = next;
    setPinStates(next);
  }, []);

  const dropSetPins = useCallback((message: string) => {
    const pins = pinStatesRef.current;
    if (!pins.includes("set")) return false;
    publishPins(pins.map(state => state === "set" ? "searching" : state));
    setFalls(count => count + 1);
    setStatus(message);
    return true;
  }, [publishPins]);

  const applyTension = useCallback(() => {
    if (completed.current) return;
    const next = Math.min(100, tensionRef.current + 9);
    tensionRef.current = next;
    gaugeRef.current?.style.setProperty("--lock-tension", `${next}%`);
    displayedTensionPercent.current = Math.round(next);
    setTension(next);
    if (next > LOCK_TENSION_MAX) setStatus("Too much torque — the plug is locked up. Let the tension fall before testing another pin.");
    else if (next >= LOCK_TENSION_MIN) setStatus("Tension is in the binding range. Test the pins while keeping it here.");
    else setStatus("Keep tapping tension. The plug needs at least 40% before a pin can bind.");
  }, []);

  const testPin = useCallback((pin: number) => {
    if (completed.current || pinStatesRef.current[pin] === "set") return;
    const tensionNow = tensionRef.current;
    if (tensionNow < LOCK_TENSION_MIN) {
      const dropped = dropSetPins("The plug went slack — every set pin fell. Build tension back into the green band.");
      if (!dropped) setStatus("Too little tension. Bring the gauge to 40–60% before lifting a pin.");
      return;
    }
    if (tensionNow > LOCK_TENSION_MAX) {
      const next = [...pinStatesRef.current];
      next[pin] = "jammed";
      jammedUntil.current[pin] = performance.now() + 1100;
      publishPins(next);
      setStatus(`Pin ${pin + 1} jammed under excess torque. Ease below 60% and let it spring free.`);
      return;
    }
    if (pinStatesRef.current[pin] === "jammed") {
      setStatus(`Pin ${pin + 1} is still jammed. Keep steady tension and give it a moment.`);
      return;
    }

    const setCount = pinStatesRef.current.filter(state => state === "set").length;
    if (bindingOrder[setCount] !== pin) {
      setStatus(`Pin ${pin + 1} slides freely — another pin is binding first.`);
      return;
    }

    const next = [...pinStatesRef.current];
    next[pin] = "set";
    publishPins(next);
    if (setCount + 1 === LOCK_PIN_COUNT) {
      completed.current = true;
      setUnlocked(true);
      setStatus("All six pins are at the shear line — the plug turns!");
      completionTimer.current = window.setTimeout(onComplete, 900);
    } else {
      setStatus(`Pin ${pin + 1} is green and set at the shear line. Rescan all six pins; ${LOCK_PIN_COUNT - setCount - 1} remain.`);
    }
  }, [bindingOrder, dropSetPins, onComplete, publishPins]);

  useEffect(() => {
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 1000, .05);
      previous = now;
      if (!completed.current) {
        const prior = tensionRef.current;
        const next = Math.max(0, prior - delta * 12.5);
        tensionRef.current = next;
        gaugeRef.current?.style.setProperty("--lock-tension", `${next}%`);
        const rounded = Math.round(next);
        if (rounded !== displayedTensionPercent.current) {
          displayedTensionPercent.current = rounded;
          setTension(next);
        }
        if (prior >= LOCK_TENSION_MIN && next < LOCK_TENSION_MIN) dropSetPins("Tension slipped below 40% — the set pins dropped. Start the binding order again.");

        let changed = false;
        const pins = pinStatesRef.current.map((state, index) => {
          if (state === "jammed" && now >= jammedUntil.current[index]) { changed = true; return "searching"; }
          return state;
        });
        if (changed) publishPins(pins);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    };
  }, [dropSetPins, publishPins]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Space") { event.preventDefault(); applyTension(); return; }
      if (event.code === "Escape") { event.preventDefault(); onCancel(); return; }
      const match = /^(?:Digit|Numpad)([1-6])$/.exec(event.code) ?? /^([1-6])$/.exec(event.key);
      if (match) { event.preventDefault(); testPin(Number(match[1]) - 1); }
    };
    window.addEventListener("keydown", keyDown, true);
    return () => window.removeEventListener("keydown", keyDown, true);
  }, [applyTension, onCancel, testPin]);

  const inRange = tension >= LOCK_TENSION_MIN && tension <= LOCK_TENSION_MAX;
  const overTension = tension > LOCK_TENSION_MAX;
  const setCount = pinStates.filter(state => state === "set").length;

  return <section className={`lockpick-screen ${unlocked ? "unlocked" : ""}`} role="dialog" aria-modal="true" aria-labelledby="lockpick-title" data-lock-picking="true" data-tension-zone={overTension ? "locked" : inRange ? "binding" : "slack"}>
    <div className="lockpick-noise"/>
    <header className="lockpick-header">
      <div><span>Bronx Zoo · Sloth conservation habitat</span><h2 id="lockpick-title">Pick the keeper lock with your claws</h2></div>
      <button type="button" onClick={onCancel} disabled={unlocked}>Back away <kbd>Esc</kbd></button>
    </header>

    <div className="lockpick-workbench">
      <aside className="lockpick-tension-panel">
        <div className="lockpick-section-label"><span>Plug tension</span><strong>{Math.round(tension)}%</strong></div>
        <div ref={gaugeRef} className="lockpick-gauge" aria-label={`Plug tension ${Math.round(tension)} percent`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(tension)}>
          <i className="lockpick-safe-band"/><i className="lockpick-threshold low">40</i><i className="lockpick-threshold high">60</i>
          <div className="lockpick-gauge-fill"/>
          <span className="lockpick-gauge-needle"/>
        </div>
        <button className="lockpick-tension-button" type="button" onClick={applyTension} disabled={unlocked}>
          <span className="lockpick-claw tension-claw" aria-hidden="true"><i/><i/><i/></span>
          <strong>Tap tension</strong><small>Space · +9%</small>
        </button>
        <p>Below 40%, set pins fall. Above 60%, the plug locks and tested pins jam. Bright green means the pin gap is set at the shear line.</p>
      </aside>

      <div className="lockpick-lock" aria-label="Six-pin keeper padlock">
        <div className="lockpick-shackle"/>
        <div className={`lockpick-cylinder ${overTension ? "seized" : ""}`}>
          <div className="lockpick-shear-line"><span>Shear line</span></div>
          <div className="lockpick-pin-row">
            {pinStates.map((state, index) => <button className={`lockpick-pin ${state}`} type="button" key={index} onClick={() => testPin(index)} disabled={unlocked} aria-label={`Test pin ${index + 1}, ${state}`} aria-pressed={state === "set"} data-pin-state={state}>
              <span className="lockpick-driver"/><span className="lockpick-spring"/><span className="lockpick-pin-gap"/><span className="lockpick-key-pin"/>
              <span className="lockpick-pin-number">{index + 1}</span>
              <span className="lockpick-pin-state">{state === "set" ? "SET" : state === "jammed" ? "JAM" : "TEST"}</span>
              <span className="lockpick-claw pin-claw" aria-hidden="true"><i/><i/><i/></span>
            </button>)}
          </div>
          <div className="lockpick-plug"><span/></div>
        </div>
      </div>

      <aside className="lockpick-readout">
        <div className="lockpick-section-label"><span>Set pins</span><strong>{setCount} / {LOCK_PIN_COUNT}</strong></div>
        <ol>{pinStates.map((state, index) => <li className={state} key={index}><span>0{index + 1}</span><i/><strong>{state === "set" ? "SET" : state === "jammed" ? "JAMMED" : "TEST"}</strong></li>)}</ol>
        <div className="lockpick-instructions"><p><kbd>Space</kbd> Tap tension</p><p><kbd>Keyboard 1–6</kbd> Test pins</p></div>
        <small>Random order is fixed for this attempt · rescan after every green pin{falls ? ` · ${falls} reset${falls === 1 ? "" : "s"}` : ""}</small>
      </aside>
    </div>

    <footer className={`lockpick-status ${overTension ? "warning" : inRange ? "ready" : ""}`} role="status" aria-live="polite"><span/><p>{status}</p></footer>
  </section>;
}
