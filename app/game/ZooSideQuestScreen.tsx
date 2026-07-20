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
import type {
  PremiumAudioDirector,
  ZooQuestAudioCue,
} from "./systems";

export { ZOO_SIDE_QUEST_IDS, ZOO_SIDE_QUESTS } from "./zooSideQuestLogic";
export type {
  ZooRecruitSpeciesId,
  ZooSideQuestId,
  ZooSideQuestMetadata,
} from "./zooSideQuestLogic";

export type ZooSideQuestScreenProps = {
  questId: ZooSideQuestId;
  audio: PremiumAudioDirector;
  onComplete: (questId: ZooSideQuestId) => void;
  onCancel: () => void;
};

type MechanicProps<T extends ZooSideQuestConfig> = {
  config: T;
  audio: PremiumAudioDirector;
  onSolved: () => void;
};

const BIRD_NAMES = [
  "Sun conure",
  "Blue-and-gold macaw",
  "Scarlet ibis",
  "Green aracari",
] as const;
const STRIPE_BAND_NAMES = ["Thorax", "Flank", "Haunch"] as const;

function cssVars(values: Record<`--${string}`, string | number>) {
  return values as CSSProperties;
}

// Keep the entire seven-by-five course inside the sculpted pool. Using the
// raw 0–100% grid clipped edge gates (and the starting buoy) behind the pool's
// thick border, especially at narrow or short aspect ratios.
function seaLionStagePosition(point: { x: number; y: number }) {
  return cssVars({
    "--grid-x": `${16 + (point.x / 6) * 68}%`,
    "--grid-y": `${22 + (point.y / 4) * 66}%`,
  });
}

function useQuestKeyboard(handler: (event: KeyboardEvent) => void) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener("keydown", keyDown, true);
    return () => window.removeEventListener("keydown", keyDown, true);
  }, []);
}

function useDelayedQuestCompletion(onSolved: () => void) {
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  return useCallback((delay: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(onSolved, delay);
  }, [onSolved]);
}

function playQuestSound(
  audio: PremiumAudioDirector,
  cue: ZooQuestAudioCue,
  variant = 0,
) {
  void audio.unlock();
  audio.playZooQuestCue(cue, variant);
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

function FourVoices({ config, audio, onSolved }: MechanicProps<AviaryVoicesConfig>) {
  const [round, setRound] = useState(0);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [cue, setCue] = useState(-1);
  const [accepting, setAccepting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState(
    "Ready when you are. Listen once, then echo the flock.",
  );
  const phraseLength = config.roundLengths[round];
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const playPhrase = useCallback(() => {
    clearTimers();
    void audio.unlock();
    setStarted(true);
    setPlaying(true);
    setAccepting(false);
    setAnswerIndex(0);
    setPlaybackIndex(-1);
    setCue(-1);
    setStatus(`Count in · then listen for ${phraseLength} distinct calls.`);
    [0, 1, 2].forEach((count) => {
      timers.current.push(
        window.setTimeout(
          () => audio.playZooQuestCue("count-in", count),
          80 + count * 220,
        ),
      );
    });
    const phraseStartsAt = 830;
    for (let index = 0; index < phraseLength; index++) {
      const voice = config.melody[index];
      const startsAt = phraseStartsAt + index * 610;
      timers.current.push(
        window.setTimeout(() => {
          setPlaybackIndex(index);
          setCue(voice);
          setStatus(`${BIRD_NAMES[voice]} · call ${index + 1} of ${phraseLength}`);
          audio.playZooQuestCue("bird-call", voice);
        }, startsAt),
      );
      timers.current.push(
        window.setTimeout(() => setCue(-1), startsAt + 390),
      );
    }
    timers.current.push(
      window.setTimeout(() => {
        setCue(-1);
        setPlaybackIndex(-1);
        setPlaying(false);
        setAccepting(true);
        setStatus("Your turn · repeat the phrase from left to right.");
      }, phraseStartsAt + phraseLength * 610),
    );
  }, [audio, clearTimers, config.melody, phraseLength]);

  const answer = useCallback(
    (voice: number) => {
      if (!accepting || playing) return;
      playQuestSound(audio, "bird-call", voice);
      setCue(voice);
      timers.current.push(window.setTimeout(() => setCue(-1), 330));
      if (config.melody[answerIndex] !== voice) {
        setAccepting(false);
        setMistakes((value) => value + 1);
        playQuestSound(audio, "failure");
        setStatus(
          `${BIRD_NAMES[voice]} broke the phrase. Listen again—the melody will not change.`,
        );
        timers.current.push(window.setTimeout(playPhrase, 900));
        return;
      }
      const nextIndex = answerIndex + 1;
      setAnswerIndex(nextIndex);
      setStatus(`${BIRD_NAMES[voice]} matches · ${nextIndex} / ${phraseLength}`);
      if (nextIndex !== phraseLength) return;
      setAccepting(false);
      if (round === config.roundLengths.length - 1) {
        setStatus("Four voices answer together—the canopy chorus is complete.");
        [0, 1, 2, 3].forEach((bird, index) => {
          timers.current.push(
            window.setTimeout(
              () => audio.playZooQuestCue("bird-call", bird),
              index * 105,
            ),
          );
        });
        timers.current.push(window.setTimeout(onSolved, 620));
      } else {
        playQuestSound(audio, "success");
        setStatus("Phrase matched. The flock adds two calls—listen for the longer pattern.");
        timers.current.push(
          window.setTimeout(() => {
            setRound((value) => value + 1);
            setAnswerIndex(0);
            setStarted(false);
            setStatus("Next round ready · press Listen when you are settled.");
          }, 720),
        );
      }
    },
    [accepting, answerIndex, audio, config, onSolved, phraseLength, playPhrase, playing, round],
  );

  useQuestKeyboard((event) => {
    const match = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      answer(Number(match[1]) - 1);
    }
    if (event.code === "KeyR" && !playing) {
      event.preventDefault();
      playPhrase();
    }
  });

  return (
    <div className={styles.voicesLayout}>
      <div className={styles.aviaryStage} aria-label="Four illuminated bird perches">
        <div className={styles.canopyGlow} />
        <div className={styles.phraseRail} aria-label="Call playback timeline">
          {Array.from({ length: phraseLength }, (_, index) => (
            <i
              className={
                index === playbackIndex
                  ? styles.playingCall
                  : index < answerIndex
                    ? styles.answeredCall
                    : undefined
              }
              key={index}
            />
          ))}
        </div>
        <div className={styles.perchGrid}>
          {BIRD_NAMES.map((name, index) => (
            <button
              aria-label={`Voice ${index + 1}, ${name}`}
              className={`${styles.birdPerch} ${index ? styles[`bird${index + 1}`] : ""} ${cue === index ? styles.cued : ""} ${accepting ? styles.listening : ""}`}
              disabled={!accepting}
              key={name}
              onClick={() => answer(index)}
              type="button"
            >
              <span className={styles.birdPortrait} aria-hidden="true">
                <i className={styles.birdTail} />
                <i className={styles.birdBody}><b /><em /><u /></i>
              </span>
              <strong>{index + 1}</strong>
              <small>{name}</small>
            </button>
          ))}
        </div>
        <div className={styles.perchBranch} />
      </div>
      <aside className={styles.readoutPanel}>
        <span className={styles.panelLabel}>Chorus phrase</span>
        <strong>Round {round + 1} / 3</strong>
        <ProgressDots count={phraseLength} current={answerIndex} label="Calls repeated" />
        <p>{playing ? "Listening—watch and hear each species answer." : accepting ? "Your turn. Keys 1–4 match the four perches." : "The phrase remains fixed for this attempt."}</p>
        <button
          className={started ? styles.secondaryButton : styles.primaryButton}
          disabled={playing}
          onClick={playPhrase}
          type="button"
        >
          {playing ? "Flock singing…" : started ? "Replay phrase" : "Listen to phrase"} <kbd>R</kbd>
        </button>
        {mistakes > 0 && <small>{mistakes} retry {mistakes === 1 ? "made" : "attempts"} · completed rounds stay safe</small>}
      </aside>
      <QuestStatus tone={accepting ? "ready" : playing ? "normal" : "normal"}>{status}</QuestStatus>
    </div>
  );
}

function RideTheCurrent({ config, audio, onSolved }: MechanicProps<SeaLionCurrentConfig>) {
  const [state, setState] = useState<SeaLionCurrentState>(() => ({
    position: { ...config.start },
    gateIndex: 0,
    turn: 0,
  }));
  const [status, setStatus] = useState(
    "Gate one is active. Read the first cross-current, then steer.",
  );
  const solvedRef = useRef(false);
  const strokeLockedRef = useRef(false);
  const strokeTimerRef = useRef<number | null>(null);
  const [stroking, setStroking] = useState(false);
  const completeAfter = useDelayedQuestCompletion(onSolved);
  const drift =
    config.currentPattern[state.turn % config.currentPattern.length] ?? 0;

  const steer = useCallback(
    (direction: CurrentDirection) => {
      if (solvedRef.current || strokeLockedRef.current) return;
      strokeLockedRef.current = true;
      setStroking(true);
      playQuestSound(audio, "water", state.turn % 4);
      if (strokeTimerRef.current !== null) window.clearTimeout(strokeTimerRef.current);
      strokeTimerRef.current = window.setTimeout(() => {
        strokeLockedRef.current = false;
        setStroking(false);
      }, 300);
      setState((previous) => {
        const next = advanceSeaLionCurrent(previous, config, direction);
        if (next.gateIndex > previous.gateIndex) {
          playQuestSound(audio, "latch", next.gateIndex);
          if (next.gateIndex === config.gates.length) {
            solvedRef.current = true;
            setStatus(
              "All three gates ring out — the sea lion surfaces beside the buoy.",
            );
            completeAfter(260);
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
    [audio, completeAfter, config, drift, state.turn],
  );

  useEffect(() => () => {
    if (strokeTimerRef.current !== null) window.clearTimeout(strokeTimerRef.current);
  }, []);

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
        className={`${styles.poolGrid} ${stroking ? styles.stroking : ""}`}
        aria-label={`Enrichment buoy at column ${state.position.x + 1}, row ${state.position.y + 1}`}
      >
        <div className={styles.waterStripes} />
        {config.gates.map((gate, index) => (
          <div
            className={`${styles.currentGate} ${index < state.gateIndex ? styles.cleared : index === state.gateIndex ? styles.activeGate : ""}`}
            key={index}
            style={seaLionStagePosition(gate)}
          >
            <span>{index + 1}</span>
          </div>
        ))}
        <div
          className={styles.buoy}
          style={seaLionStagePosition(state.position)}
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
        <ol className={styles.gateManifest} aria-label="All current gate positions">
          {config.gates.map((gate, index) => (
            <li
              className={index < state.gateIndex ? styles.gateCleared : index === state.gateIndex ? styles.gateLive : ""}
              key={index}
            >
              <b>{index + 1}</b>
              <span>C{gate.x + 1} · R{gate.y + 1}</span>
            </li>
          ))}
        </ol>
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

function CanopyRig({ config, audio, onSolved }: MechanicProps<MonkeyCanopyConfig>) {
  const [tension, setTension] = useState(0);
  const [clock, setClock] = useState(0);
  const [latched, setLatched] = useState([false, false, false]);
  const [status, setStatus] = useState(
    "Build line tension, then watch the first moving knot.",
  );
  const solvedRef = useRef(false);
  const completeAfter = useDelayedQuestCompletion(onSolved);

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
    playQuestSound(audio, "tension", Math.round(tension / 20));
  }, [audio, tension]);

  const latch = useCallback(
    (anchor: number) => {
      if (latched[anchor] || solvedRef.current) return;
      const phase =
        (clock * config.anchorSpeeds[anchor] + config.anchorOffsets[anchor]) %
        1;
      if (tension < 38 || tension > 68) {
        playQuestSound(audio, "failure");
        setStatus(
          tension < 38
            ? "The line is too slack to seat a knot."
            : "Too much torque — ease the line before closing a jaw.",
        );
        return;
      }
      if (!canopyAnchorReady(phase)) {
        playQuestSound(audio, "failure");
        setStatus(
          `Anchor ${anchor + 1} missed the jaw. Track the knot back toward the center notch.`,
        );
        return;
      }
      const next = latched.map((value, index) =>
        index === anchor ? true : value,
      );
      setLatched(next);
      playQuestSound(audio, "latch", anchor);
      setStatus(
        `Anchor ${anchor + 1} secured. ${next.filter(Boolean).length} / 3 load paths stable.`,
      );
      if (next.every(Boolean)) {
        solvedRef.current = true;
        completeAfter(360);
      }
    },
    [audio, clock, completeAfter, config, latched, tension],
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

function StripeScan({ config, audio, onSolved }: MechanicProps<ZebraStripeConfig>) {
  const [offsets, setOffsets] = useState(() => [...config.initialOffsets]);
  const [locked, setLocked] = useState([false, false, false]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState(
    "Thorax band selected. Slide its live stripes onto the amber reference.",
  );
  const solvedRef = useRef(false);
  const completeAfter = useDelayedQuestCompletion(onSolved);

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
      playQuestSound(audio, "scan", band);
    },
    [audio, locked, selected],
  );

  const lockBand = useCallback(
    (band = selected) => {
      setSelected(band);
      if (!stripeBandAligned(offsets[band], config.targetOffsets[band])) {
        playQuestSound(audio, "failure");
        setStatus(
          `${STRIPE_BAND_NAMES[band]} does not match yet. Center the live black seam on the amber registration line.`,
        );
        return;
      }
      const next = locked.map((value, index) =>
        index === band ? true : value,
      );
      setLocked(next);
      playQuestSound(audio, "latch", band);
      setStatus(
        `${STRIPE_BAND_NAMES[band]} identity locked · ${next.filter(Boolean).length} / 3`,
      );
      if (next.every(Boolean) && !solvedRef.current) {
        solvedRef.current = true;
        completeAfter(360);
      }
    },
    [audio, completeAfter, config, locked, offsets, selected],
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
                    : `${Math.abs(config.targetOffsets[index] - offset)} STEP${Math.abs(config.targetOffsets[index] - offset) === 1 ? "" : "S"} OFF`}
              </strong>
            </header>
            <div className={styles.stripeWindow}>
              <i
                className={styles.referenceStripe}
                style={{ left: `${50 + config.targetOffsets[index] * 5}%` }}
              />
              <i
                className={styles.liveRegistration}
                style={{ left: `${50 + offset * 5}%` }}
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
  audio,
  onSolved,
}: MechanicProps<RedPandaScentConfig>) {
  const [directions, setDirections] = useState(() => [
    ...config.initialDirections,
  ]);
  const [status, setStatus] = useState(
    "The scent ribbon is waiting at the first vane.",
  );
  const solvedRef = useRef(false);
  const completeAfter = useDelayedQuestCompletion(onSolved);
  const reach = scentTrailReach(directions, config.solution);

  const rotate = useCallback(
    (index: number) => {
      if (solvedRef.current) return;
      const next = directions.map((direction, vane) =>
        vane === index ? (direction + 1) % 4 : direction,
      );
      const nextReach = scentTrailReach(next, config.solution);
      setDirections(next);
      playQuestSound(audio, "wind", index);
      if (nextReach > reach) playQuestSound(audio, "success");
      else if (nextReach < reach) playQuestSound(audio, "failure");
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
        completeAfter(440);
      }
    },
    [audio, completeAfter, config, directions, reach],
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
        <svg className={styles.scentRibbon} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className={styles.scentGuide} d="M4 63 C14 63 14 58 18 58 S27 30 34 30 S45 58 55 58 S65 30 76 30 S88 16 96 16" />
          <path
            className={styles.scentFlow}
            d="M4 63 C14 63 14 58 18 58 S27 30 34 30 S45 58 55 58 S65 30 76 30 S88 16 96 16"
            pathLength="1"
            style={{ strokeDashoffset: 1 - reach / 4 }}
          />
        </svg>
        <div className={styles.scentParticles} style={cssVars({ "--scent-reach": reach })} />
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

function SunTrail({ config, audio, onSolved }: MechanicProps<TortoiseSunConfig>) {
  const [angles, setAngles] = useState(() => [...config.initialAngles]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState(
    "Mirror one selected. Find the first bright reflection.",
  );
  const solvedRef = useRef(false);
  const completeAfter = useDelayedQuestCompletion(onSolved);
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
      playQuestSound(audio, "move", mirror);
      if (nextReach > reach) playQuestSound(audio, "sun", nextReach);
      else if (nextReach < reach) playQuestSound(audio, "failure");
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
        completeAfter(440);
      }
    },
    [angles, audio, completeAfter, config, reach, selected],
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
        <svg className={styles.solarBeamPath} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[[11, 16, 25, 53], [25, 53, 49, 38], [49, 38, 73, 53], [73, 53, 92, 80]].map((segment, index) => (
            <line
              className={index <= reach ? styles.beamLit : undefined}
              key={index}
              x1={segment[0]}
              y1={segment[1]}
              x2={segment[2]}
              y2={segment[3]}
            />
          ))}
        </svg>
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
  audio,
  onSolved,
}: MechanicProps<FlamingoWetlandConfig>) {
  const [simulation, setSimulation] = useState<{ reading: WetlandReading; hold: number }>(() => ({
    reading: { water: config.initialWater, salinity: config.initialSalinity },
    hold: 0,
  }));
  const { reading, hold } = simulation;
  const [status, setStatus] = useState(
    "The wetland is shallow and salty. Restore the habitat bands.",
  );
  const solvedRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSimulation((previous) => {
        const next = {
          water: clamp(previous.reading.water + config.waterDrift, 0, 100),
          salinity: clamp(previous.reading.salinity + config.salinityDrift, 0, 100),
        };
        return {
          reading: next,
          hold: wetlandReadingSafe(next)
            ? Math.min(2600, previous.hold + 100)
            : Math.max(0, previous.hold - 180),
        };
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
    completionTimerRef.current = window.setTimeout(onSolved, 420);
  }, [hold, onSolved]);

  const operate = useCallback((valve: WetlandValve) => {
    setSimulation((previous) => ({
      ...previous,
      reading: operateWetlandValve(previous.reading, valve),
    }));
    playQuestSound(audio, "valve", valve === "intake" ? 0 : valve === "drain" ? 1 : 2);
    setStatus(
      valve === "intake"
        ? "Brackish intake opened: depth rises with a little salt."
        : valve === "drain"
          ? "Drain opened: depth falls while minerals concentrate."
          : "Fresh flow opened: clean water dilutes the wetland.",
    );
  }, [audio]);

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
  audio,
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
  const [projectile, setProjectile] = useState<{ x: number; y: number } | null>(null);
  const [launching, setLaunching] = useState(false);
  const launchTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState(
    "Plot one marked. Move the projected reticle into its soil ring.",
  );
  const solvedRef = useRef(false);
  const preview = prairieLanding(angle, power, config.wind);

  const aim = useCallback(
    (amount: number) => {
      setAngle((value) => clamp(value + amount, -35, 35));
      playQuestSound(audio, "move", amount > 0 ? 2 : 1);
    },
    [audio],
  );
  const charge = useCallback(
    (amount: number) => {
      setPower((value) => clamp(value + amount, 24, 96));
      playQuestSound(audio, "tension", amount > 0 ? 3 : 1);
    },
    [audio],
  );
  const launch = useCallback(() => {
    if (solvedRef.current || launching) return;
    const landing = prairieLanding(angle, power, config.wind),
      target = config.targets[targetIndex];
    const hit = prairieShotHits(landing, target);
    setLaunching(true);
    setProjectile(landing);
    setShots((value) => value + 1);
    setStatus("Seed pod away—read the arc and crosswind.");
    playQuestSound(audio, "launch");
    launchTimerRef.current = window.setTimeout(() => {
      setProjectile(null);
      setLaunching(false);
      setLastLanding(landing);
      playQuestSound(audio, "impact", hit ? 2 : 0);
      if (!hit) {
        const lateral = landing.x < target.x ? "left" : "right";
        const range = landing.y < target.y ? "short" : "long";
        setStatus(`Seed pod landed ${range} and ${lateral}. Correct the reticle and reload.`);
        return;
      }
      const next = targetIndex + 1;
      setTargetIndex(next);
      playQuestSound(audio, "success");
      setStatus(next === config.targets.length
        ? "Every bare plot erupts with native prairie seed."
        : `Plot ${targetIndex + 1} seeded. Plot ${next + 1} is now active.`);
      if (next === config.targets.length) {
        solvedRef.current = true;
        launchTimerRef.current = window.setTimeout(onSolved, 650);
      }
    }, 680);
  }, [angle, audio, config, launching, onSolved, power, targetIndex]);

  useEffect(() => () => {
    if (launchTimerRef.current !== null) window.clearTimeout(launchTimerRef.current);
  }, []);

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
      // Keep the full numbered soil ring and projected-reticle label inside
      // the field, even when a narrow phone renders an extreme manual shot.
      "--field-x": `${clamp(50 + point.x * 6.2, 12, 88)}%`,
      "--field-y": `${clamp(96 - point.y * 7, 10, 88)}%`,
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
        {projectile && (
          <div className={styles.seedProjectile} style={plotStyle(projectile)} aria-hidden="true"><i /></div>
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
        <button className={styles.launchButton} disabled={launching} onClick={launch} type="button">
          {launching ? "Pod in flight…" : "Launch seed pod"} <kbd>Enter</kbd>
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
  audio,
  onSolved,
}: {
  config: ZooSideQuestConfig;
  audio: PremiumAudioDirector;
  onSolved: () => void;
}) {
  switch (config.questId) {
    case "aviary-voices":
      return <FourVoices config={config} audio={audio} onSolved={onSolved} />;
    case "sea-lion-current":
      return <RideTheCurrent config={config} audio={audio} onSolved={onSolved} />;
    case "monkey-canopy-rig":
      return <CanopyRig config={config} audio={audio} onSolved={onSolved} />;
    case "zebra-stripe-scan":
      return <StripeScan config={config} audio={audio} onSolved={onSolved} />;
    case "red-panda-scent-wind":
      return <ScentOnTheWind config={config} audio={audio} onSolved={onSolved} />;
    case "tortoise-sun-trail":
      return <SunTrail config={config} audio={audio} onSolved={onSolved} />;
    case "flamingo-wetland-balance":
      return <WetlandBalance config={config} audio={audio} onSolved={onSolved} />;
    case "bison-prairie-seeding":
      return <PrairieSeeding config={config} audio={audio} onSolved={onSolved} />;
  }
}

const questSessionConfigs = new Map<ZooSideQuestId, ZooSideQuestConfig>();

function sessionConfig(questId: ZooSideQuestId) {
  const existing = questSessionConfigs.get(questId);
  if (existing) return existing;
  const created = createZooSideQuestConfig(questId);
  questSessionConfigs.set(questId, created);
  return created;
}

export function ZooSideQuestScreen({
  questId,
  audio,
  onComplete,
  onCancel,
}: ZooSideQuestScreenProps) {
  const metadata = ZOO_SIDE_QUESTS[questId];
  const config = useMemo(() => sessionConfig(questId), [questId]);
  const [completedQuest, setCompletedQuest] = useState<ZooSideQuestId | null>(
    null,
  );
  const completed = completedQuest === questId;
  const screenRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.body.classList.add("zoo-side-quest-open");
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const screen = screenRef.current;
    screen?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.code !== "Tab" || !screen) return;
      const focusable = [...screen.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      )].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (document.activeElement === screen) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus, true);
    return () => {
      window.removeEventListener("keydown", trapFocus, true);
      document.body.classList.remove("zoo-side-quest-open");
      previousFocus?.focus();
    };
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

  const solve = useCallback(() => {
    playQuestSound(audio, "success");
    setCompletedQuest(questId);
  }, [audio, questId]);
  return (
    <section
      aria-describedby="zoo-side-quest-brief"
      aria-labelledby="zoo-side-quest-title"
      aria-modal="true"
      className={`${styles.screen} ${styles[metadata.theme]} ${completed ? styles.completed : ""}`}
      data-side-quest={questId}
      ref={screenRef}
      role="dialog"
      tabIndex={-1}
      onPointerDown={() => void audio.unlock()}
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
        <QuestMechanic config={config} audio={audio} onSolved={solve} />
      </main>
      <aside className={styles.briefing}>
        <div>
          <span>Field brief</span>
          <p id="zoo-side-quest-brief">{metadata.instructions}</p>
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
