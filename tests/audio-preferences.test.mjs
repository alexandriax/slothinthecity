import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_PREFERENCES_STORAGE_KEY,
  createPremiumAudioDirector,
} from "../app/game/systems/audio/PremiumAudioDirector.ts";

function memoryStorage(initial = new Map()) {
  return {
    getItem(key) { return initial.has(key) ? initial.get(key) : null; },
    setItem(key, value) { initial.set(key, String(value)); },
    removeItem(key) { initial.delete(key); },
  };
}

test("audio mix and mute preference survive a fresh game runtime", () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: memoryStorage(values) };
  try {
    const first = createPremiumAudioDirector();
    first.setMasterVolume(.42);
    first.setMusicVolume(.31);
    first.setAmbienceVolume(.53);
    first.setSfxVolume(.67);
    first.setMuted(true);

    const next = createPremiumAudioDirector();
    assert.deepEqual(
      (({ master, music, ambience, sfx, muted }) => ({ master, music, ambience, sfx, muted }))(next.getSnapshot()),
      { master: .42, music: .31, ambience: .53, sfx: .67, muted: true },
    );
    assert.equal(JSON.parse(values.get(AUDIO_PREFERENCES_STORAGE_KEY)).version, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("invalid or future audio preferences fail safely to the authored mix", () => {
  const previousWindow = globalThis.window;
  const values = new Map([[AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 99, master: 0, muted: true })]]);
  globalThis.window = { localStorage: memoryStorage(values) };
  try {
    const director = createPremiumAudioDirector();
    const snapshot = director.getSnapshot();
    assert.equal(snapshot.master, .78);
    assert.equal(snapshot.music, .64);
    assert.equal(snapshot.ambience, .58);
    assert.equal(snapshot.sfx, .86);
    assert.equal(snapshot.muted, false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
