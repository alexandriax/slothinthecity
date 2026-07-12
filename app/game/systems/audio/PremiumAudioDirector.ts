export type AudioScene = "central-park" | "subway-station" | "moving-train" | "west-farms" | "finale";

export type FootstepSurface = "earth" | "wood" | "stone" | "metal" | "water";

export type TrainChimeKind = "arrival" | "doors-closing" | "transfer";

export type AudioMix = {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
};

export type AudioDirectorSnapshot = AudioMix & {
  scene: AudioScene;
  intensity: number;
  muted: boolean;
  unlocked: boolean;
  suspended: boolean;
};

type SnapshotListener = (snapshot: AudioDirectorSnapshot) => void;

type ToneOptions = {
  attack?: number;
  duration?: number;
  gain?: number;
  release?: number;
  type?: OscillatorType;
  filter?: number;
  pan?: number;
};

type NoiseOptions = {
  duration?: number;
  gain?: number;
  frequency?: number;
  q?: number;
  type?: BiquadFilterType;
  pan?: number;
};

type SceneLayer = {
  musicGain: GainNode;
  ambienceGain: GainNode;
  sources: AudioScheduledSourceNode[];
};

const DEFAULT_MIX: AudioMix = { master: 0.78, music: 0.64, ambience: 0.58, sfx: 0.86 };

const SCENE_TEMPO: Record<AudioScene, number> = {
  "central-park": 72,
  "subway-station": 84,
  "moving-train": 112,
  "west-farms": 76,
  finale: 92,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function equalPower(value: number) {
  return clamp01(value) ** 1.72;
}

function audioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

/**
 * A zero-download, procedural score and effects engine for Sloth Park.
 *
 * The director deliberately does not create an AudioContext until `unlock()` is
 * called from a click/touch/key handler. Worlds may call `setScene()` before
 * that point; the requested scene is remembered and starts after the gesture.
 */
export class PremiumAudioDirector {
  private context: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private layers = new Map<AudioScene, SceneLayer>();
  private listeners = new Set<SnapshotListener>();
  private scheduler: number | null = null;
  private nextStepAt = 0;
  private step = 0;
  private lastFootstepAt = -1;
  private disposed = false;
  private snapshot: AudioDirectorSnapshot = {
    ...DEFAULT_MIX,
    scene: "central-park",
    intensity: 0.5,
    muted: false,
    unlocked: false,
    suspended: false,
  };

  getSnapshot = () => this.snapshot;

  subscribe = (listener: SnapshotListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Attach autoplay-safe listeners. Returns a cleanup function. */
  armForUserGesture(target?: EventTarget) {
    const gestureTarget = target ?? (typeof document !== "undefined" ? document : null);
    if (!gestureTarget || this.disposed || this.snapshot.unlocked) return () => undefined;
    let active = true;
    const cleanup = () => {
      if (!active) return;
      active = false;
      gestureTarget.removeEventListener("pointerdown", activate);
      gestureTarget.removeEventListener("touchend", activate);
      gestureTarget.removeEventListener("keydown", activate);
    };
    const activate = () => {
      void this.unlock().then((unlocked) => {
        if (unlocked) cleanup();
      });
    };
    gestureTarget.addEventListener("pointerdown", activate, { passive: true });
    gestureTarget.addEventListener("touchend", activate, { passive: true });
    gestureTarget.addEventListener("keydown", activate);
    return cleanup;
  }

  /** Call synchronously inside a user gesture whenever possible. */
  async unlock() {
    if (this.disposed) return false;
    const context = this.ensureContext();
    if (!context) return false;
    try {
      if (context.state !== "running") await context.resume();
      this.startScheduler();
      this.setSnapshot({ unlocked: context.state === "running", suspended: context.state !== "running" });
      return context.state === "running";
    } catch {
      return false;
    }
  }

  async suspend() {
    if (!this.context || this.context.state !== "running") return;
    await this.context.suspend();
    this.setSnapshot({ suspended: true });
  }

  setScene(scene: AudioScene, options: { transitionSeconds?: number; intensity?: number } = {}) {
    const intensity = clamp01(options.intensity ?? this.snapshot.intensity);
    this.setSnapshot({ scene, intensity });
    if (!this.context) return;
    const now = this.context.currentTime;
    const transition = Math.max(0.15, options.transitionSeconds ?? 2.4);
    for (const [id, layer] of this.layers) {
      const target = id === scene ? 0.88 + intensity * 0.12 : 0.0001;
      for (const gain of [layer.musicGain.gain, layer.ambienceGain.gain]) {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(Math.max(0.0001, gain.value), now);
        gain.exponentialRampToValueAtTime(target, now + transition);
      }
    }
    this.nextStepAt = now + 0.04;
    this.step = 0;
  }

  setIntensity(intensity: number) {
    this.setSnapshot({ intensity: clamp01(intensity) });
  }

  setMasterVolume(value: number) {
    this.setSnapshot({ master: clamp01(value) });
    this.applyMix();
  }

  setMusicVolume(value: number) {
    this.setSnapshot({ music: clamp01(value) });
    this.applyMix();
  }

  setAmbienceVolume(value: number) {
    this.setSnapshot({ ambience: clamp01(value) });
    this.applyMix();
  }

  setSfxVolume(value: number) {
    this.setSnapshot({ sfx: clamp01(value) });
    this.applyMix();
  }

  setMuted(muted: boolean) {
    this.setSnapshot({ muted });
    this.applyMix(0.08);
  }

  toggleMuted() {
    this.setMuted(!this.snapshot.muted);
  }

  playTrainChime(kind: TrainChimeKind = "arrival") {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    const notes = kind === "doors-closing" ? [659.25, 523.25] : kind === "transfer" ? [392, 493.88, 587.33] : [523.25, 659.25];
    notes.forEach((frequency, index) => this.tone(this.sfxBus!, frequency, now + index * 0.22, { type: "sine", gain: 0.15, attack: 0.012, duration: 0.34, release: 0.28, filter: 2600 }));
    return true;
  }

  playTrainDoors(direction: "open" | "close") {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    this.noise(this.sfxBus, now, { duration: direction === "open" ? 0.62 : 0.78, gain: 0.13, frequency: direction === "open" ? 1450 : 980, q: 1.2, type: "bandpass" });
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(direction === "open" ? 310 : 210, now);
    oscillator.frequency.exponentialRampToValueAtTime(direction === "open" ? 165 : 420, now + 0.52);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    oscillator.connect(gain).connect(this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + 0.64);
    return true;
  }

  playTrainArrival(intensity = 0.8) {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    const amount = 0.55 + clamp01(intensity) * 0.45;
    this.noise(this.sfxBus, now, { duration: 2.2, gain: 0.18 * amount, frequency: 1250, q: 4.8, type: "bandpass", pan: -0.25 });
    this.noise(this.sfxBus, now + 0.1, { duration: 1.8, gain: 0.14 * amount, frequency: 120, q: 0.7, type: "lowpass", pan: 0.22 });
    this.tone(this.sfxBus, 48, now, { type: "sawtooth", gain: 0.09 * amount, attack: 0.08, duration: 1.8, release: 0.55, filter: 150 });
    window.setTimeout(() => this.playTrainChime("arrival"), 1220);
    return true;
  }

  playCrowdBed(intensity = 0.5, duration = 2.6) {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    const amount = 0.35 + clamp01(intensity) * 0.65;
    this.noise(this.sfxBus, now, { duration, gain: 0.075 * amount, frequency: 720, q: 0.55, type: "bandpass" });
    [118, 147, 179, 211].forEach((frequency, index) => {
      this.tone(this.sfxBus!, frequency, now + index * 0.07, { type: index % 2 ? "triangle" : "sine", gain: 0.018 * amount, attack: 0.18, duration: duration - 0.2, release: 0.55, filter: 520, pan: -0.8 + index * 0.52 });
    });
    return true;
  }

  playFootstep(surface: FootstepSurface = "earth", effort = 0.5) {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    if (now - this.lastFootstepAt < 0.075) return false;
    this.lastFootstepAt = now;
    const amount = 0.55 + clamp01(effort) * 0.45;
    const profile: Record<FootstepSurface, { frequency: number; gain: number; tone: number }> = {
      earth: { frequency: 430, gain: 0.09, tone: 74 },
      wood: { frequency: 920, gain: 0.075, tone: 132 },
      stone: { frequency: 1450, gain: 0.07, tone: 186 },
      metal: { frequency: 2200, gain: 0.065, tone: 285 },
      water: { frequency: 1250, gain: 0.085, tone: 92 },
    };
    const selected = profile[surface];
    this.noise(this.sfxBus, now, { duration: surface === "water" ? 0.28 : 0.13, gain: selected.gain * amount, frequency: selected.frequency, q: 0.8, type: "bandpass", pan: Math.random() * 0.28 - 0.14 });
    this.tone(this.sfxBus, selected.tone, now, { type: "sine", gain: 0.04 * amount, attack: 0.004, duration: 0.1, release: 0.08, filter: 580 });
    return true;
  }

  playQuestComplete() {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    [293.66, 369.99, 440, 587.33].forEach((frequency, index) => this.tone(this.sfxBus!, frequency, now + index * 0.115, { type: "triangle", gain: 0.13, attack: 0.01, duration: 0.5, release: 0.45, filter: 2400, pan: -0.35 + index * 0.23 }));
    return true;
  }

  playFailure() {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    [293.66, 246.94, 196, 146.83].forEach((frequency, index) => this.tone(this.sfxBus!, frequency, now + index * 0.145, { type: "triangle", gain: 0.105, attack: 0.015, duration: 0.4, release: 0.32, filter: 1350 }));
    this.noise(this.sfxBus, now + 0.32, { duration: 0.7, gain: 0.045, frequency: 360, q: 0.9, type: "lowpass" });
    return true;
  }

  playUiConfirm() {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime;
    this.tone(this.sfxBus, 660, now, { type: "sine", gain: 0.065, attack: 0.005, duration: 0.13, release: 0.09, filter: 2800 });
    this.tone(this.sfxBus, 880, now + 0.07, { type: "sine", gain: 0.05, attack: 0.005, duration: 0.14, release: 0.1, filter: 3200 });
    return true;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    for (const layer of this.layers.values()) {
      for (const source of layer.sources) {
        try { source.stop(); } catch { /* The source may already have ended. */ }
      }
    }
    this.layers.clear();
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    this.listeners.clear();
  }

  private ensureContext() {
    if (this.context) return this.context;
    const Constructor = audioContextConstructor();
    if (!Constructor || this.disposed) return null;
    const context = new Constructor({ latencyHint: "interactive" });
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 16;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;
    const master = context.createGain(), music = context.createGain(), ambience = context.createGain(), sfx = context.createGain();
    music.connect(master); ambience.connect(master); sfx.connect(master); master.connect(compressor).connect(context.destination);
    this.masterBus = master; this.musicBus = music; this.ambienceBus = ambience; this.sfxBus = sfx; this.compressor = compressor;
    this.noiseBuffer = this.makeNoiseBuffer(context);
    for (const scene of Object.keys(SCENE_TEMPO) as AudioScene[]) this.layers.set(scene, this.createSceneLayer(scene));
    this.applyMix(0.01);
    this.setScene(this.snapshot.scene, { transitionSeconds: 0.12, intensity: this.snapshot.intensity });
    context.addEventListener("statechange", () => {
      this.setSnapshot({ unlocked: context.state === "running", suspended: context.state === "suspended" });
    });
    return context;
  }

  private makeNoiseBuffer(context: AudioContext) {
    const length = Math.floor(context.sampleRate * 2.4);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x51_07_4;
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = seed / 0xffffffff * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      data[index] = previous * 0.8 + white * 0.2;
    }
    return buffer;
  }

  private createSceneLayer(scene: AudioScene): SceneLayer {
    const context = this.context!, musicGain = context.createGain(), ambienceGain = context.createGain();
    musicGain.gain.value = ambienceGain.gain.value = scene === this.snapshot.scene ? 1 : 0.0001;
    musicGain.connect(this.musicBus!); ambienceGain.connect(this.ambienceBus!);
    const sources: AudioScheduledSourceNode[] = [];
    const addDrone = (frequency: number, volume: number, type: OscillatorType, cutoff: number) => {
      const oscillator = context.createOscillator(), filter = context.createBiquadFilter(), level = context.createGain();
      oscillator.type = type; oscillator.frequency.value = frequency; filter.type = "lowpass"; filter.frequency.value = cutoff; filter.Q.value = 0.5; level.gain.value = volume;
      oscillator.connect(filter).connect(level).connect(musicGain); oscillator.start(); sources.push(oscillator);
    };
    const addAir = (frequency: number, volume: number, type: BiquadFilterType = "lowpass") => {
      if (!this.noiseBuffer) return;
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), level = context.createGain();
      source.buffer = this.noiseBuffer; source.loop = true; filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.65; level.gain.value = volume;
      source.connect(filter).connect(level).connect(ambienceGain); source.start(); sources.push(source);
    };
    if (scene === "central-park") { addDrone(73.42, 0.012, "sine", 360); addDrone(110, 0.008, "triangle", 520); addAir(760, 0.027, "lowpass"); }
    if (scene === "subway-station") { addDrone(60, 0.018, "sine", 240); addDrone(120, 0.006, "triangle", 310); addAir(1250, 0.019, "bandpass"); }
    if (scene === "moving-train") { addDrone(48, 0.022, "sawtooth", 180); addDrone(96, 0.008, "square", 260); addAir(520, 0.035, "bandpass"); }
    if (scene === "west-farms") { addDrone(82.41, 0.011, "sine", 380); addDrone(123.47, 0.006, "triangle", 440); addAir(980, 0.023, "highpass"); }
    if (scene === "finale") { addDrone(98, 0.013, "sine", 500); addDrone(146.83, 0.009, "triangle", 680); addAir(820, 0.018, "lowpass"); }
    return { musicGain, ambienceGain, sources };
  }

  private startScheduler() {
    if (!this.context || this.scheduler !== null) return;
    this.nextStepAt = this.context.currentTime + 0.06;
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 35);
  }

  private scheduleMusic() {
    const context = this.context, layer = this.layers.get(this.snapshot.scene);
    if (!context || context.state !== "running" || !layer) return;
    const secondsPerStep = 60 / SCENE_TEMPO[this.snapshot.scene] / 2;
    const horizon = context.currentTime + 0.18;
    while (this.nextStepAt < horizon) {
      this.scheduleSceneStep(this.snapshot.scene, layer.musicGain, this.step, this.nextStepAt);
      this.step += 1;
      this.nextStepAt += secondsPerStep;
    }
  }

  private scheduleSceneStep(scene: AudioScene, output: AudioNode, step: number, at: number) {
    const intensity = this.snapshot.intensity;
    if (scene === "central-park") {
      const melody = [293.66, 0, 369.99, 0, 440, 0, 369.99, 329.63, 0, 293.66, 246.94, 0, 293.66, 0, 220, 0];
      const note = melody[step % melody.length];
      if (note) this.tone(output, note, at, { type: "triangle", gain: 0.028 + intensity * 0.012, attack: 0.045, duration: 0.7, release: 0.48, filter: 1700, pan: Math.sin(step * 1.7) * 0.35 });
      if (step % 8 === 0) this.tone(output, step % 16 === 0 ? 146.83 : 110, at, { type: "sine", gain: 0.045, attack: 0.08, duration: 1.5, release: 0.8, filter: 420 });
      if (step % 12 === 7) this.birdCall(output, at);
    } else if (scene === "subway-station") {
      const notes = [146.83, 0, 0, 220, 0, 164.81, 0, 0, 196, 0, 0, 246.94, 0, 164.81, 0, 0];
      const note = notes[step % notes.length];
      if (note) this.tone(output, note, at, { type: "triangle", gain: 0.035, attack: 0.008, duration: 0.42, release: 0.35, filter: 1150, pan: step % 4 < 2 ? -0.42 : 0.42 });
      if (step % 4 === 0) this.noise(output, at, { duration: 0.11, gain: 0.016 + intensity * 0.012, frequency: 1280, q: 3.2, type: "bandpass", pan: Math.sin(step) * 0.6 });
    } else if (scene === "moving-train") {
      if (step % 2 === 0) this.noise(output, at, { duration: 0.085, gain: 0.038 + intensity * 0.025, frequency: step % 4 === 0 ? 190 : 410, q: 0.8, type: "bandpass", pan: step % 4 === 0 ? -0.28 : 0.28 });
      if (step % 4 === 0) this.tone(output, step % 8 === 0 ? 73.42 : 82.41, at, { type: "sine", gain: 0.055, attack: 0.008, duration: 0.24, release: 0.18, filter: 280 });
      const motif = [293.66, 329.63, 369.99, 440];
      if (step % 8 === 6) this.tone(output, motif[Math.floor(step / 8) % motif.length], at, { type: "triangle", gain: 0.027, attack: 0.02, duration: 0.5, release: 0.4, filter: 1450 });
    } else if (scene === "west-farms") {
      const notes = [246.94, 293.66, 369.99, 329.63, 293.66, 220, 246.94, 196];
      if (step % 2 === 0) this.tone(output, notes[(step / 2) % notes.length], at, { type: "sine", gain: 0.035, attack: 0.028, duration: 0.62, release: 0.52, filter: 1900, pan: Math.sin(step * 0.7) * 0.48 });
      if (step % 8 === 0) this.tone(output, step % 16 === 0 ? 123.47 : 146.83, at, { type: "triangle", gain: 0.032, attack: 0.1, duration: 1.35, release: 0.7, filter: 620 });
    } else {
      const arpeggio = [293.66, 369.99, 440, 587.33, 329.63, 392, 493.88, 659.25];
      const note = arpeggio[step % arpeggio.length];
      this.tone(output, note, at, { type: "triangle", gain: 0.038 + intensity * 0.015, attack: 0.025, duration: 0.58, release: 0.48, filter: 2200, pan: Math.sin(step * 0.8) * 0.42 });
      if (step % 8 === 0) this.tone(output, step % 16 === 0 ? 146.83 : 196, at, { type: "sine", gain: 0.052, attack: 0.12, duration: 1.5, release: 0.85, filter: 520 });
    }
  }

  private birdCall(output: AudioNode, at: number) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain(), pan = this.context.createStereoPanner();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1480, at);
    oscillator.frequency.exponentialRampToValueAtTime(2340, at + 0.07);
    oscillator.frequency.exponentialRampToValueAtTime(1760, at + 0.18);
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.025, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    pan.pan.value = Math.sin(this.step * 2.13) * 0.72;
    oscillator.connect(gain).connect(pan).connect(output); oscillator.start(at); oscillator.stop(at + 0.28);
  }

  private tone(output: AudioNode, frequency: number, at: number, options: ToneOptions = {}) {
    if (!this.context) return;
    const attack = Math.max(0.003, options.attack ?? 0.012), duration = Math.max(attack + 0.02, options.duration ?? 0.3), release = Math.max(0.025, options.release ?? 0.2);
    const oscillator = this.context.createOscillator(), filter = this.context.createBiquadFilter(), gain = this.context.createGain(), panner = this.context.createStereoPanner();
    oscillator.type = options.type ?? "sine"; oscillator.frequency.value = frequency;
    filter.type = "lowpass"; filter.frequency.value = options.filter ?? 2200; filter.Q.value = 0.45;
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain ?? 0.08), at + attack); gain.gain.setValueAtTime(Math.max(0.0002, (options.gain ?? 0.08) * 0.72), at + duration); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + release);
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
    oscillator.connect(filter).connect(gain).connect(panner).connect(output); oscillator.start(at); oscillator.stop(at + duration + release + 0.02);
  }

  private noise(output: AudioNode, at: number, options: NoiseOptions = {}) {
    if (!this.context || !this.noiseBuffer) return;
    const duration = Math.max(0.04, options.duration ?? 0.24), source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain(), panner = this.context.createStereoPanner();
    source.buffer = this.noiseBuffer; filter.type = options.type ?? "bandpass"; filter.frequency.value = options.frequency ?? 900; filter.Q.value = options.q ?? 0.8;
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain ?? 0.08), at + Math.min(0.025, duration * 0.25)); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
    source.connect(filter).connect(gain).connect(panner).connect(output); source.start(at); source.stop(at + duration + 0.02);
  }

  private applyMix(rampSeconds = 0.14) {
    if (!this.context || !this.masterBus || !this.musicBus || !this.ambienceBus || !this.sfxBus) return;
    const now = this.context.currentTime;
    const ramp = (node: GainNode, target: number) => {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(target, now + rampSeconds);
    };
    ramp(this.masterBus, this.snapshot.muted ? 0 : equalPower(this.snapshot.master));
    ramp(this.musicBus, equalPower(this.snapshot.music));
    ramp(this.ambienceBus, equalPower(this.snapshot.ambience));
    ramp(this.sfxBus, equalPower(this.snapshot.sfx));
  }

  private setSnapshot(update: Partial<AudioDirectorSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export function createPremiumAudioDirector(initial?: Partial<AudioMix> & { scene?: AudioScene; muted?: boolean }) {
  const director = new PremiumAudioDirector();
  if (initial?.master !== undefined) director.setMasterVolume(initial.master);
  if (initial?.music !== undefined) director.setMusicVolume(initial.music);
  if (initial?.ambience !== undefined) director.setAmbienceVolume(initial.ambience);
  if (initial?.sfx !== undefined) director.setSfxVolume(initial.sfx);
  if (initial?.muted !== undefined) director.setMuted(initial.muted);
  if (initial?.scene) director.setScene(initial.scene, { transitionSeconds: 0.1 });
  return director;
}
