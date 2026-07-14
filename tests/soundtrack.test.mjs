import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import test from "node:test";

const EXPECTED_TRACKS = Array.from({ length: 12 }, (_, index) => `${String(index).padStart(2, "0")}.mp3`);

test("authored soundtrack files are streamed in album order and loop after the final track", async () => {
  const director = await readFile(new URL("../app/game/systems/audio/PremiumAudioDirector.ts", import.meta.url), "utf8");
  const paths = [...director.matchAll(/"\/audio\/soundtrack\/(\d{2}\.mp3)"/g)].map(([, name]) => name);

  assert.deepEqual(paths, EXPECTED_TRACKS);
  assert.match(director, /createMediaElementSource\(element\)/);
  assert.match(director, /addEventListener\("ended", this\.handleSoundtrackEnded\)/);
  assert.match(director, /this\.loadSoundtrack\(this\.soundtrackIndex \+ 1\)/);
  assert.match(director, /% SOUNDTRACK_TRACKS\.length/);
  assert.match(director, /preloadNextSoundtrack\(\)/);
  assert.match(director, /hasBeenUnlocked \|\| context\.state === "running"/);
  assert.match(director, /const playback = this\.playSoundtrack\(\)/);
  assert.doesNotMatch(director, /scheduleSceneStep|SCENE_TEMPO|startScheduler/);

  for (const track of EXPECTED_TRACKS) {
    const info = await stat(new URL(`../public/audio/soundtrack/${track}`, import.meta.url));
    assert.ok(info.size > 100_000, `${track} should contain a real authored soundtrack file`);
  }
});
