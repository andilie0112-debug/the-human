# The Human — Roadmap and starter prompts (web 3D)

Work through the milestones in order. Each one ends with a link you can open on your phone. Paste the starter prompt into a Claude Code session on this repository (you can also write it in Indonesian). Do not move on until the acceptance checks pass.

## M0 — Project setup and auto-deploy

Starter prompt:
> Read CLAUDE.md and Design/GDD.md. Set up M0: Vite + TypeScript + three.js project with the folder layout from CLAUDE.md, Vitest, a Playwright smoke test, and a GitHub Actions workflow that tests, builds and deploys to GitHub Pages on every push to main. Copy Design/Data/*.json into src/data/. Show a simple 3D scene: a floor, a box and a capsule character, with orbit and pinch zoom on touch. Then tell me click by click how to enable GitHub Pages and which link to open.

Acceptance: the Pages link opens on your phone and shows the 3D scene; you can rotate and zoom with your fingers.

## M1 — Simulation core

Starter prompt:
> Build M1 in src/sim: GameClock (pause/1x/2x/3x, starting 1 Jan 2027 07:00), needs, mood, stress, health, money with transactions, monthly bills, salary on the 25th with BPJS and tax, THR timing per religion, Ramadan fasting hours, all driven by src/data. Cover every rule with Vitest tests. Add a HUD showing clock, money, speed buttons and need bars.

Acceptance: tests pass in CI; on the site the clock runs and need bars go down at each speed.

## M2 — Home live mode (greybox)

Starter prompt:
> Build M2: a 3D kos room (walls, floor, door, bathroom) with walls cut away facing the camera, the smart-object system, a placeholder humanoid with idle/walk/sit/sleep/eat animations, tap the floor to walk with pathfinding, tap an object to open its action menu, an action queue, and a life-sim camera (orbit, pan, pinch zoom). Objects: bed, fridge, stove, shower, toilet, desk, TV, and the worship object for each religion. Actions update needs through the sim core.

Acceptance: tap the floor and the character walks there; tap the bed, choose Tidur, the character walks over, lies down, and time fast-forwards.

## M3 — Real character and animations

Starter prompt:
> Build M3: replace the placeholder with a rigged glTF humanoid from a CC0 or licensed source (log it in ASSET_LICENSES.md), set up an animation state machine with smooth blending, and retarget animations onto it. Explain to me exactly which files I need to download (for example from Mixamo) and how to upload them to the repository from my browser, then convert them to optimized GLB in CI or with a script.

Acceptance: a proper human character walks, sits, sleeps and eats smoothly on the phone at a stable frame rate.

## M4 — Autonomy

Starter prompt:
> Build M4: utility-AI autonomy using advertised object actions, weighted by need urgency, traits and distance, with Off/Low/Full settings and thought bubbles.

Acceptance: left alone for a game day, the character eats, sleeps, showers and has fun without getting stuck.

## M5 — Character creator

Starter prompt:
> Build M5: character creator with a rotating 3D preview: name, gender, starting age, skin tone, body, hair and hijab styles, outfits, religion, father and mother ethnicity, city, two traits. Spawn that character in the kos. Use modular meshes or material swaps that stay mobile-friendly.

Acceptance: the created character appears in the kos with the chosen look; perantau status is correct.

## M6 — Phone and career

Starter prompt:
> Build M6: the in-game smartphone and apps Loker, M-Banking, Chat, Kalender and Notifikasi, plus the full job flow from GDD section 6 (weekly listings per city, CV, waiting, ghosting, interview scheduling and dialog, offer, starting next Monday, going to work, warnings, sick leave, promotion, layoffs) and save/load with export code.

Acceptance: from a new game you can get hired, work a week, get paid with a correct payslip, close the browser and continue later.

## M7 — Build/Buy mode

Starter prompt:
> Build M7: grid build/buy mode, Toko app with cash or paylater, storage, place/rotate/move furniture, feng shui score panel for Chindo characters, moving to a kontrakan or mortgaged house with a bigger floor plan.

## M8 — Neighborhood open world

Starter prompt:
> Build M8: a compact neighborhood scene (main road, gang alleys, kos, warung, market, café, gym, clinic, workplace gate, places of worship for all six religions, park, ojol base, bus stop) using instanced low-poly CC0 city assets. Third-person controller with virtual joystick and run, enter/exit the home, interaction zones at each place, pedestrian NPCs, motorbike and car traffic on waypoints, a rideable motorbike, day/night lighting, and phone-map fast travel with cost and time. Keep within the phone performance budget.

Acceptance: leave the kos, walk to the warung and eat, ride the motorbike to work during shift hours, come home, all smooth on the phone.

## M9 — Culture, events, social

Starter prompt:
> Build M9: data-driven random events, holidays and traditions from GDD sections 8 and 10, worship actions and places, ethnicity events, mudik and holidays via the Tiket app, NPC relationships, dating and weddings with ethnicity ceremonies.

## M10 — Ten cities, polish, installable app

Starter prompt:
> Build M10: city variants loaded lazily (signage, food stalls, skyline landmarks, transport names, climate, floods), graphics settings, audio, a performance pass, and make the game an installable PWA so it can be added to the phone home screen. Then explain the options for publishing to the Play Store later (for example a Trusted Web Activity).

## Swapping in real art

Start with placeholders. When you find assets you like, upload them through GitHub's "Add file > Upload files" into `public/assets/raw/`, then ask Claude Code: "Optimize and use these files for <object>, log the license, keep every interaction working."
