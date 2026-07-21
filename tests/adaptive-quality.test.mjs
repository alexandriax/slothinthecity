import assert from "node:assert/strict";
import test from "node:test";
import {
  AdaptiveQualityManager,
  QUALITY_PROFILES,
  recommendQualityLevel,
} from "../app/game/systems/quality/AdaptiveQualityManager.ts";

const device = overrides => ({
  cores: 4,
  memoryGb: null,
  devicePixelRatio: 1,
  mobile: false,
  touch: false,
  reducedMotion: false,
  saveData: false,
  webGpu: true,
  viewportPixels: 1_440_000,
  ...overrides,
});

test("first-run recommendations keep Pro quality while protecting Air and phone frame rates", () => {
  assert.equal(recommendQualityLevel(device({ cores: 12, devicePixelRatio: 2 })).level, "high");
  assert.equal(recommendQualityLevel(device({ cores: 8, devicePixelRatio: 2 })).level, "medium");
  assert.equal(recommendQualityLevel(device({ cores: 6, mobile: true, touch: true, devicePixelRatio: 3, viewportPixels: 390 * 844 })).level, "medium");
  assert.equal(recommendQualityLevel(device({ cores: 4, memoryGb: 2, mobile: true, touch: true, devicePixelRatio: 2 })).level, "low");
  assert.equal(recommendQualityLevel(device({ cores: 12, memoryGb: 8, saveData: true })).level, "high");
});

test("performance and balanced are materially lighter than the present high profile", () => {
  assert.equal(QUALITY_PROFILES.low.label, "Performance");
  assert.equal(QUALITY_PROFILES.medium.label, "Balanced");
  assert.equal(QUALITY_PROFILES.low.shadows, false);
  assert.equal(QUALITY_PROFILES.medium.postProcessing, false);
  assert.ok(QUALITY_PROFILES.low.pixelBudget < QUALITY_PROFILES.medium.pixelBudget);
  assert.ok(QUALITY_PROFILES.medium.pixelBudget < QUALITY_PROFILES.high.pixelBudget);
  assert.ok(QUALITY_PROFILES.medium.foliageDensity < QUALITY_PROFILES.high.foliageDensity);
  assert.ok(QUALITY_PROFILES.medium.npcDensity < QUALITY_PROFILES.high.npcDensity);
});

test("Auto adapts down under sustained frame pressure while manual quality stays fixed", () => {
  const automatic = new AdaptiveQualityManager("auto");
  for (let frame = 1; frame <= 500; frame += 1) automatic.reportFrame(frame * 34);
  assert.equal(automatic.getSnapshot().activeLevel, "low");
  assert.match(automatic.getSnapshot().reason, /Adjusted to hold/);

  const manual = new AdaptiveQualityManager("high");
  for (let frame = 1; frame <= 500; frame += 1) manual.reportFrame(frame * 34);
  assert.equal(manual.getSnapshot().activeLevel, "high");
});
