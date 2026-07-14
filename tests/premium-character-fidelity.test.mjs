import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("premium humans use twelve identities and head-conforming photographic facial geometry", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");
  const human = source.slice(source.indexOf("export function createPremiumHuman"), source.indexOf("// CapsuleGeometry requires"));

  assert.match(source, /identityCount: 12/);
  for (const index of ["01", "02", "03"]) {
    assert.match(source, new RegExp(`npc-face-atlas-v2-${index}\\.webp`));
    assert.match(source, new RegExp(`npc-cloth-atlas-v2-${index}\\.webp`));
  }
  assert.match(source, /function anatomicalHeadGeometry/);
  assert.match(source, /function faceSurfaceGeometry/);
  assert.match(human, /head-conforming-generated-face-surface/);
  assert.match(human, /faceVariant/);
  assert.match(human, /clothingVariant/);
  assert.doesNotMatch(human, /eyeWhite|noseBridge|photoreal-generated-face-albedo|const lips =/);
});

test("premium character detail scales with the active quality tier", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");

  assert.match(source, /quality > \.86 \? 32 : quality > \.62 \? 22 : 14/);
  assert.match(source, /quality > \.86 \? 34 : quality > \.62 \? 24 : 16/);
  assert.match(source, /quality > \.86 \? 384 : quality > \.62 \? 256 : 128/);
  assert.match(source, /quality > \.92 \? 40 : quality > \.68 \? 28 : 18/);
});
