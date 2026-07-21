import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const touchUrl = new URL("../app/game/mobile/TouchControls.tsx", import.meta.url);

test("every contextual keyboard prompt is forwarded to the mobile action resolver", async () => {
  const [game, subway, touch] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
    readFile(touchUrl, "utf8"),
  ]);

  assert.match(game, /promptKey=\{hud\.promptKey\}/);
  assert.match(game, /qaInput === "ticket"[\s\S]{0,180}player\.copy\(world\.ticketTarget\)/);
  assert.match(subway, /promptKey=\{hud\.promptKey\}/);
  assert.match(touch, /resolveTouchAction\(prompt, promptKey, vehicle\)/);
  assert.match(touch, /prompt\.includes\("RECOVER"\) \|\| prompt\.includes\("TICKET"\) \? "Take"/);
  assert.match(touch, /prompt\.includes\("NOTICE WHAT ZAP"\) \? "Observe"/);
  assert.match(touch, /prompt\.includes\("DISLODGE ZAP"\) \? "Nudge"/);
  assert.match(touch, /prompt\.includes\("GREET TANNER"\) \? "Greet"/);
  assert.match(touch, /data-input-code=\{action\.code\}/);
  assert.match(touch, /return \{ code, label: label \|\| "Use" \}/);
});

test("mobile park controls preserve scent, braking, descending, pausing, and interaction parity", async () => {
  const [game, touch] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(touchUrl, "utf8"),
  ]);

  assert.match(touch, /\{showSense && <button className="touch-sense"/);
  assert.doesNotMatch(touch, /!vehicle && showSense/);
  assert.match(touch, /emitKey\("KeyC", true\)/);
  assert.match(touch, /setHeld\(vehicle \? "Space" : "ShiftLeft", true\)/);
  assert.match(touch, /yieldingToTanner \? "Yield"/);
  assert.match(touch, /document\.dispatchEvent\(new Event\(PARK_GROUND_DESCENT_REQUEST_EVENT\)\)/);
  assert.match(touch, /showPause && <button className="touch-pause"/);
  assert.match(touch, /emitKey\("KeyP", true\)/);
  assert.match(touch, /vehicle === "bus" && <div className="touch-gears"/);
  assert.match(touch, /emitKey\("KeyR", true\)/);
  assert.match(touch, /emitKey\("KeyF", true\)/);
  assert.match(game, /<TouchControls[\s\S]{0,200}showPause/);
});

test("live zoo equipment exposes the same species controls on keyboard and touch", async () => {
  const [game, touch, zoo] = await Promise.all([
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
    readFile(touchUrl, "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(game, /zooWorld\?\.handleHabitatControl\(event\.code\)/);
  assert.match(game, /fieldControls: habitatProgress\?\.control\?\.options/);
  assert.match(game, /fieldControls=\{hud\.fieldControls\}/);
  assert.match(game, /fieldStatus=\{hud\.fieldStatus\}/);
  assert.match(touch, /aria-label="Live habitat equipment controls"/);
  assert.match(touch, /className="touch-field-readout" aria-live="polite"/);
  assert.match(touch, /touch-field-buttons count-\$\{Math\.min\(fieldControls\.length, 4\)\}/);
  assert.match(touch, /emitKey\(control\.code, true\); emitKey\(control\.code, false\)/);
  for (const code of ["KeyE", "KeyA", "KeyW", "KeyS", "KeyD", "Digit1", "Digit2", "Digit3"]) assert.match(zoo, new RegExp(`code: "${code}"`));
});
