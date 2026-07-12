import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const html = await readFile(new URL("../.next/server/app/index.html", import.meta.url), "utf8");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

test("server-renders the branded game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>SLOTH \/ PARK — A Central Park Survival Adventure<\/title>/i);
  assert.match(html, /Play as a displaced sloth in a cinematic first-person Central Park adventure/i);
  assert.match(html, /property="og:image" content="https?:\/\/[^\"]+\/social\/sloth-park-og-v2\.jpg"/i);
  assert.match(html, /property="og:image:width" content="1200"/i);
  assert.match(html, /property="og:image:height" content="630"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
  assert.match(html, /THE RAMBLE · CENTRAL PARK/);
  assert.match(html, /PREPARING THE PARK|ENTER THE RAMBLE/);
  assert.match(html, /data-game-state="intro"/);
  assert.match(html, /3D game viewport/);
  assert.match(html, /game\/splash\.webp/);
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes the disposable starter and keeps the game browser-safe", async () => {
  const [page, layout, game, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /GameClient/);
  assert.match(layout, /Play as a displaced sloth in a cinematic first-person Central Park adventure/i);
  assert.match(layout, /sloth-park-og-v2\.jpg/);
  assert.match(game, /^"use client";/);
  assert.match(game, /requestPointerLock/);
  assert.match(game, /typeof canvas\.requestPointerLock !== "function"/);
  assert.match(game, /requestPointerLockSafely/);
  assert.match(game, /prefers-reduced-motion/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("mobile entry cannot be stranded by unavailable Pointer Lock", async () => {
  const game = await readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8");
  const beginStart = game.indexOf("const begin = useCallback");
  const beginEnd = game.indexOf("const resume", beginStart);
  assert.ok(beginStart >= 0 && beginEnd > beginStart);
  const begin = game.slice(beginStart, beginEnd);
  assert.ok(begin.indexOf('setPhase("playing")') < begin.indexOf("safeLock()"));
  assert.match(begin, /try \{ if \(!audioRef\.current\)/);
  assert.match(game, /phase === "intro" \|\| exiting/);
  assert.match(game, /data-touch-capable/);
});

test("completed foraging unlocks reliable sanctuary wayfinding", async () => {
  const [game, mobileHud, wayfinder, world] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/mobile/MobileHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GoalWayfinder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
  ]);
  assert.match(game, /<GoalWayfinder/);
  assert.match(game, /data-goal-distance/);
  assert.match(game, /Math\.hypot\(player\.x - GOAL\.x, player\.z - GOAL\.z\) < 7/);
  assert.match(game, /"gate", "gatecomplete"/);
  assert.match(mobileHud, /goalDistance/);
  assert.doesNotMatch(mobileHud, /"SOUTH"/);
  assert.match(wayfinder, /Sanctuary gate/);
  assert.match(world, /goalBeacon\.visible = collected\.size >= 5/);
});
