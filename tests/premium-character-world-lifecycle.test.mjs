import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORLD_CASES = [
  {
    file: "CampaignLandmarks.ts",
    minimumHumans: 2,
    markerBefore: "scene.remove(root)",
  },
  {
    file: "SubwayWorld.ts",
    minimumHumans: 1,
    markerBefore: "station.root.removeFromParent()",
  },
  {
    file: "TrainInteriorWorld.ts",
    minimumHumans: 1,
    markerBefore: "this.root.removeFromParent()",
  },
  {
    file: "BronxZooWorld.ts",
    minimumHumans: 2,
    markerBefore: "this.root.removeFromParent()",
  },
];

async function worldSource(file) {
  return readFile(new URL(`../app/game/world/${file}`, import.meta.url), "utf8");
}

test("premium-human worlds invalidate pending authored-character hydration before teardown", async () => {
  for (const { file, markerBefore } of WORLD_CASES) {
    const source = await worldSource(file);
    assert.match(
      source,
      /import \{[^}]*markPremiumCharactersDisposed[^}]*\} from "\.\/PremiumCharacter";/,
      `${file} should import the premium-character lifecycle marker`,
    );

    const markerIndex = source.lastIndexOf("markPremiumCharactersDisposed(", source.indexOf(markerBefore));
    const teardownIndex = source.indexOf(markerBefore);
    assert.ok(markerIndex >= 0, `${file} should mark its character subtree as disposed`);
    assert.ok(
      markerIndex < teardownIndex,
      `${file} should invalidate pending character hydration before removing its world subtree`,
    );
  }
});

test("all premium-human world integrations remain present", async () => {
  for (const { file, minimumHumans } of WORLD_CASES) {
    const source = await worldSource(file);
    const createCalls = source.match(/createPremiumHuman\s*\(/g) ?? [];
    assert.ok(
      createCalls.length >= minimumHumans,
      `${file} should retain at least ${minimumHumans} authored human creation sites`,
    );
  }

  const bronxZoo = await worldSource("BronxZooWorld.ts");
  assert.match(bronxZoo, /bronx-zoo-extra-ticket-donor/);
  assert.match(bronxZoo, /bronx-zoo-arrival-attendant/);
  assert.match(bronxZoo, /bronx-zoo-wandering-visitor-\$\{index \+ 1\}/);
  assert.match(bronxZoo, /guestData\.slice\(0, quality < \.58 \? 4 : quality < \.82 \? 6 : guestData\.length\)/);
  assert.match(bronxZoo, /this\.guestAgents\.push\(createAmbientHumanAgent\(result\.root/);
});
