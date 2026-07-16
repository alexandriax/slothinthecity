export type AudioScene = "central-park" | "subway-station" | "moving-train" | "west-farms" | "finale";

export type FootstepSurface = "earth" | "wood" | "stone" | "metal" | "water";

export type TrainChimeKind = "arrival" | "doors-closing" | "transfer";

export type HawkAudioCue = "near" | "dive";

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
  ambienceGain: GainNode;
  sources: AudioScheduledSourceNode[];
};

const DEFAULT_MIX: AudioMix = { master: 0.78, music: 0.64, ambience: 0.58, sfx: 0.86 };

/**
 * The authored score is deliberately ordered here rather than selected by
 * scene. One continuous album now follows the player from Central Park to the
 * finale, then starts again at track 00 after track 11 ends.
 */
export const SOUNDTRACK_TRACKS = [
  "/audio/soundtrack/00.mp3",
  "/audio/soundtrack/01.mp3",
  "/audio/soundtrack/02.mp3",
  "/audio/soundtrack/03.mp3",
  "/audio/soundtrack/04.mp3",
  "/audio/soundtrack/05.mp3",
  "/audio/soundtrack/06.mp3",
  "/audio/soundtrack/07.mp3",
  "/audio/soundtrack/08.mp3",
  "/audio/soundtrack/09.mp3",
  "/audio/soundtrack/10.mp3",
  "/audio/soundtrack/11.mp3",
] as const;

/**
 * Pregenerated, deploy-safe recordings. These paths intentionally point at
 * checked-in files: the shipped game never needs an ElevenLabs or OpenAI key.
 */
export const AUTHORED_SFX = {
  cartMotor: "/audio/sfx/cart-motor-loop.mp3",
  hawkNear: "/audio/sfx/hawk-near-screech.mp3",
  hawkDive: "/audio/sfx/hawk-dive-pass.mp3",
} as const;

export const TRANSIT_ANNOUNCEMENTS = {
  fifth_n_platform: "/audio/announcements/fifth_n_platform.mp3",
  fifth_r_platform: "/audio/announcements/fifth_r_platform.mp3",
  fifth_n_boarding: "/audio/announcements/fifth_n_boarding.mp3",
  fifth_r_boarding: "/audio/announcements/fifth_r_boarding.mp3",
  lex_arrival_transfer: "/audio/announcements/lex_arrival_transfer.mp3",
  lex_5_platform: "/audio/announcements/lex_5_platform.mp3",
  lex_5_boarding: "/audio/announcements/lex_5_boarding.mp3",
  stop_86: "/audio/announcements/stop_86.mp3",
  stop_125: "/audio/announcements/stop_125.mp3",
  stop_e180: "/audio/announcements/stop_e180.mp3",
  west_farms_arrival: "/audio/announcements/west_farms_arrival.mp3",
  stand_clear_doors: "/audio/announcements/stand_clear_doors.mp3",
} as const;

export type TransitAnnouncement = keyof typeof TRANSIT_ANNOUNCEMENTS;

type QueuedAnnouncement = {
  cue: TransitAnnouncement;
  notBefore: number;
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
 * Streaming soundtrack, procedural ambience, and effects engine.
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
  private soundtrackElement: HTMLAudioElement | null = null;
  private soundtrackPreloadElement: HTMLAudioElement | null = null;
  private soundtrackSource: MediaElementAudioSourceNode | null = null;
  private soundtrackIndex = 0;
  private soundtrackFailures = 0;
  private soundtrackRecoveryTimer: number | null = null;
  private authoredBuffers = new Map<string, AudioBuffer>();
  private authoredLoads = new Map<string, Promise<AudioBuffer | null>>();
  private cartMotorSource: AudioBufferSourceNode | null = null;
  private cartMotorGain: GainNode | null = null;
  private cartMotorRequested = false;
  private cartMotorSpeed = 0;
  private cartMotorStarting = false;
  private hawkCueTimes = new Map<HawkAudioCue, number>();
  private announcementQueue: QueuedAnnouncement[] = [];
  private announcementSource: AudioBufferSourceNode | null = null;
  private announcementCue: TransitAnnouncement | null = null;
  private announcementLoading = false;
  private announcementTimer: number | null = null;
  private announcementGeneration = 0;
  private announcementCueTimes = new Map<TransitAnnouncement, number>();
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
      // Start both operations synchronously inside the gesture handler. This
      // keeps Safari/iOS and Chromium autoplay policies satisfied even when
      // resuming the Web Audio graph takes an asynchronous turn.
      const playback = this.playSoundtrack();
      const resume = context.state !== "running" ? context.resume() : Promise.resolve();
      await Promise.allSettled([playback, resume]);
      if (context.state === "running" && this.soundtrackElement?.paused) await this.playSoundtrack();
      this.setSnapshot({ unlocked: context.state === "running", suspended: context.state !== "running" });
      return context.state === "running";
    } catch {
      return false;
    }
  }

  async suspend() {
    if (!this.context || this.context.state !== "running") return;
    this.soundtrackElement?.pause();
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
      const gain = layer.ambienceGain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.0001, gain.value), now);
      gain.exponentialRampToValueAtTime(target, now + transition);
    }
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

  /**
   * Start, update, or stop the authored field-cart motor loop. Calling this
   * every frame is cheap: one source is retained and only its gain/rate ramps.
   */
  setCartMotor(active: boolean, speedMetersPerSecond = 0) {
    this.cartMotorRequested = active;
    this.cartMotorSpeed = Math.max(0, Math.abs(speedMetersPerSecond));
    if (!this.context || !this.sfxBus) return false;
    if (!active) {
      const source = this.cartMotorSource, gain = this.cartMotorGain;
      this.cartMotorSource = null; this.cartMotorGain = null;
      if (source && gain) {
        const now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(.0001, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(.0001, now + .18);
        try { source.stop(now + .2); } catch {}
      }
      return true;
    }
    if (this.cartMotorSource && this.cartMotorGain) {
      this.applyCartMotorMotion();
      return true;
    }
    if (!this.cartMotorStarting) void this.startCartMotor();
    return true;
  }

  /** Authored hawk calls with per-cue cooldowns so a frame loop cannot spam. */
  playHawkCue(kind: HawkAudioCue) {
    if (!this.context || !this.sfxBus) return false;
    const now = this.context.currentTime, minimumGap = kind === "dive" ? 3.6 : 8;
    if (now - (this.hawkCueTimes.get(kind) ?? -Infinity) < minimumGap) return false;
    this.hawkCueTimes.set(kind, now);
    const path = kind === "dive" ? AUTHORED_SFX.hawkDive : AUTHORED_SFX.hawkNear;
    void this.playAuthoredOneShot(path, kind === "dive" ? .9 : .68, kind === "dive" ? 1 : .96);
    return true;
  }

  /**
   * Queue a pregenerated transit announcement. Announcements are serialized,
   * duplicate-suppressed, and gently duck the score while the voice is active.
   */
  playTransitAnnouncement(cue: TransitAnnouncement, options: { delaySeconds?: number; dedupeSeconds?: number } = {}) {
    if (this.disposed) return false;
    const now = this.context?.currentTime ?? 0, dedupe = Math.max(0, options.dedupeSeconds ?? 10);
    if (now - (this.announcementCueTimes.get(cue) ?? -Infinity) < dedupe) return false;
    if (this.announcementCue === cue || this.announcementQueue.some(item => item.cue === cue)) return false;
    this.announcementCueTimes.set(cue, now);
    this.announcementQueue.push({ cue, notBefore: now + Math.max(0, options.delaySeconds ?? 0) });
    this.pumpAnnouncementQueue();
    return true;
  }

  cancelTransitAnnouncements() {
    this.announcementGeneration += 1;
    this.announcementQueue.length = 0;
    this.announcementLoading = false;
    if (this.announcementTimer !== null) window.clearTimeout(this.announcementTimer);
    this.announcementTimer = null;
    const source = this.announcementSource;
    this.announcementSource = null; this.announcementCue = null;
    if (source) { try { source.stop(); } catch {} }
    this.applyMix(.12);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.soundtrackRecoveryTimer !== null) window.clearTimeout(this.soundtrackRecoveryTimer);
    this.soundtrackRecoveryTimer = null;
    this.setCartMotor(false);
    this.cancelTransitAnnouncements();
    if (this.soundtrackElement) {
      this.soundtrackElement.pause();
      this.soundtrackElement.removeEventListener("ended", this.handleSoundtrackEnded);
      this.soundtrackElement.removeEventListener("error", this.handleSoundtrackError);
      this.soundtrackElement.removeAttribute("src");
      this.soundtrackElement.load();
    }
    if (this.soundtrackPreloadElement) {
      this.soundtrackPreloadElement.removeAttribute("src");
      this.soundtrackPreloadElement.load();
    }
    this.soundtrackSource?.disconnect();
    this.soundtrackSource = null;
    this.soundtrackElement = null;
    this.soundtrackPreloadElement = null;
    for (const layer of this.layers.values()) {
      for (const source of layer.sources) {
        try { source.stop(); } catch { /* The source may already have ended. */ }
      }
    }
    this.layers.clear();
    this.authoredBuffers.clear();
    this.authoredLoads.clear();
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
    this.createSoundtrack(context);
    for (const scene of ["central-park", "subway-station", "moving-train", "west-farms", "finale"] satisfies AudioScene[]) this.layers.set(scene, this.createSceneLayer(scene));
    this.applyMix(0.01);
    this.setScene(this.snapshot.scene, { transitionSeconds: 0.12, intensity: this.snapshot.intensity });
    if (this.cartMotorRequested) void this.startCartMotor();
    this.pumpAnnouncementQueue();
    context.addEventListener("statechange", () => {
      // `unlocked` records that the user has granted playback once; it must
      // survive an OS/browser suspension so returning to a mobile tab resumes
      // the same track instead of leaving the album permanently paused.
      const hasBeenUnlocked = this.snapshot.unlocked;
      if (context.state === "running" && hasBeenUnlocked) void this.playSoundtrack();
      else if (context.state !== "running") this.soundtrackElement?.pause();
      this.setSnapshot({ unlocked: hasBeenUnlocked || context.state === "running", suspended: context.state === "suspended" });
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

  private handleSoundtrackEnded = () => {
    this.soundtrackFailures = 0;
    this.advanceSoundtrack();
  };

  private handleSoundtrackError = () => {
    if (this.disposed || this.soundtrackFailures >= SOUNDTRACK_TRACKS.length - 1) return;
    this.soundtrackFailures += 1;
    if (this.soundtrackRecoveryTimer !== null) window.clearTimeout(this.soundtrackRecoveryTimer);
    this.soundtrackRecoveryTimer = window.setTimeout(() => {
      this.soundtrackRecoveryTimer = null;
      this.advanceSoundtrack();
    }, 300);
  };

  private createSoundtrack(context: AudioContext) {
    if (typeof Audio === "undefined" || !this.musicBus || this.soundtrackElement) return;
    const element = new Audio();
    element.preload = "auto";
    element.loop = false;
    element.addEventListener("ended", this.handleSoundtrackEnded);
    element.addEventListener("error", this.handleSoundtrackError);
    this.soundtrackElement = element;
    this.soundtrackSource = context.createMediaElementSource(element);
    this.soundtrackSource.connect(this.musicBus);
    this.loadSoundtrack(0);
  }

  private loadAuthoredBuffer(path: string) {
    const cached = this.authoredBuffers.get(path);
    if (cached) return Promise.resolve(cached);
    const pending = this.authoredLoads.get(path);
    if (pending) return pending;
    const context = this.context;
    if (!context || typeof fetch === "undefined") return Promise.resolve(null);
    const request = fetch(path)
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Audio ${response.status}`)))
      .then(data => context.decodeAudioData(data.slice(0)))
      .then(buffer => {
        if (!this.disposed && this.context === context) this.authoredBuffers.set(path, buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => this.authoredLoads.delete(path));
    this.authoredLoads.set(path, request);
    return request;
  }

  private async playAuthoredOneShot(path: string, level: number, playbackRate = 1) {
    const context = this.context, output = this.sfxBus;
    if (!context || !output || this.disposed) return false;
    const buffer = await this.loadAuthoredBuffer(path);
    if (!buffer || this.context !== context || this.disposed) return false;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = playbackRate; gain.gain.value = clamp01(level);
    source.connect(gain).connect(output); source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    return true;
  }

  private async startCartMotor() {
    if (this.cartMotorStarting) return;
    this.cartMotorStarting = true;
    const context = this.context;
    const buffer = await this.loadAuthoredBuffer(AUTHORED_SFX.cartMotor);
    this.cartMotorStarting = false;
    if (!context || !buffer || this.context !== context || !this.sfxBus || !this.cartMotorRequested || this.disposed || this.cartMotorSource) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.loop = true; gain.gain.value = .0001;
    source.connect(gain).connect(this.sfxBus); source.start();
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (this.cartMotorSource === source) { this.cartMotorSource = null; this.cartMotorGain = null; }
    };
    this.cartMotorSource = source; this.cartMotorGain = gain;
    this.applyCartMotorMotion();
  }

  private applyCartMotorMotion() {
    if (!this.context || !this.cartMotorSource || !this.cartMotorGain) return;
    const now = this.context.currentTime, amount = clamp01(this.cartMotorSpeed / 6.5);
    this.cartMotorSource.playbackRate.setTargetAtTime(.78 + amount * .58, now, .11);
    this.cartMotorGain.gain.setTargetAtTime(.045 + amount * .17, now, .08);
  }

  private pumpAnnouncementQueue() {
    if (this.announcementSource || this.announcementLoading || this.announcementTimer !== null || this.disposed || !this.context || !this.sfxBus) return;
    const next = this.announcementQueue.shift();
    if (!next) return;
    const wait = Math.max(0, next.notBefore - this.context.currentTime);
    if (wait > .015) {
      this.announcementTimer = window.setTimeout(() => {
        this.announcementTimer = null;
        this.announcementQueue.unshift(next);
        this.pumpAnnouncementQueue();
      }, wait * 1000);
      return;
    }
    const generation = this.announcementGeneration;
    this.announcementLoading = true;
    void this.loadAuthoredBuffer(TRANSIT_ANNOUNCEMENTS[next.cue]).then(buffer => {
      if (generation !== this.announcementGeneration) return;
      this.announcementLoading = false;
      if (!buffer || this.disposed || !this.context || !this.sfxBus) { this.pumpAnnouncementQueue(); return; }
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = .94; source.connect(gain).connect(this.sfxBus);
      this.announcementSource = source; this.announcementCue = next.cue;
      this.applyMix(.16); source.start();
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (this.announcementSource === source) { this.announcementSource = null; this.announcementCue = null; }
        this.applyMix(.24); this.pumpAnnouncementQueue();
      };
    });
  }

  private loadSoundtrack(index: number) {
    if (!this.soundtrackElement) return;
    this.soundtrackIndex = (index + SOUNDTRACK_TRACKS.length) % SOUNDTRACK_TRACKS.length;
    this.soundtrackElement.src = SOUNDTRACK_TRACKS[this.soundtrackIndex];
    this.soundtrackElement.load();
    this.preloadNextSoundtrack();
  }

  private preloadNextSoundtrack() {
    if (typeof Audio === "undefined" || this.disposed) return;
    if (this.soundtrackPreloadElement) {
      this.soundtrackPreloadElement.removeAttribute("src");
      this.soundtrackPreloadElement.load();
    }
    const preload = new Audio();
    preload.preload = "auto";
    preload.src = SOUNDTRACK_TRACKS[(this.soundtrackIndex + 1) % SOUNDTRACK_TRACKS.length];
    preload.load();
    this.soundtrackPreloadElement = preload;
  }

  private advanceSoundtrack() {
    this.loadSoundtrack(this.soundtrackIndex + 1);
    if (this.snapshot.unlocked) void this.playSoundtrack();
  }

  private async playSoundtrack() {
    if (!this.soundtrackElement || this.disposed) return false;
    if (!this.soundtrackElement.paused) return true;
    try {
      await this.soundtrackElement.play();
      this.soundtrackFailures = 0;
      return true;
    } catch {
      // Autoplay rejection is expected before the first real gesture. The
      // armed pointer/touch/key listeners will retry without losing position.
      return false;
    }
  }

  private createSceneLayer(scene: AudioScene): SceneLayer {
    const context = this.context!, ambienceGain = context.createGain();
    ambienceGain.gain.value = scene === this.snapshot.scene ? 1 : 0.0001;
    ambienceGain.connect(this.ambienceBus!);
    const sources: AudioScheduledSourceNode[] = [];
    const addAir = (frequency: number, volume: number, type: BiquadFilterType = "lowpass") => {
      if (!this.noiseBuffer) return;
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), level = context.createGain();
      source.buffer = this.noiseBuffer; source.loop = true; filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.65; level.gain.value = volume;
      source.connect(filter).connect(level).connect(ambienceGain); source.start(); sources.push(source);
    };
    if (scene === "central-park") addAir(760, 0.027, "lowpass");
    if (scene === "subway-station") addAir(1250, 0.019, "bandpass");
    if (scene === "moving-train") addAir(520, 0.035, "bandpass");
    if (scene === "west-farms") addAir(980, 0.023, "highpass");
    if (scene === "finale") addAir(820, 0.018, "lowpass");
    return { ambienceGain, sources };
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
    ramp(this.musicBus, equalPower(this.snapshot.music) * (this.announcementSource ? .38 : 1));
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
