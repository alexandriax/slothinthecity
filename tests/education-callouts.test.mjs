import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("the contextual field guide ships a dense, Wikipedia-backed curriculum", async () => {
  const source = await readSource("../app/game/educationFacts.ts");
  const factCount = (source.match(/^  fact\(/gm) ?? []).length;
  const ids = [...source.matchAll(/^    "([a-z0-9-]+)",$/gm)].map(
    (match) => match[1],
  );

  assert.ok(factCount >= 100, `expected at least 100 facts, found ${factCount}`);
  assert.equal(new Set(ids).size, ids.length, "fact ids should be unique");
  assert.match(source, /https:\/\/en\.wikipedia\.org\/wiki\//);
  assert.match(source, /encodeURIComponent\(entry\.wikiTitle\)/);

  for (const context of [
    "central-park",
    "central-park-landmarks",
    "the-lake",
    "subway",
    "subway-train",
    "bronx-zoo",
    "zoo-polar-bear",
    "zoo-sloth",
    "zoo-sea-lion",
    "zoo-spider-monkey",
    "zoo-birds",
    "zoo-zebra",
    "zoo-red-panda",
    "zoo-tortoise",
    "zoo-flamingo",
    "zoo-bison",
    "city",
    "museum",
    "homecoming",
  ]) {
    assert.match(source, new RegExp(`"${context}"`), `${context} facts missing`);
  }

  for (const topic of [
    "Bow Bridge",
    "MetroCard",
    "Cross Bronx Expressway",
    "Hudson",
    "Polar bear",
    "Sloth fur",
    "California sea lions",
    "Spider monkeys",
    "Red pandas",
    "Ahnighito",
    "Barosaurus",
    "Megatherium",
  ]) {
    assert.match(source, new RegExp(topic, "i"), `${topic} coverage missing`);
  }
});

test("desktop callouts stay brief while mobile exposes only the learn button", async () => {
  const [overlay, css] = await Promise.all([
    readSource("../app/game/EducationOverlay.tsx"),
    readSource("../app/globals.css"),
  ]);

  assert.match(overlay, /CALLOUT_VISIBLE_MS = 7_000/);
  assert.match(overlay, /FACT_ROTATION_MS = 18_000/);
  assert.match(overlay, /className="education-info-button"/);
  assert.match(overlay, /className="education-modal"/);
  assert.match(overlay, /role="dialog"/);
  assert.match(overlay, /aria-modal="true"/);
  assert.match(overlay, /Read the source on Wikipedia/);
  assert.match(overlay, /Fact \{factIndex \+ 1\} of \{facts\.length\}/);
  assert.match(css, /\.education-dock\.show-callout \.education-callout/);
  assert.match(
    css,
    /@media\(max-width:900px\), \(pointer:coarse\)[\s\S]*?\.education-callout\{display:none\}/,
  );
  assert.match(
    css,
    /\.game-shell\[data-touch-capable="true"\] \.education-callout\{display:none\}/,
  );
});

test("the info modal releases and restores pointer lock and owns gameplay keys", async () => {
  const overlay = await readSource("../app/game/EducationOverlay.tsx");

  assert.match(
    overlay,
    /wasPointerLocked\.current = document\.pointerLockElement === viewportCanvas/,
  );
  assert.match(overlay, /if \(wasPointerLocked\.current\) exitPointerLock\(\)/);
  assert.match(
    overlay,
    /requestAnimationFrame\(\(\) => requestPointerLock\(canvas\(\)\)\)/,
  );
  assert.match(overlay, /event\.code === "KeyI"/);
  assert.match(overlay, /event\.code === "Escape"/);
  assert.match(overlay, /event\.stopImmediatePropagation\(\)/);
  assert.match(overlay, /GAMEPLAY_KEYS\.has\(event\.code\)/);
});

test("the field guide follows both halves of the complete journey", async () => {
  const [park, transit, facts] = await Promise.all([
    readSource("../app/game/GameClient.tsx"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/educationFacts.ts"),
  ]);

  assert.match(park, /educationContextForParkStage\(hud\.parkStage\)/);
  assert.match(transit, /educationContextForTransitStage\(/);
  assert.match(transit, /`\$\{hud\.objective\} \$\{hud\.prompt\} \$\{hud\.status\} \$\{hud\.waypoint\}`/);
  assert.match(facts, /if \(stage === "RIDING"\) return "subway-train"/);
  assert.match(facts, /if \(stage === "BUS_DRIVE"\) return "city"/);
  assert.match(facts, /if \(stage === "MUSEUM" \|\| stage === "COMPLETE"\) return "museum"/);
  assert.match(facts, /if \(stage === "CENTRAL_PARK"\) return "homecoming"/);
  assert.match(facts, /cue\.includes\("SEA LION"\)/);
  assert.match(facts, /cue\.includes\("BISON"\)/);
  assert.match(facts, /cue\.includes\("POLAR"\)/);
  assert.match(facts, /cue\.includes\("SLOTH"\)/);
  assert.match(facts, /entryContext\.startsWith\("zoo-"\)/);
  assert.ok(
    facts.indexOf('cue.includes("SLOTH")') > facts.indexOf('cue.includes("BISON")'),
    "the campaign-wide sloth objective must not mask a nearby habitat cue",
  );
});
