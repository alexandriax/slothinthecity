"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./ZooSideQuestScreen.module.css";
import {
  ZOO_SIDE_QUESTS,
  advanceSeaLionCurrent,
  canopyAnchorReady,
  clamp,
  createZooSideQuestConfig,
  operateWetlandValve,
  prairieLanding,
  prairieShotHits,
  scentTrailReach,
  stripeBandAligned,
  sunTrailReach,
  wetlandReadingSafe,
  type AviaryVoicesConfig,
  type BisonPrairieConfig,
  type CurrentDirection,
  type FlamingoWetlandConfig,
  type MonkeyCanopyConfig,
  type RedPandaScentConfig,
  type SeaLionCurrentConfig,
  type SeaLionCurrentState,
  type TortoiseSunConfig,
  type WetlandReading,
  type WetlandValve,
  type ZebraStripeConfig,
  type ZooSideQuestConfig,
  type ZooSideQuestId,
} from "./zooSideQuestLogic";

export { ZOO_SIDE_QUEST_IDS, ZOO_SIDE_QUESTS } from "./zooSideQuestLogic";
export type {
  ZooRecruitSpeciesId,
  ZooSideQuestId,
  ZooSideQuestMetadata,
} from "./zooSideQuestLogic";

export type ZooSideQuestScreenProps = {
  questId: ZooSideQuestId;
  onComplete: (questId: ZooSideQuestId) => void;
  onCancel: () => void;
};

type MechanicProps<T extends ZooSideQuestConfig> = {
  config: T;
  onSolved: () => void;
};

const BIRD_NAMES = [
  "Sun conure",
  "Blue-and-gold macaw",
  "Scarlet ibis",
  "Green aracari",
] as const;
const BIRD_GLYPHS = ["◉", "◆", "◇", "◌"] as const;
const STRIPE_BAND_NAMES = ["Thorax", "Flank", "Haunch"] as const;

function cssVars(values: Record<`--${string}`, string | number>) {
  return values as CSSProperties;
}

function useQuestKeyboard(handler: (event: KeyboardEvent) => void) {
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => handler(event);
    window.addEventListener("keydown", keyDown, true);
    return () => window.removeEventListener("keydown", keyDown, true);
  }, [handler]);
}

function ProgressDots({
  count,
  current,
  label,
}: {
  count: number;
  current: number;
  label: string;
}) {
  return (
    <div
      className={styles.progressDots}
      aria-label={`${label}: ${current} of ${count}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <i
          className={
            index < current
              ? styles.done
              : index === current
                ? styles.current
                : undefined
          }
          key={index}
        />
      ))}
    </div>
  );
}

function QuestStatus({
  children,
  tone = "normal",
}: {
  children: ReactNode;
  tone?: "normal" | "ready" | "warning";
}) {
  return (
    <div
      className={`${styles.questStatus} ${styles[tone]}`}
      role="status"
      aria-live="polite"
    >
      <i />
      <p>{children}</p>
    </div>
  );
}

function FourVoices({ config, onSolved }: MechanicProps<AviaryVoicesConfig>) {
  const [round, setRound] = useState(0);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [cue, setCue] = useState(-1);
  const [accepting, setAccepting] = useState(false);
  const [replay, setReplay] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState("Listen for the first phrase.");
  const phraseLength = config.roundLengths[round];

  useEffect(() => {
    const timers: number[] = [];
    for (let index = 0; index < phraseLength; index++) {
      timers.push(
        window.setTimeout(
          () => setCue(config.melody[index]),
          380 + index * 560,
        ),
      );
      timers.push(window.setTimeout(() => setCue(-1), 750 + index * 560));
    }
    timers.push(
      window.setTimeout(
        () => {
          setAccepting(true);
          setStatus("Your turn. Repeat the phrase.");
        },
        500 + phraseLength * 560,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [config, phraseLength, replay]);

  const replayPhrase = useCallback(() => {
    setAccepting(false);
    setAnswerIndex(0);
    setCue(-1);
    setStatus(`Listen · ${phraseLength} calls`);
    setReplay((value) => value + 1);
  }, [phraseLength]);

  const answer = useCallback(
    (voice: number) => {
      if (!accepting) return;
      if (config.melody[answerIndex] !== voice) {
        setAccepting(false);
        setMistakes((value) => value + 1);
        setStatus(
          `${BIRD_NAMES[voice]} answered out of turn. The flock will sing the same phrase again.`,
        );
        window.setTimeout(replayPhrase, 620);
        return;
      }
      const nextIndex = answerIndex + 1;
      setAnswerIndex(nextIndex);
      setStatus(
        `${BIRD_NAMES[voice]} matches · ${nextIndex} / ${phraseLength}`,
      );
      if (nextIndex !== phraseLength) return;
      setAccepting(false);
      if (round === config.roundLengths.length - 1) {
        setStatus("The whole aviary answers in harmony.");
        onSolved();
      } else {
        setStatus("Phrase matched. The flock adds another pair of calls.");
        window.setTimeout(() => {
          setAnswerIndex(0);
          setCue(-1);
          setStatus("Listen for the longer phrase.");
          setRound((value) => value + 1);
        }, 720);
      }
    },
    [
      accepting,
      answerIndex,
      config,
      onSolved,
      phraseLength,
      replayPhrase,
      round,
    ],
  );

  useQuestKeyboard((event) => {
    const match = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      answer(Number(match[1]) - 1);
    }
    if (event.code === "KeyR") {
      event.preventDefault();
      replayPhrase();
    }
  });

  return (
    <div className={styles.voicesLayout}>
      <div
        className={styles.aviaryStage}
        aria-label="Four illuminated bird perches"
      >
        <div className={styles.canopyGlow} />
        {BIRD_NAMES.map((name, index) => (
          <button
            aria-label={`Voice ${index + 1}, ${name}`}
            className={`${styles.birdPerch} ${cue === index ? styles.cued : ""} ${accepting ? styles.listening : ""}`}
            disabled={!accepting}
            key={name}
            onClick={() => answer(index)}
            style={cssVars({ "--perch-index": index })}
            type="button"
          >
            <span>{BIRD_GLYPHS[index]}</span>
            <i />
            <strong>{index + 1}</strong>
            <small>{name}</small>
          </button>
        ))}
        <div className={styles.perchBranch} />
      </div>
      <aside className={styles.readoutPanel}>
        <span className={styles.panelLabel}>Chorus phrase</span>
        <strong>Round {round + 1} / 3</strong>
        <ProgressDots
          count={phraseLength}
          current={answerIndex}
          label="Calls repeated"
        />
        <p>The generated melody is fixed until you leave this quest.</p>
        <button
          className={styles.secondaryButton}
          onClick={replayPhrase}
          type="button"
        >
          Replay phrase <kbd>R</kbd>
        </button>
        {mistakes > 0 && (
          <small>
            {mistakes} incorrect {mistakes === 1 ? "call" : "calls"} · no
            progress lost between rounds
          </small>
        )}
      </aside>
      <QuestStatus tone={accepting ? "ready" : "normal"}>{status}</QuestStatus>
    </div>
  );
}

function RideTheCurrent({
  config,
  onSolved,
}: MechanicProps<SeaLionCurrentConfig>) {
  const [state, setState] = useState<SeaLionCurrentState>(() => ({
    position: { ...config.start },
    gateIndex: 0,
    turn: 0,
  }));
  const [status, setStatus] = useState(
    "Gate one is active. Read the first cross-current, then steer.",
  );
  const solvedRef = useRef(false);
  const drift =
    config.currentPattern[state.turn % config.currentPattern.length] ?? 0;

  const steer = useCallback(
    (direction: CurrentDirection) => {
      if (solvedRef.current) return;
      setState((previous) => {
        const next = advanceSeaLionCurrent(previous, config, direction);
        if (next.gateIndex > previous.gateIndex) {
          if (next.gateIndex === config.gates.length) {
            solvedRef.current = true;
            setStatus(
              "All three gates ring out — the sea lion surfaces beside the buoy.",
            );
            window.setTimeout(onSolved, 260);
          } else
            setStatus(
              `Gate ${next.gateIndex} cleared. Gate ${next.gateIndex + 1} is live.`,
            );
        } else
          setStatus(
            `${drift < 0 ? "Left" : drift > 0 ? "Right" : "Slack"} current applied after your stroke.`,
          );
        return next;
      });
    },
    [config, drift, onSolved],
  );

  useQuestKeyboard((event) => {
    const direction =
      event.code === "ArrowLeft" || event.code === "KeyA"
        ? "left"
        : event.code === "ArrowRight" || event.code === "KeyD"
          ? "right"
          : event.code === "ArrowUp" || event.code === "KeyW"
            ? "forward"
            : event.code === "ArrowDown" || event.code === "KeyS"
              ? "reverse"
              : null;
    if (direction) {
      event.preventDefault();
      steer(direction);
    }
  });

  return (
    <div className={styles.currentLayout}>
      <div
        className={styles.poolGrid}
        aria-label={`Enrichment buoy at column ${state.position.x + 1}, row ${state.position.y + 1}`}
      >
        <div className={styles.waterStripes} />
        {config.gates.map((gate, index) => (
          <div
            className={`${styles.currentGate} ${index < state.gateIndex ? styles.cleared : index === state.gateIndex ? styles.activeGate : ""}`}
            key={index}
            style={cssVars({
              "--grid-x": `${(gate.x / 6) * 100}%`,
              "--grid-y": `${(gate.y / 4) * 100}%`,
            })}
          >
            <span>{index + 1}</span>
          </div>
        ))}
        <div
          className={styles.buoy}
          style={cssVars({
            "--grid-x": `${(state.position.x / 6) * 100}%`,
            "--grid-y": `${(state.position.y / 4) * 100}%`,
          })}
        >
          <i />
        </div>
        <div
          className={`${styles.currentArrow} ${drift < 0 ? styles.left : drift > 0 ? styles.right : styles.slack}`}
        >
          <span>{drift < 0 ? "←" : drift > 0 ? "→" : "·"}</span>
          <small>Next current</small>
        </div>
      </div>
      <div className={styles.directionPad} aria-label="Buoy steering controls">
        <button
          onClick={() => steer("forward")}
          type="button"
          aria-label="Steer buoy forward"
        >
          ↑
        </button>
        <button
          onClick={() => steer("left")}
          type="button"
          aria-label="Steer buoy left"
        >
          ←
        </button>
        <button
          onClick={() => steer("reverse")}
          type="button"
          aria-label="Steer buoy backward"
        >
          ↓
        </button>
        <button
          onClick={() => steer("right")}
          type="button"
          aria-label="Steer buoy right"
        >
          →
        </button>
      </div>
      <aside className={styles.readoutPanel}>
        <span className={styles.panelLabel}>Channel telemetry</span>
        <strong>Gate {Math.min(state.gateIndex + 1, 3)} / 3</strong>
        <p>
          Stroke first, cross-current second. The current pattern remains fixed.
        </p>
        <small>Turn {state.turn + 1} · grid 7 × 5</small>
      </aside>
      <QuestStatus tone={state.gateIndex > 0 ? "ready" : "normal"}>
        {status}
      </QuestStatus>
    </div>
  );
}

function CanopyRig({ config, onSolved }: MechanicProps<MonkeyCanopyConfig>) {
  const [tension, setTension] = useState(0);
  const [clock, setClock] = useState(0);
  const [latched, setLatched] = useState([false, false, false]);
  const [status, setStatus] = useState(
    "Build line tension, then watch the first moving knot.",
  );
  const solvedRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock((value) => value + 0.08);
      setTension((value) => Math.max(0, value - 0.72));
    }, 80);
    return () => window.clearInterval(interval);
  }, []);

  const tapTension = useCallback(() => {
    setTension((value) => Math.min(100, value + 10.5));
    setStatus("Torque added. Hold the needle in the green rigging band.");
  }, []);

  const latch = useCallback(
    (anchor: number) => {
      if (latched[anchor] || solvedRef.current) return;
      const phase =
        (clock * config.anchorSpeeds[anchor] + config.anchorOffsets[anchor]) %
        1;
      if (tension < 38 || tension > 68) {
        setStatus(
          tension < 38
            ? "The line is too slack to seat a knot."
            : "Too much torque — ease the line before closing a jaw.",
        );
        return;
      }
      if (!canopyAnchorReady(phase)) {
        setStatus(
          `Anchor ${anchor + 1} missed the jaw. Track the knot back toward the center notch.`,
        );
        return;
      }
      const next = latched.map((value, index) =>
        index === anchor ? true : value,
      );
      setLatched(next);
      setStatus(
        `Anchor ${anchor + 1} secured. ${next.filter(Boolean).length} / 3 load paths stable.`,
      );
      if (next.every(Boolean)) {
        solvedRef.current = true;
        window.setTimeout(onSolved, 360);
      }
    },
    [clock, config, latched, onSolved, tension],
  );

  useQuestKeyboard((event) => {
    if (event.code === "Space") {
      event.preventDefault();
      tapTension();
      return;
    }
    const match = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      latch(Number(match[1]) - 1);
    }
  });

  const safe = tension >= 38 && tension <= 68;
  return (
    <div className={styles.rigLayout}>
      <section className={styles.tensionTower}>
        <span className={styles.panelLabel}>Canopy line tension</span>
        <strong>{Math.round(tension)}%</strong>
        <div
          className={styles.verticalGauge}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(tension)}
        >
          <i />
          <b style={{ height: `${tension}%` }} />
          <span style={{ bottom: `${tension}%` }} />
        </div>
        <button
          className={styles.primaryButton}
          onClick={tapTension}
          type="button"
        >
          Pull with claws <kbd>Space</kbd>
        </button>
      </section>
      <section
        className={styles.anchorBank}
        aria-label="Three canopy rope anchors"
      >
        {latched.map((isLatched, index) => {
          const phase =
            (clock * config.anchorSpeeds[index] + config.anchorOffsets[index]) %
            1;
          const ready = canopyAnchorReady(phase) && safe;
          return (
            <button
              className={`${styles.anchorLine} ${isLatched ? styles.latched : ready ? styles.anchorReady : ""}`}
              disabled={isLatched}
              key={index}
              onClick={() => latch(index)}
              type="button"
            >
              <span className={styles.anchorNumber}>0{index + 1}</span>
              <div>
                <i
                  className={styles.knot}
                  style={{ left: `${phase * 100}%` }}
                />
                <b />
              </div>
              <strong>
                {isLatched ? "LATCHED" : ready ? "CLOSE JAW" : "TRACK KNOT"}
              </strong>
            </button>
          );
        })}
      </section>
      <QuestStatus tone={safe ? "ready" : tension > 68 ? "warning" : "normal"}>
        {status}
      </QuestStatus>
    </div>
  );
}

function StripeScan({ config, onSolved }: MechanicProps<ZebraStripeConfig>) {
  const [offsets, setOffsets] = useState(() => [...config.initialOffsets]);
  const [locked, setLocked] = useState([false, false, false]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState(
    "Thorax band selected. Slide its live stripes onto the amber reference.",
  );
  const solvedRef = useRef(false);

  const move = useCallback(
    (amount: number, band = selected) => {
      if (locked[band]) return;
      setSelected(band);
      setOffsets((values) =>
        values.map((value, index) =>
          index === band ? clamp(value + amount, -6, 6) : value,
        ),
      );
      setStatus(
        `${STRIPE_BAND_NAMES[band]} sample shifted ${amount < 0 ? "left" : "right"}.`,
      );
    },
    [locked, selected],
  );

  const lockBand = useCallback(
    (band = selected) => {
      setSelected(band);
      if (!stripeBandAligned(offsets[band], config.targetOffsets[band])) {
        setStatus(
          `${STRIPE_BAND_NAMES[band]} does not match yet. Center the live black seam on the amber registration line.`,
        );
        return;
      }
      const next = locked.map((value, index) =>
        index === band ? true : value,
      );
      setLocked(next);
      setStatus(
        `${STRIPE_BAND_NAMES[band]} identity locked · ${next.filter(Boolean).length} / 3`,
      );
      if (next.every(Boolean) && !solvedRef.current) {
        solvedRef.current = true;
        window.setTimeout(onSolved, 360);
      }
    },
    [config, locked, offsets, onSolved, selected],
  );

  useQuestKeyboard((event) => {
    const match = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      setSelected(Number(match[1]) - 1);
      return;
    }
    if (event.code === "KeyA" || event.code === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
    if (event.code === "KeyD" || event.code === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
    if (event.code === "Space") {
      event.preventDefault();
      lockBand();
    }
  });

  return (
    <div className={styles.stripeLayout}>
      <div className={styles.zebraScanner}>
        <div className={styles.zebraSilhouette} />
        {offsets.map((offset, index) => (
          <section
            className={`${styles.stripeBand} ${selected === index ? styles.selectedBand : ""} ${locked[index] ? styles.lockedBand : ""}`}
            key={STRIPE_BAND_NAMES[index]}
            onClick={() => setSelected(index)}
          >
            <header>
              <span>
                0{index + 1} · {STRIPE_BAND_NAMES[index]}
              </span>
              <strong>
                {locked[index]
                  ? "IDENTITY LOCKED"
                  : stripeBandAligned(offset, config.targetOffsets[index])
                    ? "MATCH"
                    : "SCANNING"}
              </strong>
            </header>
            <div className={styles.stripeWindow}>
              <i
                className={styles.referenceStripe}
                style={{ left: `${50 + config.targetOffsets[index] * 5}%` }}
              />
              <b
                className={styles.liveStripes}
                style={{ transform: `translateX(${offset * 5}%)` }}
              />
            </div>
            <footer>
              <button
                onClick={() => move(-1, index)}
                type="button"
                aria-label={`Move ${STRIPE_BAND_NAMES[index]} left`}
              >
                −
              </button>
              <button onClick={() => lockBand(index)} type="button">
                Lock
              </button>
              <button
                onClick={() => move(1, index)}
                type="button"
                aria-label={`Move ${STRIPE_BAND_NAMES[index]} right`}
              >
                +
              </button>
            </footer>
          </section>
        ))}
      </div>
      <QuestStatus tone={locked.some(Boolean) ? "ready" : "normal"}>
        {status}
      </QuestStatus>
    </div>
  );
}

function ScentOnTheWind({
  config,
  onSolved,
}: MechanicProps<RedPandaScentConfig>) {
  const [directions, setDirections] = useState(() => [
    ...config.initialDirections,
  ]);
  const [status, setStatus] = useState(
    "The scent ribbon is waiting at the first vane.",
  );
  const solvedRef = useRef(false);
  const reach = scentTrailReach(directions, config.solution);

  const rotate = useCallback(
    (index: number) => {
      if (solvedRef.current) return;
      const next = directions.map((direction, vane) =>
        vane === index ? (direction + 1) % 4 : direction,
      );
      const nextReach = scentTrailReach(next, config.solution);
      setDirections(next);
      setStatus(
        nextReach === config.solution.length
          ? "The ribbon reaches the high nest in one continuous stream."
          : nextReach > reach
            ? `Scent reaches vane ${nextReach + 1}. Follow the glowing edge.`
            : nextReach < reach
              ? "That turn broke the scent path lower in the canopy."
              : `Vane ${index + 1} turned. The leading ribbon is unchanged.`,
      );
      if (nextReach === config.solution.length) {
        solvedRef.current = true;
        window.setTimeout(onSolved, 440);
      }
    },
    [config, directions, onSolved, reach],
  );

  useQuestKeyboard((event) => {
    const match = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      rotate(Number(match[1]) - 1);
    }
  });

  return (
    <div className={styles.scentLayout}>
      <div className={styles.mountainCanopy}>
        <div
          className={styles.scentRibbon}
          style={{ width: `${Math.max(5, (reach / 4) * 100)}%` }}
        />
        {directions.map((direction, index) => (
          <button
            className={`${styles.windVane} ${index < reach ? styles.scented : index === reach ? styles.leadingVane : ""}`}
            key={index}
            onClick={() => rotate(index)}
            style={cssVars({
              "--vane-angle": `${direction * 90}deg`,
              "--vane-index": index,
            })}
            type="button"
          >
            <span>{index + 1}</span>
            <i />
            <b>➤</b>
            <small>
              {index < reach
                ? "SCENT FLOW"
                : index === reach
                  ? "TURN ME"
                  : "DOWNWIND"}
            </small>
          </button>
        ))}
        <div
          className={`${styles.redPandaNest} ${reach === 4 ? styles.reached : ""}`}
        >
          ◎<small>nest</small>
        </div>
      </div>
      <aside className={styles.readoutPanel}>
        <span className={styles.panelLabel}>Scent reach</span>
        <strong>{reach} / 4 vanes</strong>
        <ProgressDots count={4} current={reach} label="Aligned scent vanes" />
        <p>Each vane has four cardinal positions. The solution is stable.</p>
      </aside>
      <QuestStatus tone={reach > 0 ? "ready" : "normal"}>{status}</QuestStatus>
    </div>
  );
}

function SunTrail({ config, onSolved }: MechanicProps<TortoiseSunConfig>) {
  const [angles, setAngles] = useState(() => [...config.initialAngles]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState(
    "Mirror one selected. Find the first bright reflection.",
  );
  const solvedRef = useRef(false);
  const reach = sunTrailReach(angles, config.solution);

  const rotate = useCallback(
    (amount: number, mirror = selected) => {
      if (solvedRef.current) return;
      const next = angles.map((angle, index) =>
        index === mirror ? (angle + amount + 6) % 6 : angle,
      );
      const nextReach = sunTrailReach(next, config.solution);
      setSelected(mirror);
      setAngles(next);
      setStatus(
        nextReach === 3
          ? "The warming stone floods with afternoon light."
          : nextReach > reach
            ? `Mirror ${mirror + 1} catches. The next beam segment is live.`
            : nextReach < reach
              ? "The beam slipped off an earlier mirror."
              : `Mirror ${mirror + 1} rotated ${amount < 0 ? "counterclockwise" : "clockwise"}.`,
      );
      if (nextReach === 3) {
        solvedRef.current = true;
        window.setTimeout(onSolved, 440);
      }
    },
    [angles, config, onSolved, reach, selected],
  );

  useQuestKeyboard((event) => {
    const match = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      setSelected(Number(match[1]) - 1);
      return;
    }
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      event.preventDefault();
      rotate(-1);
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      event.preventDefault();
      rotate(1);
    }
  });

  return (
    <div className={styles.sunLayout}>
      <div className={styles.solarYard}>
        <div className={styles.sunDisc}>✦</div>
        {angles.map((angle, index) => (
          <div
            className={`${styles.mirrorStation} ${selected === index ? styles.selectedMirror : ""} ${index < reach ? styles.litMirror : ""}`}
            key={index}
            style={cssVars({
              "--mirror-angle": `${angle * 30 - 75}deg`,
              "--mirror-index": index,
            })}
          >
            <button
              className={styles.mirror}
              onClick={() => setSelected(index)}
              type="button"
              aria-label={`Select mirror ${index + 1}`}
            >
              <i />
              <span>{index + 1}</span>
            </button>
            <div>
              <button
                onClick={() => rotate(-1, index)}
                type="button"
                aria-label={`Rotate mirror ${index + 1} left`}
              >
                ↶
              </button>
              <button
                onClick={() => rotate(1, index)}
                type="button"
                aria-label={`Rotate mirror ${index + 1} right`}
              >
                ↷
              </button>
            </div>
          </div>
        ))}
        {Array.from({ length: 4 }, (_, index) => (
          <i
            className={`${styles.lightBeam} ${index <= reach ? styles.beamLit : ""}`}
            key={index}
            style={cssVars({ "--beam-index": index })}
          />
        ))}
        <div
          className={`${styles.warmingStone} ${reach === 3 ? styles.stoneWarm : ""}`}
        >
          <i />
          <strong>
            {reach === 3 ? "WARM" : `${Math.round((reach / 3) * 100)}%`}
          </strong>
        </div>
      </div>
      <aside className={styles.readoutPanel}>
        <span className={styles.panelLabel}>Solar relay</span>
        <strong>{reach} / 3 mirrors</strong>
        <p>Selected mirror: {selected + 1}. Six calibrated stops per mount.</p>
        <ProgressDots count={3} current={reach} label="Mirrors aligned" />
      </aside>
      <QuestStatus tone={reach > 0 ? "ready" : "normal"}>{status}</QuestStatus>
    </div>
  );
}

function WetlandBalance({
  config,
  onSolved,
}: MechanicProps<FlamingoWetlandConfig>) {
  const [reading, setReading] = useState<WetlandReading>(() => ({
    water: config.initialWater,
    salinity: config.initialSalinity,
  }));
  const [hold, setHold] = useState(0);
  const [status, setStatus] = useState(
    "The wetland is shallow and salty. Restore the habitat bands.",
  );
  const solvedRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setReading((previous) => {
        const next = {
          water: clamp(previous.water + config.waterDrift, 0, 100),
          salinity: clamp(previous.salinity + config.salinityDrift, 0, 100),
        };
        setHold((value) =>
          wetlandReadingSafe(next)
            ? Math.min(3000, value + 100)
            : Math.max(0, value - 180),
        );
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [config]);

  useEffect(() => {
    if (hold < 2600 || solvedRef.current) return;
    solvedRef.current = true;
    setStatus(
      "Stable shallows confirmed. The flamingos step into the restored feeding shelf.",
    );
    const timer = window.setTimeout(onSolved, 420);
    return () => window.clearTimeout(timer);
  }, [hold, onSolved]);

  const operate = useCallback((valve: WetlandValve) => {
    setReading((previous) => operateWetlandValve(previous, valve));
    setStatus(
      valve === "intake"
        ? "Brackish intake opened: depth rises with a little salt."
        : valve === "drain"
          ? "Drain opened: depth falls while minerals concentrate."
          : "Fresh flow opened: clean water dilutes the wetland.",
    );
  }, []);

  useQuestKeyboard((event) => {
    const match = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      operate((["intake", "drain", "fresh"] as const)[Number(match[1]) - 1]);
    }
  });

  const safe = wetlandReadingSafe(reading);
  return (
    <div className={styles.wetlandLayout}>
      <section className={styles.wetlandGauges}>
        {(
          [
            ["water", reading.water, 46, 59, "Water depth"],
            ["salinity", reading.salinity, 42, 57, "Salinity"],
          ] as const
        ).map(([key, value, low, high, label]) => (
          <div className={styles.wetlandGauge} key={key}>
            <header>
              <span>{label}</span>
              <strong>{Math.round(value)}%</strong>
            </header>
            <div
              role="meter"
              aria-label={`${label} ${Math.round(value)} percent`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(value)}
            >
              <i style={{ left: `${low}%`, width: `${high - low}%` }} />
              <b style={{ width: `${value}%` }} />
              <span style={{ left: `${value}%` }} />
            </div>
            <small>
              {value >= low && value <= high
                ? "HABITAT BAND"
                : value < low
                  ? "TOO LOW"
                  : "TOO HIGH"}
            </small>
          </div>
        ))}
        <div
          className={`${styles.stabilityClock} ${safe ? styles.stable : ""}`}
        >
          <i style={{ width: `${(hold / 2600) * 100}%` }} />
          <strong>{safe ? "HOLDING" : "UNSTABLE"}</strong>
          <span>{(hold / 1000).toFixed(1)} / 2.6 SEC</span>
        </div>
      </section>
      <section className={styles.valveBank} aria-label="Wetland valve controls">
        <button onClick={() => operate("intake")} type="button">
          <i>↥</i>
          <strong>Brackish intake</strong>
          <span>Depth + · salt +</span>
          <kbd>1</kbd>
        </button>
        <button onClick={() => operate("drain")} type="button">
          <i>↧</i>
          <strong>Drain</strong>
          <span>Depth − · salt +</span>
          <kbd>2</kbd>
        </button>
        <button onClick={() => operate("fresh")} type="button">
          <i>≋</i>
          <strong>Fresh flow</strong>
          <span>Depth + · salt −</span>
          <kbd>3</kbd>
        </button>
      </section>
      <QuestStatus
        tone={
          safe
            ? "ready"
            : reading.water > 72 || reading.salinity > 72
              ? "warning"
              : "normal"
        }
      >
        {status}
      </QuestStatus>
    </div>
  );
}

function PrairieSeeding({
  config,
  onSolved,
}: MechanicProps<BisonPrairieConfig>) {
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(40);
  const [targetIndex, setTargetIndex] = useState(0);
  const [lastLanding, setLastLanding] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [shots, setShots] = useState(0);
  const [status, setStatus] = useState(
    "Plot one marked. Move the projected reticle into its soil ring.",
  );
  const solvedRef = useRef(false);
  const preview = prairieLanding(angle, power, config.wind);

  const aim = useCallback(
    (amount: number) => setAngle((value) => clamp(value + amount, -35, 35)),
    [],
  );
  const charge = useCallback(
    (amount: number) => setPower((value) => clamp(value + amount, 24, 96)),
    [],
  );
  const launch = useCallback(() => {
    if (solvedRef.current) return;
    const landing = prairieLanding(angle, power, config.wind),
      target = config.targets[targetIndex];
    const hit = prairieShotHits(landing, target);
    setLastLanding(landing);
    setShots((value) => value + 1);
    if (!hit) {
      const lateral = landing.x < target.x ? "left" : "right";
      const range = landing.y < target.y ? "short" : "long";
      setStatus(
        `Seed pod landed ${range} and ${lateral}. Adjust the projected reticle and reload.`,
      );
      return;
    }
    const next = targetIndex + 1;
    setTargetIndex(next);
    setStatus(
      next === config.targets.length
        ? "Every bare plot blooms with prairie seed."
        : `Plot ${targetIndex + 1} seeded. Plot ${next + 1} is now active.`,
    );
    if (next === config.targets.length) {
      solvedRef.current = true;
      window.setTimeout(onSolved, 460);
    }
  }, [angle, config, onSolved, power, targetIndex]);

  useQuestKeyboard((event) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      event.preventDefault();
      aim(-5);
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      event.preventDefault();
      aim(5);
    }
    if (event.code === "Space") {
      event.preventDefault();
      charge(8);
    }
    if (event.code === "KeyX") {
      event.preventDefault();
      charge(-8);
    }
    if (event.code === "Enter" || event.code === "KeyF") {
      event.preventDefault();
      launch();
    }
  });

  const plotStyle = (point: { x: number; y: number }) =>
    cssVars({
      "--field-x": `${clamp(50 + point.x * 6.2, 6, 94)}%`,
      "--field-y": `${clamp(96 - point.y * 7, 5, 94)}%`,
    });
  return (
    <div className={styles.prairieLayout}>
      <div
        className={styles.prairieField}
        aria-label="Prairie restoration launcher range"
      >
        <div
          className={styles.windSock}
          style={cssVars({ "--wind-angle": `${config.wind * 180}deg` })}
        >
          <i />
          <strong>
            {config.wind < -0.025
              ? "WIND LEFT"
              : config.wind > 0.025
                ? "WIND RIGHT"
                : "LIGHT WIND"}
          </strong>
        </div>
        {config.targets.map((target, index) => (
          <div
            className={`${styles.seedPlot} ${index < targetIndex ? styles.seeded : index === targetIndex ? styles.activePlot : ""}`}
            key={index}
            style={plotStyle(target)}
          >
            <i />
            <strong>{index + 1}</strong>
          </div>
        ))}
        <div className={styles.projectedLanding} style={plotStyle(preview)}>
          <i />
          <span>PROJECTED</span>
        </div>
        {lastLanding && (
          <div className={styles.lastLanding} style={plotStyle(lastLanding)}>
            ×
          </div>
        )}
        <div
          className={styles.seedLauncher}
          style={cssVars({ "--launcher-angle": `${angle}deg` })}
        >
          <i />
          <b />
        </div>
      </div>
      <aside className={styles.launchControls}>
        <span className={styles.panelLabel}>Seed launcher</span>
        <div>
          <strong>
            {angle > 0
              ? `R ${angle}`
              : angle < 0
                ? `L ${Math.abs(angle)}`
                : "CENTER"}
            °
          </strong>
          <strong>{power}%</strong>
        </div>
        <div className={styles.chargeTrack}>
          <i style={{ width: `${power}%` }} />
        </div>
        <section>
          <button onClick={() => aim(-5)} type="button">
            Aim left
          </button>
          <button onClick={() => aim(5)} type="button">
            Aim right
          </button>
          <button onClick={() => charge(8)} type="button">
            Charge +
          </button>
          <button onClick={() => charge(-8)} type="button">
            Bleed −
          </button>
        </section>
        <button className={styles.launchButton} onClick={launch} type="button">
          Launch seed pod <kbd>Enter</kbd>
        </button>
        <small>
          {shots} {shots === 1 ? "pod" : "pods"} launched · plot{" "}
          {Math.min(targetIndex + 1, 3)} / 3
        </small>
      </aside>
      <QuestStatus tone={targetIndex > 0 ? "ready" : "normal"}>
        {status}
      </QuestStatus>
    </div>
  );
}

function QuestMechanic({
  config,
  onSolved,
}: {
  config: ZooSideQuestConfig;
  onSolved: () => void;
}) {
  switch (config.questId) {
    case "aviary-voices":
      return <FourVoices config={config} onSolved={onSolved} />;
    case "sea-lion-current":
      return <RideTheCurrent config={config} onSolved={onSolved} />;
    case "monkey-canopy-rig":
      return <CanopyRig config={config} onSolved={onSolved} />;
    case "zebra-stripe-scan":
      return <StripeScan config={config} onSolved={onSolved} />;
    case "red-panda-scent-wind":
      return <ScentOnTheWind config={config} onSolved={onSolved} />;
    case "tortoise-sun-trail":
      return <SunTrail config={config} onSolved={onSolved} />;
    case "flamingo-wetland-balance":
      return <WetlandBalance config={config} onSolved={onSolved} />;
    case "bison-prairie-seeding":
      return <PrairieSeeding config={config} onSolved={onSolved} />;
  }
}

export function ZooSideQuestScreen({
  questId,
  onComplete,
  onCancel,
}: ZooSideQuestScreenProps) {
  const metadata = ZOO_SIDE_QUESTS[questId];
  const config = useMemo(() => createZooSideQuestConfig(questId), [questId]);
  const [completedQuest, setCompletedQuest] = useState<ZooSideQuestId | null>(
    null,
  );
  const completed = completedQuest === questId;
  const screenRef = useRef<HTMLElement>(null);

  useEffect(() => {
    screenRef.current?.focus();
  }, [questId]);
  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(() => onComplete(questId), 780);
    return () => window.clearTimeout(timer);
  }, [completed, onComplete, questId]);

  useQuestKeyboard((event) => {
    if (event.code !== "Escape" || completed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onCancel();
  });

  const solve = useCallback(() => setCompletedQuest(questId), [questId]);
  return (
    <section
      aria-labelledby="zoo-side-quest-title"
      aria-modal="true"
      className={`${styles.screen} ${styles[metadata.theme]} ${completed ? styles.completed : ""}`}
      data-side-quest={questId}
      ref={screenRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className={styles.atmosphere} />
      <div className={styles.grain} />
      <header className={styles.questHeader}>
        <div>
          <span>{metadata.eyebrow}</span>
          <h2 id="zoo-side-quest-title">{metadata.title}</h2>
          <p>{metadata.objective}</p>
        </div>
        <button disabled={completed} onClick={onCancel} type="button">
          Back away <kbd>Esc</kbd>
        </button>
      </header>
      <main className={styles.mechanicShell}>
        <QuestMechanic config={config} onSolved={solve} />
      </main>
      <aside className={styles.briefing}>
        <div>
          <span>Field brief</span>
          <p>{metadata.instructions}</p>
        </div>
        <div>
          <span>Controls</span>
          <strong>{metadata.keyboard}</strong>
        </div>
        <div>
          <span>New companions</span>
          <ul>
            {metadata.recruitedSpecies.map((species) => (
              <li key={species}>{species.replaceAll("-", " ")}</li>
            ))}
          </ul>
        </div>
      </aside>
      {completed && (
        <div className={styles.completion} role="status" aria-live="assertive">
          <i />
          <span>Habitat quest complete</span>
          <strong>
            {metadata.recruitedSpecies.length === 1
              ? "A new friend joins your menagerie"
              : `${metadata.recruitedSpecies.length} new friends join your menagerie`}
          </strong>
        </div>
      )}
    </section>
  );
}
