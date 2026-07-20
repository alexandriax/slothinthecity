import assert from "node:assert/strict";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadLogic() {
  const result = await esbuild.build({
    entryPoints: ["app/game/zooSideQuestLogic.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const loadedModule = { exports: {} };
  new Function("module", "exports", result.outputFiles[0].text)(loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ value >>> 15, 1 | value), value ^= value + Math.imul(value ^ value >>> 7, 61 | value), (value ^ value >>> 14) >>> 0) / 4294967296);
}

const Logic = await loadLogic();

test("all eight side quests publish stable IDs and recruit every audited habitat species", () => {
  assert.deepEqual(Logic.ZOO_SIDE_QUEST_IDS, [
    "aviary-voices",
    "sea-lion-current",
    "monkey-canopy-rig",
    "zebra-stripe-scan",
    "red-panda-scent-wind",
    "tortoise-sun-trail",
    "flamingo-wetland-balance",
    "bison-prairie-seeding",
  ]);
  const recruits = Logic.ZOO_SIDE_QUEST_IDS.flatMap(id => Logic.ZOO_SIDE_QUESTS[id].recruitedSpecies);
  assert.equal(recruits.length, 11);
  assert.equal(new Set(recruits).size, recruits.length);
  for (const id of Logic.ZOO_SIDE_QUEST_IDS) {
    const metadata = Logic.ZOO_SIDE_QUESTS[id];
    assert.equal(metadata.id, id);
    assert.ok(metadata.instructions.length > 60);
    assert.ok(metadata.keyboard.length > 10);
  }
});

test("each randomized quest configuration is deterministic for a seed and valid for a whole retry session", () => {
  for (const [index, id] of Logic.ZOO_SIDE_QUEST_IDS.entries()) {
    const first = Logic.createZooSideQuestConfig(id, seeded(1200 + index));
    const second = Logic.createZooSideQuestConfig(id, seeded(1200 + index));
    assert.deepEqual(first, second, `${id} should preserve one generated solution across retries`);
    assert.equal(first.questId, id);
  }

  const voices = Logic.createZooSideQuestConfig("aviary-voices", seeded(7));
  assert.deepEqual(voices.roundLengths, [3, 5, 7]);
  assert.equal(voices.melody.length, 7);
  assert.ok(voices.melody.every((voice, index) => index === 0 || voice !== voices.melody[index - 1]));
});

test("current, canopy, stripe, scent, and sun puzzle rules expose deterministic success feedback", () => {
  const current = {
    questId: "sea-lion-current",
    start: { x: 3, y: 4 },
    gates: [{ x: 3, y: 3 }],
    currentPattern: [0],
  };
  const moved = Logic.advanceSeaLionCurrent({ position: current.start, gateIndex: 0, turn: 0 }, current, "forward");
  assert.deepEqual(moved, { position: { x: 3, y: 3 }, gateIndex: 1, turn: 1 });
  assert.equal(Logic.canopyAnchorReady(.5), true);
  assert.equal(Logic.canopyAnchorReady(.72), false);
  assert.equal(Logic.stripeBandAligned(2, 2), true);
  assert.equal(Logic.stripeBandAligned(1, 2), false);
  assert.equal(Logic.scentTrailReach([2, 1, 0, 3], [2, 1, 3, 3]), 2);
  assert.equal(Logic.sunTrailReach([4, 2, 5], [4, 2, 5]), 3);
});

test("wetland valves create recoverable gauge tradeoffs and prairie solutions land inside their targets", () => {
  const salty = { water: 35, salinity: 74 };
  const freshened = Logic.operateWetlandValve(salty, "fresh");
  assert.ok(freshened.water > salty.water);
  assert.ok(freshened.salinity < salty.salinity);
  assert.equal(Logic.wetlandReadingSafe({ water: 52, salinity: 49 }), true);
  assert.equal(Logic.wetlandReadingSafe({ water: 70, salinity: 49 }), false);

  const prairie = Logic.createZooSideQuestConfig("bison-prairie-seeding", seeded(44));
  for (const target of prairie.targets) {
    const landing = Logic.prairieLanding(target.solutionAngle, target.solutionPower, prairie.wind);
    assert.equal(Logic.prairieShotHits(landing, target), true);
  }
});
