import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the campaign carries a dense Wikipedia-backed fact library", async () => {
  const facts = await readFile(
    new URL("../app/game/educationFacts.ts", import.meta.url),
    "utf8",
  );
  const factCount = [...facts.matchAll(/\bfact\(\n\s+"/g)].length;

  assert.ok(factCount >= 100, `expected at least 100 Field Guide entries, found ${factCount}`);
  assert.match(facts, /"central-park"/);
  assert.match(facts, /"the-lake"/);
  assert.match(facts, /"subway-train"/);
  assert.match(facts, /"bronx-zoo"/);
  assert.match(facts, /"zoo-sea-lion"/);
  assert.match(facts, /"zoo-spider-monkey"/);
  assert.match(facts, /"zoo-birds"/);
  assert.match(facts, /"zoo-zebra"/);
  assert.match(facts, /"zoo-red-panda"/);
  assert.match(facts, /"zoo-tortoise"/);
  assert.match(facts, /"zoo-flamingo"/);
  assert.match(facts, /"zoo-bison"/);
  assert.match(facts, /city: "New York City"/);
  assert.match(facts, /museum: "American Museum of Natural History"/);
  assert.match(
    facts,
    /https:\/\/en\.wikipedia\.org\/wiki\/\$\{encodeURIComponent\(entry\.wikiTitle\)/,
  );
  assert.doesNotMatch(facts, /https:\/\/(?!en\.wikipedia\.org)/);
});

test("Field Guide entries follow park, transit, habitat, city, and museum context", async () => {
  const facts = await readFile(
    new URL("../app/game/educationFacts.ts", import.meta.url),
    "utf8",
  );

  assert.match(facts, /stage === "BOW_BRIDGE"[\s\S]{0,90}"central-park-landmarks"/);
  assert.match(facts, /stage === "LAKE_TICKET"[\s\S]{0,70}"the-lake"/);
  assert.match(facts, /stage === "SUBWAY_ENTRANCE"[\s\S]{0,70}"subway"/);
  assert.match(facts, /stage === "BUS_DRIVE"[\s\S]{0,60}"city"/);
  assert.match(facts, /stage === "MUSEUM"[\s\S]{0,80}"museum"/);
  assert.match(facts, /cue\.includes\("SEA LION"\)[\s\S]{0,90}"zoo-sea-lion"/);
  assert.match(facts, /cue\.includes\("BISON"\)[\s\S]{0,90}"zoo-bison"/);
});

test("education modal releases and restores look control with keyboard and button parity", async () => {
  const [component, park, transit] = await Promise.all([
    readFile(new URL("../app/game/EducationalCallouts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(component, /event\.code !== "KeyI"/);
  assert.equal([...component.matchAll(/<kbd>i<\/kbd>/g)].length, 2);
  assert.match(component, /Field Guide · \{EDUCATION_CONTEXT_LABELS\[context\]\}/);
  assert.doesNotMatch(component, /field note/i);
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /document\.pointerLockElement/);
  assert.match(component, /document\.exitPointerLock\(\)/);
  assert.match(component, /requestPreviousPointerLock\(lockedCanvas\)/);
  assert.match(component, /event\.code === "Tab" && open/);
  assert.match(component, /querySelectorAll<HTMLElement>/);
  assert.match(component, /target="_blank"/);
  assert.match(component, /Next fact/);
  assert.match(component, /if \(!active \|\| open \|\| facts\.length === 0\) return/);
  assert.match(park, /educationOpenRef\.current[\s\S]{0,80}timer\.update/);
  assert.match(transit, /gameOverlayPaused[\s\S]{0,180}educationOpenRef\.current/);
  assert.match(park, /keyDown = \(event: KeyboardEvent\) => \{\n\s+if \(educationOpenRef\.current\) return/);
  assert.match(transit, /keyDown = \(event: KeyboardEvent\) => \{\n\s+if \(educationOpenRef\.current\) return/);
  assert.match(park, /<EducationalCallouts/);
  assert.match(transit, /<EducationalCallouts/);
});

test("mobile hides teaser text until Learn is tapped while desktop keeps a short callout", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/game/EducationalCallouts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /className="education-callout"/);
  assert.match(component, /className="education-launch"/);
  assert.match(component, /data-education-open=\{open \? "true" : "false"\}/);
  assert.match(css, /\.education-layer\[data-education-open="true"\] \{ z-index:300; \}/);
  assert.match(css, /@media\(max-width:900px\), \(pointer:coarse\)[\s\S]{0,160}\.education-callout\{display:none\}/);
  assert.match(css, /\.education-callout~\.education-launch\{display:flex\}/);
  assert.match(css, /\.education-modal-backdrop/);
  assert.match(css, /\.education-callout kbd,\.education-launch kbd \{[^}]*text-transform:lowercase/);
});
