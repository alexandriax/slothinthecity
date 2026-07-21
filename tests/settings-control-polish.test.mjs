import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("settings stays icon-only and dismissible across desktop and touch layouts", async () => {
  const [settings, styles] = await Promise.all([
    readFile(new URL("../app/game/systems/settings/AudioQualitySettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(settings, /className="experience-settings-gear"/);
  assert.doesNotMatch(settings, /experience-settings-trigger-label/);
  assert.doesNotMatch(settings, /<span aria-hidden="true">\{open \? "×" : "⚙"\}<\/span>/);
  assert.match(settings, /event\.key !== "Escape"/);
  assert.match(settings, /rootRef\.current\?\.contains\(event\.target as Node\)/);
  assert.match(settings, /aria-label="Close settings"/);

  assert.match(styles, /\.experience-settings-trigger \{[\s\S]{0,240}width:44px;[\s\S]{0,160}height:44px;/);
  assert.match(styles, /right:max\(64px,calc\(env\(safe-area-inset-right\) \+ 54px\)\)/);
  assert.match(styles, /max-height:500px[\s\S]{0,320}\.experience-settings-trigger \{ width:40px;/);
});
