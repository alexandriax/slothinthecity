export type QualityLevel = "low" | "medium" | "high" | "ultra";
export type QualityMode = "auto" | QualityLevel;

export type QualityProfile = {
  level: QualityLevel;
  label: string;
  pixelRatioCap: number;
  pixelBudget: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  softShadows: boolean;
  postProcessing: boolean;
  ambientOcclusion: boolean;
  foliageDensity: number;
  npcDensity: number;
  particles: number;
  textureAnisotropy: number;
  textureScale: number;
  reflectionScale: number;
  motionScale: number;
};

export type DeviceProfile = {
  cores: number;
  memoryGb: number | null;
  devicePixelRatio: number;
  mobile: boolean;
  touch: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  webGpu: boolean;
  viewportPixels: number;
};

export type QualitySnapshot = {
  mode: QualityMode;
  activeLevel: QualityLevel;
  profile: QualityProfile;
  device: DeviceProfile;
  averageFps: number | null;
  targetFps: number;
  adapting: boolean;
  reason: string;
};

export type RenderBudget = QualityProfile & {
  pixelRatio: number;
  reducedMotion: boolean;
  targetFps: number;
};

type QualityListener = (snapshot: QualitySnapshot) => void;

// Keep the v2 key so an explicit player choice survives this change. When no
// choice has been saved, Auto now performs the requested first-run selection.
const STORAGE_KEY = "slothpark-quality-mode-v2";
const LEVELS: QualityLevel[] = ["low", "medium", "high", "ultra"];

export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> = {
  low: {
    level: "low", label: "Performance", pixelRatioCap: 1, pixelBudget: 720_000, antialias: false,
    shadows: false, shadowMapSize: 512, softShadows: false, postProcessing: false, ambientOcclusion: false,
    foliageDensity: 0.48, npcDensity: 0.5, particles: 0.35, textureAnisotropy: 2, textureScale: 0.55,
    reflectionScale: 0.35, motionScale: 0.65,
  },
  medium: {
    level: "medium", label: "Balanced", pixelRatioCap: 1.15, pixelBudget: 1_300_000, antialias: true,
    shadows: true, shadowMapSize: 1024, softShadows: false, postProcessing: false, ambientOcclusion: false,
    foliageDensity: 0.72, npcDensity: 0.72, particles: 0.62, textureAnisotropy: 4, textureScale: 0.78,
    reflectionScale: 0.55, motionScale: 0.82,
  },
  high: {
    level: "high", label: "High", pixelRatioCap: 1.5, pixelBudget: 2_300_000, antialias: true,
    shadows: true, shadowMapSize: 2048, softShadows: true, postProcessing: true, ambientOcclusion: true,
    foliageDensity: 1, npcDensity: 1, particles: 1, textureAnisotropy: 8, textureScale: 1,
    reflectionScale: 0.8, motionScale: 1,
  },
  ultra: {
    level: "ultra", label: "Ultra", pixelRatioCap: 2, pixelBudget: 4_200_000, antialias: true,
    shadows: true, shadowMapSize: 4096, softShadows: true, postProcessing: true, ambientOcclusion: true,
    foliageDensity: 1.22, npcDensity: 1.2, particles: 1.3, textureAnisotropy: 16, textureScale: 1.25,
    reflectionScale: 1, motionScale: 1,
  },
};

const isBrowser = () => typeof window !== "undefined" && typeof navigator !== "undefined";

function qualityMode(value: string | null): value is QualityMode {
  return value === "auto" || LEVELS.includes(value as QualityLevel);
}

function detectDevice(): DeviceProfile {
  if (!isBrowser()) return { cores: 4, memoryGb: null, devicePixelRatio: 1, mobile: false, touch: false, reducedMotion: false, saveData: false, webGpu: false, viewportPixels: 1_440_000 };
  const extendedNavigator = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const mobile = coarsePointer || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return {
    cores: Math.max(1, navigator.hardwareConcurrency || 4),
    memoryGb: extendedNavigator.deviceMemory ?? null,
    devicePixelRatio: Math.max(1, window.devicePixelRatio || 1),
    mobile,
    touch: (navigator.maxTouchPoints ?? 0) > 0 || coarsePointer,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    saveData: extendedNavigator.connection?.saveData ?? false,
    webGpu: "gpu" in navigator,
    viewportPixels: Math.max(1, window.innerWidth * window.innerHeight),
  };
}

export function recommendQualityLevel(device: DeviceProfile): { level: QualityLevel; reason: string } {
  let score = 0;
  score += device.cores >= 10 ? 3 : device.cores >= 8 ? 2 : device.cores >= 6 ? 1 : device.cores <= 3 ? -2 : 0;
  if (device.memoryGb !== null) score += device.memoryGb >= 8 ? 2 : device.memoryGb >= 6 ? 1 : device.memoryGb <= 3 ? -2 : 0;
  // WebGPU availability does not indicate faster rendering here because the
  // game currently uses WebGL. Avoid promoting every modern Safari device on
  // a capability that this renderer cannot consume.
  if (device.mobile) score -= 2;
  if (device.saveData) score -= 3;
  if (device.reducedMotion) score -= 1;
  if (device.viewportPixels * device.devicePixelRatio ** 2 > 4_500_000) score -= 1;
  if (score >= 5 && !device.mobile) return { level: "ultra", reason: "High-end desktop capability detected" };
  if (score >= 2) return { level: "high", reason: "High detail fits this device" };
  if (score >= -2) return { level: "medium", reason: device.mobile ? "Balanced for mobile play" : "Balanced for this device" };
  return { level: "low", reason: device.saveData ? "Data-saver mode detected" : "Prioritizing a stable frame rate" };
}

function loadMode(): QualityMode {
  if (!isBrowser()) return "auto";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return qualityMode(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

function stepLevel(level: QualityLevel, direction: -1 | 1) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, LEVELS.indexOf(level) + direction))];
}

/** Runtime quality selection with conservative FPS hysteresis for stable visuals. */
export class AdaptiveQualityManager {
  private listeners = new Set<QualityListener>();
  private frameDurations: number[] = [];
  private lastFrameAt = 0;
  private lastAdaptedAt = 0;
  private lowWindows = 0;
  private highWindows = 0;
  private monitorRaf: number | null = null;
  private device = detectDevice();
  private snapshot: QualitySnapshot;

  constructor(mode: QualityMode = loadMode()) {
    const recommendation = recommendQualityLevel(this.device);
    const activeLevel = mode === "auto" ? recommendation.level : mode;
    this.snapshot = {
      mode,
      activeLevel,
      profile: QUALITY_PROFILES[activeLevel],
      device: this.device,
      averageFps: null,
      targetFps: this.device.mobile ? 45 : 60,
      adapting: mode === "auto",
      reason: mode === "auto" ? recommendation.reason : `${QUALITY_PROFILES[activeLevel].label} selected manually`,
    };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: QualityListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setMode(mode: QualityMode) {
    if (mode === this.snapshot.mode) return;
    if (isBrowser()) {
      try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* Storage can be disabled in private browsing. */ }
    }
    const recommendation = recommendQualityLevel(this.device);
    const activeLevel = mode === "auto" ? recommendation.level : mode;
    this.lowWindows = 0; this.highWindows = 0; this.frameDurations = [];
    this.update({
      mode,
      activeLevel,
      profile: QUALITY_PROFILES[activeLevel],
      adapting: mode === "auto",
      reason: mode === "auto" ? recommendation.reason : `${QUALITY_PROFILES[activeLevel].label} selected manually`,
    });
  }

  /**
   * Feed the RAF timestamp from the actual render loop. A long background-tab
   * pause is ignored, so returning to the game never forces a false downgrade.
   */
  reportFrame(timestamp: number) {
    if (!Number.isFinite(timestamp)) return;
    if (this.lastFrameAt > 0) {
      const duration = timestamp - this.lastFrameAt;
      if (duration >= 4 && duration <= 120) this.frameDurations.push(duration);
    }
    this.lastFrameAt = timestamp;
    if (this.frameDurations.length < 90) return;
    const sorted = [...this.frameDurations].sort((a, b) => a - b);
    const trim = Math.floor(sorted.length * 0.08);
    const sample = sorted.slice(trim, sorted.length - trim);
    const averageMs = sample.reduce((sum, value) => sum + value, 0) / Math.max(1, sample.length);
    const averageFps = Math.min(240, 1000 / averageMs);
    this.frameDurations = this.frameDurations.slice(-15);
    this.update({ averageFps });
    this.adapt(averageFps, timestamp);
  }

  /** Optional standalone sampler; prefer reportFrame() from the render loop. */
  startMonitoring() {
    if (!isBrowser() || this.monitorRaf !== null) return () => this.stopMonitoring();
    const sample = (timestamp: number) => {
      this.reportFrame(timestamp);
      this.monitorRaf = window.requestAnimationFrame(sample);
    };
    this.monitorRaf = window.requestAnimationFrame(sample);
    return () => this.stopMonitoring();
  }

  stopMonitoring() {
    if (this.monitorRaf !== null && isBrowser()) window.cancelAnimationFrame(this.monitorRaf);
    this.monitorRaf = null;
    this.lastFrameAt = 0;
  }

  /** Re-evaluate DPR, viewport size, motion preference, and mobile state. */
  refreshDeviceProfile() {
    this.device = detectDevice();
    const recommendation = recommendQualityLevel(this.device);
    // A resize can lower the safe ceiling (for example, rotating a high-DPI
    // phone), but it must not erase an FPS-driven downgrade. Auto earns its way
    // back up through the slower headroom hysteresis in adapt().
    const activeLevel = this.snapshot.mode === "auto"
      ? LEVELS[Math.min(LEVELS.indexOf(this.snapshot.activeLevel), LEVELS.indexOf(recommendation.level))]
      : this.snapshot.activeLevel;
    const preservesRuntimeDowngrade = this.snapshot.mode === "auto"
      && LEVELS.indexOf(activeLevel) < LEVELS.indexOf(recommendation.level);
    this.update({
      device: this.device,
      targetFps: this.device.mobile ? 45 : 60,
      activeLevel,
      profile: QUALITY_PROFILES[activeLevel],
      reason: this.snapshot.mode === "auto" && !preservesRuntimeDowngrade ? recommendation.reason : this.snapshot.reason,
    });
  }

  getRenderBudget(width = isBrowser() ? window.innerWidth : 1280, height = isBrowser() ? window.innerHeight : 720): RenderBudget {
    const profile = this.snapshot.profile;
    const budgetRatio = Math.sqrt(profile.pixelBudget / Math.max(1, width * height));
    const dpr = isBrowser() ? window.devicePixelRatio || 1 : this.device.devicePixelRatio;
    return {
      ...profile,
      pixelRatio: Math.max(0.62, Math.min(dpr, profile.pixelRatioCap, budgetRatio)),
      motionScale: this.device.reducedMotion ? Math.min(0.45, profile.motionScale) : profile.motionScale,
      reducedMotion: this.device.reducedMotion,
      targetFps: this.snapshot.targetFps,
    };
  }

  dispose() {
    this.stopMonitoring();
    this.listeners.clear();
  }

  private adapt(fps: number, timestamp: number) {
    if (this.snapshot.mode !== "auto") return;
    const target = this.snapshot.targetFps;
    if (fps < target * 0.76) { this.lowWindows += 1; this.highWindows = 0; }
    else if (fps > target * 0.96) { this.highWindows += 1; this.lowWindows = 0; }
    else { this.lowWindows = 0; this.highWindows = 0; }
    const elapsed = timestamp - this.lastAdaptedAt;
    if (this.lowWindows >= 2 && elapsed > 4_000) {
      const next = stepLevel(this.snapshot.activeLevel, -1);
      if (next !== this.snapshot.activeLevel) {
        this.lastAdaptedAt = timestamp; this.lowWindows = 0;
        this.update({ activeLevel: next, profile: QUALITY_PROFILES[next], reason: `Adjusted to hold ${target} FPS` });
      }
    } else if (this.highWindows >= 7 && elapsed > 18_000) {
      const ceiling = recommendQualityLevel(this.device).level;
      const next = stepLevel(this.snapshot.activeLevel, 1);
      if (LEVELS.indexOf(next) <= LEVELS.indexOf(ceiling) && next !== this.snapshot.activeLevel) {
        this.lastAdaptedAt = timestamp; this.highWindows = 0;
        this.update({ activeLevel: next, profile: QUALITY_PROFILES[next], reason: "Performance headroom detected" });
      }
    }
  }

  private update(update: Partial<QualitySnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export function createAdaptiveQualityManager(mode?: QualityMode) {
  return new AdaptiveQualityManager(mode);
}
