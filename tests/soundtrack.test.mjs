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

test("authored vehicle, wildlife, and transit audio is resiliently decoded and event-driven", async () => {
  const [director, park, subway] = await Promise.all([
    readFile(new URL("../app/game/systems/audio/PremiumAudioDirector.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
  ]);

  for (const path of [
    "/audio/sfx/cart-motor-loop.mp3",
    "/audio/sfx/hawk-near-screech.mp3",
    "/audio/sfx/hawk-dive-pass.mp3",
    ...["fifth_n_platform", "fifth_r_platform", "fifth_n_boarding", "fifth_r_boarding", "lex_arrival_transfer", "lex_5_platform", "lex_5_boarding", "stop_86", "stop_125", "stop_e180", "west_farms_arrival", "stand_clear_doors"].map(name => `/audio/announcements/${name}.mp3`),
  ]) assert.match(director, new RegExp(path.replaceAll("/", "\\/")));

  assert.match(director, /fetch\(path\)/);
  assert.match(director, /decodeAudioData\(data\.slice\(0\)\)/);
  assert.match(director, /source\.loop = true/);
  assert.match(director, /this\.announcementQueue\.shift\(\)/);
  assert.match(director, /this\.announcementSource \? \.38 : 1/);
  assert.doesNotMatch(director, /preloadAuthoredAudio/);
  assert.doesNotMatch(director, /Object\.values\(TRANSIT_ANNOUNCEMENTS\)/);
  assert.match(director, /loadAuthoredBuffer\(TRANSIT_ANNOUNCEMENTS\[next\.cue\]\)/);
  assert.match(park, /audio\.setCartMotor\(true, traversalSpeed\)/);
  assert.match(park, /audio\.playHawkCue\("near"\)/);
  assert.match(park, /audio\.playHawkCue\("dive"\)/);
  assert.match(subway, /playTransitAnnouncement/);
  for (const cue of ["lex_arrival_transfer", "lex_5_platform", "lex_5_boarding", "stop_86", "stop_125", "stop_e180", "west_farms_arrival", "stand_clear_doors"]) assert.match(subway, new RegExp(`"${cue}"`));
  assert.match(subway, /`fifth_\$\{route\}_platform`/);
  assert.match(subway, /`fifth_\$\{route\}_boarding`/);
  assert.match(subway, /stationWorld\.arrivingService\.route/);
  assert.match(subway, /train · doors open · board through any open doorway/);
});
