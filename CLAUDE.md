# The Human — project instructions for Claude Code

The Human is a 3D life-simulation game that runs in the web browser (phones first, also tablets and PCs), set in realistic everyday Indonesian life. It plays like a life sim (a house you live in, a character with needs, a career, relationships) combined with a small open world you can walk and ride around. It is an original game. See `Design/GDD.md` for the full design and `Design/ROADMAP.md` for the milestone plan.

## Who you are working with

- The owner is not a professional programmer. He knows the design deeply, works mostly from Claude Code cloud sessions, and tests by opening the deployed game in his phone or PC browser.
- Reply to him in informal Indonesian. Keep code, comments, file names and commit messages in English.
- Work in small, playable steps. Every milestone must end with a deployed build he can open from the GitHub Pages link. Tell him exactly what to tap and what he should see.
- Do not start the next milestone until he confirms the current one works.
- Before large changes (new library, restructuring, deleting assets) explain the plan in two or three sentences and ask first.
- He cannot run commands locally. Anything that needs a manual step on GitHub (enabling Pages, repository settings) must come with click-by-click instructions.

## Tech stack (decided)

- Language and build: TypeScript, Vite, npm.
- 3D: three.js (pin an exact version). Physics and character collision: `@dimforge/rapier3d-compat`. Pathfinding indoors: a navigation mesh or grid A* (choose the simplest that works; `three-pathfinding` is acceptable).
- UI: HTML/CSS overlay on top of the canvas (no heavy UI framework). The in-game smartphone is built in HTML.
- Assets: glTF/GLB only, loaded with `GLTFLoader`, compressed with Draco or Meshopt and KTX2 textures where it helps. Animations retargeted to one shared humanoid skeleton.
- Testing: Vitest for the simulation core. Playwright smoke test (game loads, no console errors) in CI.
- Deploy: GitHub Actions builds on every push to `main` and publishes to GitHub Pages. Set Vite `base` to the repository name.
- Saves: versioned JSON in IndexedDB (via a small wrapper) behind a `SaveStorage` interface, with export/import as a text code. Cloud save later.

## Performance budget (phones are the target)

- 30 fps on a mid-range Android phone in Chrome; 60 fps on PC.
- Under 150k triangles on screen, under 100 draw calls in the home, under 200 in the neighborhood. Use instancing for repeated props, LODs for buildings, and a capped device pixel ratio (max 1.5 on phones).
- First load under 15 MB on Low graphics; load the neighborhood and city variants lazily. The owner decided (2026-11-27) that better graphics are worth a bigger download: Medium/High may load extra HD assets (sharper textures, photographed skies, better models) on top, loaded lazily and only for those settings, keeping the whole site well under 100 MB.
- Pause rendering when the tab is hidden. Avoid per-frame allocations in the game loop.
- Provide a Graphics setting: Low (no shadows, low resolution), Medium, High.

## Architecture rules

1. **Simulation core is plain TypeScript with no three.js or DOM imports** (`src/sim/`). Time, needs, mood, money, jobs, relationships, events and calendar live there and are covered by Vitest tests. Rendering and UI read state and send commands.
2. **Data-driven.** All content (cities, religions, ethnicities, jobs, objects, events, holidays, interview questions, traits, trips) lives in JSON under `src/data/`. Start from the files in `Design/Data/`. Validate data at load time.
3. **Smart objects.** Each interactable object advertises its actions and the needs each action satisfies. The character AI scores advertised actions (utility AI) for autonomy; the player can queue actions directly. Adding an object never requires editing character code.
4. **One game clock** with Pause, 1x, 2x, 3x. One in-game day at 1x takes about 12 real minutes. Sleep and work fast-forward.
5. **Scenes:** MainMenu, CharacterCreator, Home (live and build mode), Neighborhood (open world). One scene renders at a time; simulation state lives in a persistent `GameSession`.
6. **Input:** touch first. Home: tap to move, tap objects, one-finger orbit, two-finger pan and pinch zoom. Neighborhood: virtual joystick, run and interact buttons. Also support mouse and keyboard on PC.

## Folder layout

```
src/
  sim/          pure TypeScript core (clock, needs, economy, jobs, social, calendar, events)
  data/         JSON content
  engine/       renderer setup, asset loader, input, camera rigs, audio
  characters/   character model, animation state machine, autonomy, appearance
  interaction/  smart objects, action queue
  home/         home scene, walls cutaway, build/buy grid
  world/        neighborhood scene, traffic, pedestrians, vehicles, day/night, weather
  ui/           HUD, phone shell and apps, dialogs
  save/
public/assets/  models, textures, audio (GLB, KTX2, OGG)
tests/          Vitest and Playwright
Design/         GDD, roadmap, source data, asset licenses
```

## Coding conventions

- Strict TypeScript, no `any` without a comment explaining why. ES modules. Small files with one responsibility.
- Dispose three.js geometries, materials and textures when leaving a scene.
- Every simulation rule gets a Vitest test (need decay, salary with BPJS and tax, THR timing, absences and warning letters, fasting hours, feng shui score, travel cost and time).
- Player-facing text is Indonesian and lives in `src/data/strings.id.json`, never hard-coded in logic.

## Content and culture rules

- All six recognized religions (Islam, Kristen, Katolik, Hindu, Buddha, Konghucu) and every ethnicity are equally viable. Worship gives calm and mood bonuses and never punishes the player for skipping.
- Show traditions, not stereotypes: ethnicity unlocks events and ceremonies, never personality traits, wealth or skill differences.
- Mixed parentage is supported: the character receives traditions from both parents.
- Wages use official 2026 minimum wages where known; estimates are flagged in data.

## Intellectual property rules

- The game must be original. Never use, recreate or reference assets, UI, icons, sounds, names or trademarks from existing commercial games.
- Only use assets with a clear license (CC0 packs, purchased packs, Mixamo). Log every asset in `Design/ASSET_LICENSES.md` with source URL and license before committing it.

## Definition of done for any task

- `npm run build`, `npm test` and the Playwright smoke test pass in CI.
- The GitHub Pages deployment is updated and loads without console errors.
- You have told the owner, in Indonesian, the link to open, what to tap and what he should see.
- Changes are committed to `main` with a clear English message.
