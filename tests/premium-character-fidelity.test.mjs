import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("premium humans use twenty identities and head-conforming photographic facial geometry", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");
  const human = source.slice(source.indexOf("export function createPremiumHuman"), source.indexOf("// CapsuleGeometry requires"));

  assert.match(source, /identityCount: 20/);
  for (const index of ["01", "02", "03"]) {
    assert.match(source, new RegExp(`npc-face-atlas-v2-${index}\\.webp`));
    assert.match(source, new RegExp(`npc-cloth-atlas-v2-${index}\\.webp`));
  }
  for (const index of ["01", "02"]) assert.match(source, new RegExp(`npc-face-atlas-v3-${index}\\.webp`));
  assert.match(source, /function anatomicalHeadGeometry/);
  assert.match(source, /function faceSurfaceGeometry/);
  assert.match(human, /head-conforming-generated-face-surface/);
  assert.match(human, /faceVariant/);
  assert.match(human, /clothingVariant/);
  assert.match(human, /continuous-tailored-human-arm/);
  assert.match(human, /continuous-tailored-human-leg/);
  assert.match(source, /onSkinTone\?\./);
  assert.match(source, /backgroundMask = THREE\.MathUtils\.smoothstep/);
  assert.match(human, /face-atlas-sampled-seamless/);
  assert.match(human, /depthWrite: false/);
  assert.match(human, /anatomical-head-neck-skin-transition/);
  assert.doesNotMatch(human, /elbowBlend|kneeBlend|ConeGeometry/);
  assert.doesNotMatch(human, /eyeWhite|noseBridge|photoreal-generated-face-albedo|const lips =/);
});

test("zoo sloth friends use continuous anatomical silhouettes", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");
  const friend = source.slice(source.indexOf("export function createPremiumSlothFriend"));

  for (const feature of ["continuous-anatomical-sloth-torso", "anatomical-sloth-head-and-jaw", "continuous-anatomical-sloth-forelimb", "continuous-anatomical-sloth-hindlimb"]) {
    assert.match(friend, new RegExp(feature));
  }
  assert.doesNotMatch(friend, /const upper = new THREE\.Mesh\(new THREE\.CapsuleGeometry|const wrist = new THREE\.Mesh\(new THREE\.CapsuleGeometry|const palm = new THREE\.Mesh\(new THREE\.SphereGeometry/);
});

test("premium character detail scales with the active quality tier", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");

  assert.match(source, /quality > \.86 \? 34 : quality > \.62 \? 24 : 18/);
  assert.match(source, /quality > \.86 \? 36 : quality > \.62 \? 26 : 20/);
  assert.match(source, /quality > \.86 \? 384 : quality > \.62 \? 256 : 128/);
  assert.match(source, /quality > \.92 \? 40 : quality > \.68 \? 28 : 18/);
});
