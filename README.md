# Sloth in the City

[![Sloth in the City — a cinematic New York City browser adventure](public/social/sloth-in-the-city-og-v2.jpg)](https://www.slothinthecity.com/)

**[Play Sloth in the City](https://www.slothinthecity.com/)**

Sloth in the City is a cinematic, first-person browser adventure built with Three.js and Next.js. You play as a displaced sloth making a slow, improbable journey across New York City: forage and climb through Central Park, cross The Lake, navigate the subway, find your friends at the Bronx Zoo, and lead the growing group home through the American Museum of Natural History.

The game is designed to run directly in a modern browser on desktop or touch devices. No account, API key, database, or other external service is required for local development.

## What is in the game?

- A continuous story spanning Central Park, the subway, the Bronx Zoo, Manhattan streets, the museum, and a homecoming finale.
- Sloth-specific traversal with climbing, gripping, branch transfers, controlled descents, swimming, and scent vision.
- Rowboats, a park utility cart, the subway, a skateboard, a museum shuttle, and electric scooters.
- Optional animal encounters and companions that can join the campaign.
- Adaptive graphics, spatial audio, keyboard and mouse controls, and a touch-first mobile HUD.
- Project-authored characters and animals with reproducible asset pipelines and dedicated visual QA scenes.

## Quick start

### Requirements

- [Node.js](https://nodejs.org/) `22.13.0` or newer
- npm (included with Node.js)

### Run locally

```bash
git clone https://github.com/alexandriax/slothinthecity.git
cd slothinthecity
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and select **Enter the Ramble**. Headphones are recommended.

No environment variables are required. `SITE_URL` is optional and only overrides the canonical URL used by social metadata; it defaults to `https://www.slothinthecity.com`.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `W A S D` or arrow keys | Left stick |
| Look | Mouse | Drag the right side of the screen |
| Interact, climb, enter, or exit | `E` | Contextual action button |
| Hold a grip | `Shift` | **Grip** |
| Descend or release | `Ctrl` or `Space` | **Down** |
| Scent vision | `C` | **Sense** |
| Pause | `P` | **Pause** |
| Mute or unmute | `M` | Audio settings |

Vehicle prompts appear in the HUD. Most vehicles use `W` / `S` for throttle, `A` / `D` to steer, `Space` to brake, and `E` to exit.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the standard Next.js development server |
| `npm run build` | Create a production Next.js build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint across the project |
| `npm test` | Build the game and run the full Node test suite |
| `npm run animals:manifest` | Rebuild the approved authored-animal runtime manifest |
| `npm run dev:sites` | Run the Cloudflare/vinext development target |
| `npm run build:sites` | Build the Cloudflare/vinext target |

For a clean dependency install in CI, use `npm ci` instead of `npm install`.

## Project structure

```text
app/                         Next.js routes, UI, game systems, and Three.js worlds
public/game/                 Runtime art, audio, models, textures, and Draco decoder
public/social/               Open Graph and social-sharing artwork
tests/                       Campaign, rendering, controls, asset, and regression tests
tools/animal-pipeline/       Reproducible animal source, validation, and export tools
tools/character-pipeline/    Reproducible human-character build pipeline
skills/                      Repository-specific production guidance and checks
```

The main experience is mounted at `/`. Two focused review routes are also available during development:

- `/debug/animals` — authored-animal lineup, animation, contact, and LOD review
- `/debug/characters` — human-character lineup, face, profile, idle, walk, and LOD review

## Development and contribution notes

Before changing production characters or animals, read [`AGENTS.md`](AGENTS.md). Those assets follow project-specific authorship, provenance, source-retention, runtime-contract, and visual-review requirements. Relevant entry points include:

- [`tools/animal-pipeline/README.md`](tools/animal-pipeline/README.md)
- [`tools/character-pipeline/README.md`](tools/character-pipeline/README.md)
- [`skills/create-premium-characters/SKILL.md`](skills/create-premium-characters/SKILL.md)

Keep changes working on both desktop and touch layouts, and run the focused tests for the systems you modify. Before opening a pull request, the standard baseline is:

```bash
npm run lint
npm test
```

## Deployment

The production site is a standard Next.js app:

```bash
npm run build
npm run start
```

Set `SITE_URL` when deploying to a different canonical domain. The repository also includes vinext commands and [`.openai/hosting.json`](.openai/hosting.json) for the Cloudflare/Sites-compatible target.
