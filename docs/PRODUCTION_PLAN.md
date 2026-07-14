# Sloth in the City — Vertical Slice Production Plan

## 1. Product statement

**Fantasy:** Experience Central Park from the low, deliberate perspective of a sloth on an urgent journey through a living urban wilderness.

**Vertical-slice promise:** A polished, browser-native, first-person 3D adventure that delivers 8–12 minutes of authored exploration, traversal, light stealth, foraging, and a cinematic escape. The playable route runs from a park-edge conservation van through a wooded ramble to a high canopy sanctuary, using recognizable Central Park-inspired landmarks without attempting a full-scale geographic replica.

**Tone:** Grounded naturalism with gentle wit. The world feels physically credible and richly observed; the sloth’s unusual pace creates tension, intention, and charm rather than parody.

**Target:** Desktop Chromium, Firefox, and Safari with keyboard/mouse; install-free and playable from a shared URL. Touch/mobile receives a graceful “desktop recommended” presentation rather than a compromised control scheme in the first slice.

**Definition of “AAA quality” for this scope:** Cinematic art direction, coherent materials and lighting, layered audio, responsive input, premium presentation, strong accessibility, and stable performance. Quality comes from density and finish within one constrained route—not from map size, content volume, or photorealism at any cost.

## 2. Experience pillars

### 2.1 Deliberate momentum

The player is never fast, but is always making meaningful decisions. Hand-over-hand traversal has cadence, reach, and visible physicality. Short bursts of exertion provide excitement while grip and stamina create readable risk.

**Design test:** Every 15–25 seconds, the player should make a route, timing, resource, or observation decision.

### 2.2 Central Park as an urban wilderness

Dense foliage, exposed bedrock, weathered masonry, distant towers, joggers, birds, bicycles, sirens, and wind all coexist. The park is neither generic jungle nor clean postcard.

**Design test:** Each vista should contain one natural layer, one human layer, and one unmistakably New York layer.

### 2.3 Sloth embodiment

Hands, claws, breath, fur at the edge of frame, low eye height, lateral sway, and context-sensitive reaching sell the body. Mechanics arise from sloth traits: grip, patience, camouflage, climbing, and selective exertion.

**Design test:** The same level and mechanics should feel fundamentally different if imagined with a human avatar.

### 2.4 Quiet wonder, sudden peril

Exploration is meditative until the city intrudes: a dog investigates, a cyclist passes, a branch breaks, rain begins. Threats create memorable peaks but never turn the game into combat.

**Design test:** Tension comes from timing and exposure, not damage sponges or twitch shooting.

### 2.5 Browser-first spectacle

The opening frame looks premium immediately, while streaming, scalable effects, and resilient fallbacks keep the game responsive on realistic hardware.

**Design test:** No visual feature is allowed to compromise input latency, first interaction, or recovery from a dropped frame.

## 3. Player journey and core loop

### 3.1 Session arc

1. **Arrive:** A 20–30 second title-to-game transition establishes rain-damp Central Park at golden hour. The player wakes in a tipped transport crate beside a conservation van.
2. **Learn:** Follow scent motes to berries, learn look/move, inspect, grip, and climb on a fallen elm.
3. **Choose:** Enter the Ramble through a safe ground route or a faster elevated branch route. Both reconnect at the stream crossing.
4. **Hide:** A curious off-leash dog patrols the clearing. Freeze under fern cover or use height to cross unnoticed.
5. **Recover:** Forage leaves/berries to restore exertion and discover an optional “city memory” vignette.
6. **Climb:** Ascend a hero tree using highlighted grip points, branch balance, and a short stamina challenge as wind and rain intensify.
7. **Escape:** A branch failure triggers a controlled slide/swing sequence. The player times reaches to transfer between branches.
8. **Sanctuary:** Reach a canopy nest overlooking the skyline. Results show time, discoveries, stealth, and “slothful style,” then offer replay/settings.

### 3.2 Repeatable moment-to-moment loop

**Observe → choose a route → traverse/grip → manage exertion and exposure → forage/discover → reach a safe perch → reorient.**

- Observation reveals grip points, edible plants, threats, and alternate paths.
- Traversal spends exertion only during demanding actions; ordinary slow locomotion is free.
- Holding still restores grip and reduces threat awareness, making patience mechanically valuable.
- Foraging restores exertion and can unlock optional narration/environmental details.
- Safe perches act as checkpoints and frame vistas/objectives.

### 3.3 Success, failure, and replay

- There is no health bar and no graphic injury.
- Losing all grip during a risky traversal triggers a short, authored tumble to the latest safe perch, with no loading screen and at most 8 seconds of lost progress.
- Full threat detection triggers a nonviolent chase/escape reset to the last cover point.
- Results support replay through three optional goals: find all 5 discoveries, pass the dog unseen, and finish with 3 “perfect reaches.”
- Target first completion: 8–12 minutes. Target completionist run: 15–20 minutes.

## 4. Scope boundaries

### In the vertical slice

- One contiguous, highly dressed route approximately 180 m long and 45 m vertically, divided into three streamed environment cells.
- Two route forks that rejoin, three checkpoints, one stealth encounter, one climax traversal, one ending vista.
- First-person sloth body with two visible forelimbs, procedural head/body motion, and authored interaction animations.
- Ground locomotion, branch locomotion, climbing/gripping, reach timing, foraging, inspect/focus, hiding, and scent guidance.
- One dog threat with a readable patrol/suspicion state machine; ambient noninteractive wildlife and distant human silhouettes.
- Title, pause, settings, tutorial prompts, checkpoint feedback, results, and reduced-feature fallback messaging.
- Spatial ambient mix, reactive score, interaction Foley, captions, and audio accessibility controls.

### Explicitly out of scope

- Full Central Park recreation, multiplayer, combat, inventory crafting, open-ended survival, day/night cycle, weather simulation beyond the authored shift, dynamic crowds, vehicles, save accounts, mobile controls, VR, or procedural world generation.
- Fully simulated inverse-kinematic free climbing. The slice uses curated grip volumes and animation-assisted reaching for reliability.
- Live service, monetization, user-generated content, or backend persistence beyond local settings/best results.

## 5. Controls and interaction contract

### 5.1 Default keyboard and mouse

| Action | Input | Behavior |
|---|---|---|
| Look | Mouse | Pointer-locked camera; sensitivity and invert-Y configurable |
| Move | `W A S D` | Camera-relative, speed tuned to sloth gait |
| Focus / scent sense | Hold `Q` | Softens color, outlines nearby grips/food/objective scent; drains no resource |
| Reach / interact | Hold `E` or left mouse | Context-aware hand reach, forage, inspect; release commits grip |
| Brace / grip | Right mouse or `Shift` | Stabilizes on branch, reduces sway and detection; pauses exertion recovery briefly |
| Exert | `Space` | Context action: pull-up, lunge, swing transfer; spends exertion |
| Crouch / tuck | `C` or `Ctrl` | Lowers profile in cover and under obstacles |
| Pause | `Escape` | Releases pointer lock and opens pause menu |

### 5.2 Gamepad-ready mapping

Gamepad support is a stretch goal only after keyboard/mouse acceptance. If enabled: left stick move, right stick look, left trigger focus, right trigger reach, left bumper brace, south face button exert, east face button tuck, menu button pause. Prompts must switch by last-used device.

### 5.3 Input feel requirements

- Pointer lock is requested only after a clear “Enter the Park” click; loss of lock pauses input safely.
- Raw camera input updates every render frame; movement uses fixed-timestep simulation.
- Camera yaw is unrestricted; pitch clamps near ±80°. Head bob is low-frequency and amplitude-limited.
- Interaction target selection uses camera ray + proximity + facing score. Target switching must be stable through a 10% hysteresis band to avoid flicker.
- A context label appears only within actionable range. It includes verb and key, e.g. “Hold E — Reach.”
- Controls are fully remappable in architecture even if the first UI offers presets rather than arbitrary binding.
- Never require rapid repeated input, simultaneous holds of more than two controls, or a hold longer than 2.5 seconds.

## 6. Mechanics specification

### 6.1 Locomotion

- Ground speed: roughly 1.25 m/s; branch speed: 0.8 m/s; brace speed: 0.35 m/s.
- Acceleration/deceleration is eased, but input-to-visible-response begins within one frame.
- Capsule collision drives the root. Step handling accepts obstacles up to 0.18 m; larger obstacles require a contextual pull-up.
- A surface system supplies foot/hand audio, small camera response, particles, and traction category.
- Traversable branches use simplified collision hulls separate from render meshes.

### 6.2 Grip and reach

- Curated `GripPoint` nodes define hand target, surface normal, radius, risk, and next-neighbor links.
- When the reticle enters a valid point, the nearer hand ghosts subtly toward it; holding reach fills a 0.35–0.8 second commit window based on distance/risk.
- “Perfect reach” occurs when released in the final 20% of the window, reducing exertion cost and playing premium haptic/audio/visual feedback.
- The root follows a constrained spline between safe anchors while hands use lightweight IK/animation blending. Collision remains authoritative.
- Invalid reaches cancel cleanly without consuming exertion.

### 6.3 Exertion and recovery

- Exertion is a 0–100 meter used only for lunge, pull-up, sustained exposed climb, and emergency brace.
- Normal traversal does not drain it. Resting on a perch recovers at 22 units/s; holding still elsewhere recovers at 12 units/s; food restores 25 units.
- Below 25 units, breath and hand tremor increase; actions remain possible but commit windows narrow slightly.
- At zero, the current action ends at the nearest safe anchor rather than causing an unpredictable physics fall.

### 6.4 Scent/focus sense

- Hold-to-use perception mode, not a detective-mode replacement for art readability.
- Shows objective direction as drifting pollen, food as warm specks, grips as edge highlights, and threats as directional audio rings if obscured.
- Range: objective 30 m, food 12 m, grip 7 m, threat cues 18 m.
- Onboarding uses it once; all critical paths remain readable without it.

### 6.5 Stealth

- Dog AI states: `Patrol → Curious → Investigate → Alert → Chase → Return`.
- Detection combines distance, view cone, exposure, motion multiplier, and recent sound impulses.
- Player-facing feedback is diegetic first (ears turn, leash tag/footsteps, bark, music layer), plus a configurable high-contrast suspicion arc.
- Remaining fully still in dense cover reduces detection rapidly; elevated branches reduce it moderately.
- The encounter supports a no-detection route, a recoverable partial detection, and a short chase path. No fail state costs more than 8 seconds.

### 6.6 Checkpoints and state

- Checkpoint snapshot stores transform, route flags, collectibles, tutorial completion, exertion, threat reset state, and authored weather/score phase.
- Auto-checkpoint feedback is a quiet leaf curl icon plus a short audio cue; no blocking toast.
- Settings and best results persist in `localStorage`; run state persists only for accidental refresh when schema/version matches.

## 7. World and encounter beats

### Cell A — Park edge / “The Arrival” (0–3 minutes)

- **Hero view:** Wet asphalt, conservation van, stacked Manhattan facades beyond mature trees, warm sun breaking after rain.
- **Tutorial sequence:** Look → move → scent → forage → reach onto fallen elm → brace across branch.
- **Storytelling:** Open crate, keeper’s gloves, rescue tag, radio mentioning a damaged sanctuary enclosure. No exposition dump.
- **Optional discovery 1:** Monarch on milkweed. Optional discovery 2: weathered park map plaque.
- **Checkpoint:** Hollow log at the Ramble threshold.

### Cell B — Ramble understory / “The Crossing” (3–7 minutes)

- **Hero view:** Bedrock cleft and shallow stream with distant bridge arch.
- **Route fork:** Ground path offers food and concealment; upper branch route is shorter and tests grip timing.
- **Threat beat:** Off-leash dog enters after player crosses a trigger that cannot be approached from behind. Three cover islands and one elevated bypass guarantee readability.
- **Optional discovery 3:** Red-tailed hawk feather. Optional discovery 4: scratched initials on old stone, treated as atmosphere rather than a real-world claim.
- **Checkpoint:** Sheltered rock shelf beyond the stream.

### Cell C — Hero tree / “The Ascent” (7–12 minutes)

- **Hero view:** Giant elm framing a skyline silhouette and hints of Bethesda Terrace-inspired masonry in the distance.
- **Escalation:** Wind rises, leaves shed, distant thunder and sirens layer into score. Exertion tutorial is tested without new UI.
- **Climax:** Three authored reaches, a cracking branch, then a 12–18 second controlled transfer sequence. Accessibility assist can auto-time the releases.
- **Optional discovery 5:** A hidden ribbon/nesting token tied to the sanctuary.
- **Ending:** Canopy nest, sunset/rainbow rim light, skyline reveal, keeper’s distant radio call. Results emerge without cutting away from the vista.

### Pacing budget

| Beat type | Target spacing | Maximum uninterrupted duration |
|---|---:|---:|
| Navigation decision | 15–25 s | 30 s |
| Safe scenic pause | 60–90 s | 20 s forced framing |
| New mechanic/tutorial | At most one per minute | 10 s prompt visibility |
| High tension | 2 authored peaks | 45 s each |
| Checkpoint | 2–4 min | 8 s replay cost after failure |

## 8. Art direction and content strategy

### 8.1 Visual target

- **Look:** Cinematic naturalism with slightly compressed, filmic color; rain-darkened bark, translucent leaf edges, warm skyline against cool understory.
- **Scale:** Low eye height and foreground detail make the player feel small. Distant city geometry is simplified but silhouette-accurate in spirit.
- **Signature materials:** Layered bark with moss/lichen masks, wet rock with restrained specular breakup, leaf atlas with thickness/transmission approximation, matted sloth fur shell at frame edges.
- **Hero assets:** Sloth arms/claws, elm trunk/limbs, transport crate/van vignette, stream/rock crossing, canopy nest, dog.
- **Reuse:** Modular branch kit, three trunk families, six rock forms, four ground scatter sets, eight understory plant clusters, two distant-building kits.

### 8.2 Browser-conscious rendering stack

- Three.js WebGL renderer with a capability gate; WebGPU can be evaluated only as a later enhancement, never the sole path.
- Physically based materials, baked/painted global-lighting cues, one shadowed key light, hemisphere/fill lighting, reflection environment, and localized fake bounce.
- Cascaded shadows are avoided unless profiling proves affordable. Use one tightly fitted shadow map around the player plus baked contact/AO information.
- Post-processing baseline: tone mapping, subtle bloom, color grade, vignette, low-cost FXAA/SMAA. Optional quality tier adds SSAO and improved reflections.
- Instanced foliage/rocks, merged static geometry, texture atlases, KTX2/Basis compression, Draco or Meshopt-compressed GLB, impostors/billboards for skyline and distant canopy.
- Wind uses vertex animation with per-instance phase; close hero foliage can add interaction response.
- No unbounded particles, real-time planar reflections, per-leaf physics, or alpha-overdraw-heavy grass carpets.

### 8.3 Asset provenance and consistency

- Maintain an asset manifest with source/license, author, modification notes, triangle count, texture memory, LODs, and collision status.
- Generated or sourced assets must be art-directed through a shared material/texel-density pass; avoid an assemblage of mismatched stock assets.
- Real brand marks, identifiable private individuals, and copied landmark scans are excluded unless clearly licensed.
- Texture target: 512 px/m for hero surfaces, 256 px/m for midground, atlased 1K/2K foliage. 4K maps require explicit budget approval.

## 9. Camera, animation, effects, and audio

### 9.1 Camera comfort

- Default FOV 75°, adjustable 60–95°. Never animate FOV by more than 4° unless the motion setting is enabled.
- Separate visual camera from physics root. Apply filtered gait sway after look rotation so input remains precise.
- Collision prevents near-plane penetration. Cinematic framing never takes camera control during active traversal.
- Camera shake, gait sway, motion blur, depth of field, vignette, and branch roll each expose off/reduced settings.

### 9.2 Animation plan

- First-person arms: idle/grip cycles, left/right reach, pull, forage, brace, slide, landing, and exhausted variants.
- Procedural layers: look-dependent shoulder offset, hand IK to authored grips, breath, wind response, surface-normal alignment.
- Dog: locomotion blend, sniff, investigate, alert, bark, turn, and retreat. Root motion is converted to nav/state-machine motion for deterministic behavior.
- Ambient wildlife is animation-loop or shader-driven and non-colliding.

### 9.3 Effects

- Sparse rain cards/droplets around the camera, wetness material parameter ramp, branch debris at climax, pollen/scent motes, leaf gusts, and restrained lens droplets.
- Effects must telegraph gameplay: reach confirmation, exertion warning, threat direction, and checkpoint all have distinct visual languages.

### 9.4 Audio plan

- Layered ambience zones: park edge, understory, stream, canopy, distant city.
- Surface-aware claw/branch/leaf Foley, cloth/crate sounds, breath/exertion, food crunch, branch strain, dog tags/paws/barks.
- Reactive score has explore, suspicion, escape, and sanctuary stems with beat-aware crossfades.
- Web Audio spatialization for nearby sources; stereo beds for broad ambience. Cap concurrent voices and pool sources.
- Audio begins only after user gesture. Provide master/music/ambience/SFX/voice sliders, mute, captions, and visual threat cues.

## 10. UI, onboarding, and narrative delivery

- Title opens over a live or pre-rendered hero composition with `Enter the Park`, `Settings`, and quality selector. One click begins audio and pointer-lock flow.
- HUD is minimal: small center reticle, exertion leaf ring during use/recovery, objective scent only when requested, contextual action prompt, suspicion arc only during threat.
- Tutorials are action-led, dismiss as soon as successfully performed, and never cover the center interaction area.
- Pause includes resume, restart checkpoint, controls, accessibility, graphics, audio, and exit to title.
- Results: completion time, discoveries `x/5`, unseen status, perfect reaches, replay, and return to title.
- Narrative is environmental and captionable. Avoid mandatory voiceover and large lore panels during movement.

## 11. Accessibility requirements

Accessibility is part of definition of done, not a post-polish stretch.

### Input and motor

- Toggle/hold options for brace, focus, tuck, and reach.
- Climb assist levels: `Standard`, `Extended timing` (+60% commit windows, slower exertion loss), `Story` (auto-commit valid reaches and prevent grip reset).
- No rapid tapping or mouse precision requirement. Increase interaction target size independently of visual geometry.
- Pause at any time except the title transition; focus loss auto-pauses.
- Keyboard-only menu operation with visible focus and logical focus return. Pointer lock is never required for menus.

### Visual

- Scalable interface at 100/125/150/175%; minimum 18 px base at 1080p and WCAG AA contrast for essential UI.
- High-contrast interaction outlines and independent reticle size/color/opacity.
- Color is never the only signal. Scent categories differ by shape, motion, and sound.
- Motion controls: reduce camera sway, disable shake, disable motion blur/DOF, static menu background, reduced particles.
- Brightness/gamma calibration; avoid lightning flashes above safe frequency/intensity and offer `Reduce flashes`.

### Hearing and cognition

- Captions for speech and important non-speech audio with speaker/source labels and directional arrows where relevant.
- Subtitle size/background options. All tutorial text remains available in pause → controls.
- Objective reminder and optional persistent next-action prompt.
- Threat cues have synchronized visual feedback; perfect-reach timing has visual and audio feedback.
- Clear language, one instruction at a time, and no critical time pressure outside an assistable authored sequence.

### Validation

- Full completion test with audio muted, with color desaturated, with keyboard only, at 200% browser zoom where layout permits, and with `prefers-reduced-motion` enabled.
- Screen-reader semantics apply to all HTML shell/menu UI. The 3D play space provides an accessible summary and settings path, while gameplay is documented as visual/motor interactive content.

## 12. Technical architecture

### 12.1 Runtime boundaries

- Keep the route shell and metadata server-renderable; dynamically load the game client after capability detection.
- A single `GameApp` owns renderer lifecycle, resize, visibility, pause, and disposal. React owns shell/menus/HUD; it does not rerender the scene graph each frame.
- Fixed simulation step at 60 Hz with accumulator and capped catch-up; render uses interpolation. On long tab stalls, discard excess accumulated time.
- Core services: `Input`, `Clock`, `AssetManager`, `WorldStreamer`, `PlayerController`, `InteractionSystem`, `ThreatDirector`, `AudioDirector`, `SaveState`, `QualityManager`, `Telemetry` (local/dev by default).
- Systems communicate through typed events/state, not DOM queries or cross-module mutable globals.
- All animation frames, observers, listeners, audio nodes, GPU resources, and pointer-lock handlers are disposed on unmount/restart.

### 12.2 Suggested project shape

```text
app/
  page.tsx                 # metadata and game shell
  game/
    GameClient.tsx         # client boundary, boot/error/quality states
    GameCanvas.tsx         # renderer lifecycle
    hud/                   # HUD, pause, settings, results, captions
game/
  core/                    # clock, events, assets, quality, persistence
  input/                   # normalized actions and binding maps
  player/                  # controller, camera, grip/reach, exertion
  world/                   # cell manifests, streaming, collisions, checkpoints
  ai/                      # dog state machine and perception
  audio/                   # buses, zones, captions, reactive score
  rendering/               # materials, post, foliage, effects, LOD helpers
  data/                    # tuning constants and authored encounter data
public/game/
  models/ textures/ audio/ env/ data/
tests/
  unit/ integration/ e2e/
```

### 12.3 Content pipeline

- Each world cell has a manifest listing render GLBs, collision GLBs, audio zones, spawn/checkpoint markers, and dependency sizes.
- Run offline asset validation for dimensions, texture formats, missing tangents, NaNs, LOD naming, collision complexity, and license metadata.
- Loading order: shell (<150 KB compressed app-specific JS target) → minimum playable cell/avatar/UI → remaining Cell A → Cells B/C in the background.
- Show real progress by bytes/assets where available. A recoverable asset failure offers retry and reduced-quality mode.
- Dev debug overlay toggles FPS, frame time, draw calls, triangles, GPU estimate, cell state, player state, target grip, AI state, and checkpoint actions.

## 13. Performance and delivery budgets

Budgets are acceptance gates measured after a warm browser launch on representative hardware, not aspirations.

### 13.1 Quality tiers

| Tier | Representative device | Resolution strategy | Target |
|---|---|---|---|
| High | Apple M2 / RTX 2060-class | DPR cap 1.5, 90–100% render scale | Stable 60 FPS, 16.7 ms frame |
| Medium (default auto) | 2019 Intel MacBook Pro / integrated modern GPU | DPR cap 1.25, dynamic 75–100% | ≥45 FPS typical, no sustained <30 |
| Low | older integrated GPU | DPR cap 1.0, dynamic 60–85%, reduced foliage/post/shadows | Stable 30 FPS, 33.3 ms frame |

Automatic quality uses a short nonblocking calibration plus rolling frame-time hysteresis. It steps down after sustained pressure and never oscillates rapidly. Manual selection overrides auto until reset.

### 13.2 Runtime budgets

| Budget | High | Medium | Low |
|---|---:|---:|---:|
| Draw calls in gameplay | ≤220 | ≤160 | ≤110 |
| Visible triangles | ≤1.5 M | ≤900 K | ≤500 K |
| GPU texture memory estimate | ≤384 MB | ≤256 MB | ≤160 MB |
| Shadowed lights | 1 | 1 | 1 reduced map |
| Dynamic local lights | ≤6 unshadowed | ≤3 | ≤1 |
| Particle count | ≤2,000 | ≤900 | ≤350 |
| Concurrent audio voices | ≤40 | ≤28 | ≤20 |
| Main-thread long tasks after play starts | none >50 ms during traversal | same | same |
| Simulation CPU target | ≤3 ms/frame | ≤4 ms/frame | ≤6 ms/frame |

### 13.3 Network/startup budgets

- Initial HTML/CSS/app bootstrap: ≤350 KB compressed total, excluding framework costs that cannot be split further.
- First interactive title on broadband desktop: ≤2.5 seconds cold; on simulated Fast 3G: useful loading UI ≤3 seconds.
- Minimum playable payload (Cell A core, avatar, collision, UI, essential audio): ≤12 MB compressed.
- Total vertical-slice transfer: target ≤45 MB, hard cap 65 MB compressed.
- No single texture >2 MB compressed and no single audio file >4 MB without explicit review.
- Cache immutable content-hashed assets for one year; version manifests separately. Preload only critical first-cell content.

### 13.4 Memory and resilience

- JS heap target ≤180 MB after full route; total GPU/asset footprint follows tier budgets.
- Unload previous high-detail cell content after the next checkpoint while retaining low-detail vista geometry.
- Handle WebGL context loss with a pause and one rebuild attempt; preserve checkpoint/settings.
- On unsupported WebGL or severe allocation failure, show an accessible explanation and device/quality guidance instead of a blank canvas.
- Pause simulation and nonessential audio when hidden; resume with a short clock reset.

## 14. Testing and quality strategy

### 14.1 Automated

- Unit: exertion curves, checkpoint serialization/versioning, action binding, reach scoring/hysteresis, detection math, quality-tier decisions.
- Integration: start → pointer lock → tutorial completion; checkpoint fall/reset; dog state transitions; setting persistence; context-loss recovery boundary.
- Browser E2E: title, loading/error states, pause/resume, results, keyboard navigation, reduced-motion setting, responsive shell.
- Build smoke test validates route HTML plus asset-manifest references and size budgets.
- Deterministic simulation seed and debug commands allow repeatable AI/traversal tests.

### 14.2 Manual matrices

- Latest and previous Chromium, Firefox, and Safari on macOS; Chromium/Firefox on Windows.
- High/medium/low tiers, 1080p and 1440p, high-DPI and 100% scale.
- Fresh cache, warm cache, throttled CPU/network, offline after load, tab background/restore, resize/fullscreen, pointer-lock denial, audio autoplay restrictions.
- Input: trackpad, high-DPI mouse, keyboard-only menus, optional gamepad if shipped.
- Accessibility completion matrix described above.

### 14.3 Playtest gates

- 90% of first-time testers move and look without assistance within 30 seconds.
- 80% understand scent and complete one reach within 2 minutes.
- 90% recover from a failed grip without believing progress was lost.
- 75% finish the slice without facilitator intervention.
- Median first run 8–12 minutes; fewer than 10% report camera discomfort at defaults.
- At least 70% can name one sloth-specific mechanic and one memorable Central Park/city detail afterward.

### 14.4 Severity and ship policy

- **P0:** crash, save corruption, blank screen, inaccessible menu trap, or cannot complete. Zero open.
- **P1:** repeatable progression block, input loss, severe performance failure, broken checkpoint, missing critical cue. Zero open.
- **P2:** major visual/audio defect, isolated accessibility failure, quality-tier breach. Must be fixed or explicitly accepted with owner.
- **P3:** polish issue. Triaged against stability and budget.

## 15. Phased milestones and logical commit plan

Each milestone ends in a playable build, measurement snapshot, and focused commit(s). Avoid a single “big bang” integration.

### M0 — Preproduction lock (0.5 day)

**Deliver:** This plan, experience reference board, asset/license manifest template, tuning sheet, device matrix, and final route blockout sketch.

**Exit:** Scope, budget, control contract, route beats, and acceptance metrics agreed. No asset is acquired without a provenance entry.

**Commit:** `docs: define Sloth in the City vertical slice production plan`

### M1 — Runtime foundation (1 day)

**Deliver:** Client-only game boundary; canvas lifecycle; renderer, resize and visibility handling; fixed-step clock; input abstraction; pointer-lock flow; boot/progress/error shell; quality capability detection.

**Exit:** A simple scene runs/restarts without leaked canvases/listeners; pause and pointer-lock denial are safe; build/lint/tests pass.

**Commits:**

1. `feat: establish game runtime and loading shell`
2. `test: cover runtime lifecycle and input state`

### M2 — Greybox core loop (1–1.5 days)

**Deliver:** Three-cell greybox; collisions; player ground/branch locomotion; camera comfort settings; grip points; reach/exertion; checkpoints; debug overlay.

**Exit:** Start-to-sanctuary route is completable with primitives, all failure paths recover, no checkpoint costs >8 seconds, simulation remains stable across frame-rate changes.

**Commits:**

1. `feat: add sloth locomotion and camera controller`
2. `feat: implement grip reach and exertion loop`
3. `feat: build streamed Central Park greybox and checkpoints`

### M3 — Encounter and progression (1 day)

**Deliver:** Scent/focus, foraging, discoveries, route fork, dog perception/state machine, cover, chase reset, ending/results, tutorial progression.

**Exit:** All core beats and three replay goals function; encounter is readable through diegetic and UI feedback; AI is deterministic under test seed.

**Commits:**

1. `feat: add focus foraging and discovery systems`
2. `feat: add dog stealth encounter and recovery paths`

### M4 — Visual production (1.5–2 days)

**Deliver:** Authored environment meshes or approved sourced assets; compressed textures/models; foliage instancing; skyline; sloth arms; dog visuals; wetness/wind; lighting; post; particles; LODs.

**Exit:** Every cell has a hero vista, foreground/midground/background separation, collision/render meshes remain distinct, and medium tier stays within budgets.

**Commits:**

1. `feat: establish Central Park materials lighting and atmosphere`
2. `feat: dress the Ramble route with optimized foliage and props`
3. `feat: add first-person sloth body and traversal animation`

### M5 — Audio, UI, and accessibility (1 day)

**Deliver:** HUD/menu/results visual system; layered ambience; Foley; reactive score; captions; complete settings; control alternatives; climb assists; reduced motion/high contrast/UI scaling.

**Exit:** Slice completes muted, keyboard-only for menus, reduced-motion, desaturated, and Story climb assist. All settings persist and apply live where safe.

**Commits:**

1. `feat: add reactive park audio and gameplay feedback`
2. `feat: polish HUD menus onboarding and results`
3. `feat: add accessibility and comfort suite`

### M6 — Optimization and hardening (1 day)

**Deliver:** Tiered quality profiles; dynamic resolution; streaming/unloading; context-loss handling; asset size report; browser/device fixes; performance capture for all representative tiers.

**Exit:** Meets network/runtime/memory budgets, zero P0/P1 defects, no sustained low-tier <30 FPS in the route, and no runtime long tasks >50 ms during traversal.

**Commits:**

1. `perf: add adaptive quality and world streaming budgets`
2. `fix: harden browser lifecycle and recovery paths`
3. `test: add cross-browser gameplay and accessibility coverage`

### M7 — Final polish and release candidate (0.5–1 day)

**Deliver:** Playtest-derived tuning, visual/audio polish, final licensing audit, metadata/social image, user-facing browser guidance, production build smoke test.

**Exit:** Playtest metrics pass, automated/manual matrices signed off, cold/warm load checked, licenses complete, and release candidate reproducible from a clean checkout.

**Commits:**

1. `polish: tune traversal encounter pacing and presentation`
2. `chore: finalize release assets and production checks`

## 16. Production risks and mitigations

| Risk | Warning sign | Mitigation / fallback |
|---|---|---|
| Photoreal assets overwhelm browser budgets | >45 MB before Cell B or medium tier <45 FPS | Lock texel density, convert to KTX2, decimate/LOD, replace distant assets with cards, favor lighting/composition over geometry |
| Grip traversal feels automated or unreliable | Testers miss targets or fight camera | Curated nodes, generous scoring, hysteresis, animation assistance, Story assist; remove free-form climb claims |
| Sloth pace becomes dull | >30 s without a decision; abandonment before dog beat | Shorten distances, add route choices/observation rewards, advance threat/audio cues, never “fix” with generic sprint |
| Camera causes discomfort | Reports of nausea/disorientation | Reduce default sway, stable horizon, no forced look, expose individual motion toggles, use authored root paths for climax |
| React/runtime lifecycle leaks GPU resources | Duplicate canvas/audio after restart | Central ownership, explicit dispose registry, lifecycle integration test, debug renderer memory counters |
| Asset licensing is unclear | Missing source/license in manifest | Block asset merge; substitute owned procedural/simple content |
| AI becomes expensive or unpredictable | Dog state loops, nav jitter, test flakes | Small authored waypoint graph, explicit perception math, deterministic seeded timings, hard recovery transitions |
| Scope expands toward open world | Requests for new districts/systems before slice is stable | Enforce in/out list and milestone gates; add depth to existing route only after M3 completion |
| Safari/WebGL variation breaks effects | Black materials, audio/pointer issues | Baseline WebGL path, shader compile smoke scene, feature flags, simpler post fallback |

## 17. Definition of done

The vertical slice is complete only when all are true:

- A new player can enter from the title and finish the authored route without developer instruction.
- Arrival, tutorial, route choice, dog encounter, recovery, hero ascent, climax, sanctuary, and results all function.
- Sloth embodiment is visible/audible through arms, gait, grip, exertion, patience, and climbing—not merely stated in UI.
- Every failure is recoverable, no required action depends on perfect timing, and the last checkpoint is restored correctly after refresh/crash-safe resume.
- Visual, audio, UI, and narrative layers are coherent across all three cells; there are no placeholder primitives in the critical path.
- High, medium, and low quality tiers meet their frame-time, draw-call, triangle, memory, and transfer budgets on representative devices.
- Latest supported Chromium, Firefox, and Safari pass the smoke route; pointer-lock denial, tab restore, resize, audio restrictions, and context loss fail gracefully.
- Automated tests pass, asset/license manifest is complete, zero P0/P1 issues remain, and P2 exceptions are explicitly documented.
- Accessibility validation passes for muted play, reduced motion, high contrast/desaturation, keyboard menu navigation, scalable text, captions, and Story climb assist.
- A clean production build is reproducible, deployable, cache-correct, and contains no development overlays or unlicensed assets.

## 18. Post-slice opportunities (not commitments)

If the slice proves the controls, retention, and performance targets, the next expansion should deepen one pillar at a time: additional park biomes, keeper-guided rescue objectives, more animal threat/ally behaviors, weather variants, gamepad/mobile investigation, and a longer sanctuary journey. Each addition must preserve the deliberate sloth pace and browser budgets established here.
