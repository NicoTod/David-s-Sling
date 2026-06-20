# The David's Sling

A 3D browser game built with **Three.js** for the *Interactive Graphics* course. You play as the young shepherd **David**: defend yourself with your sling against waves of lions across the desert of Judah, then face the giant **Goliath** in a final boss fight. The game is inspired by the biblical account in **1 Samuel 17**.

---

## Overview

David stands in an open desert pasture. Lions appear in the distance and advance toward him; you charge and release the sling to hurl stones along a parabolic arc and bring them down before they reach you. After enough lions are defeated, the Philistine army gathers on the horizon and **Goliath** strides forward for the final duel: you must strike his **forehead** to win, exactly as in the scripture.

Everything is rendered in real time in the browser. All characters and props are **built procedurally in code** (no external 3D model files), with a cartoon / cel-shaded look.

---

## Gameplay

- **Sling mechanic.** Hold to charge the throw (a power meter fills), release to fire. The stone follows a real parabolic trajectory under gravity, and a dotted **aiming preview** shows where it will land while you charge.
- **Reloading.** After each throw the sling is empty; press **Space** to load the next stone.
- **Lions.** They spawn far away and walk toward David with a procedural run cycle. A hit scores points; if a lion reaches David it deals damage to his health bar.
- **Levels.** Every `LIONS_PER_LEVEL` (5) kills raises the level and the pace.
- **Boss fight.** After `LIONS_BEFORE_BOSS` (25) lions, the shepherd scene gives way to the battlefield: the flock, staff and lyre disappear, the Philistine army appears, and Goliath enters. Goliath takes `GOLIATH_MAX_HEALTH` (3) hits **to the forehead** to be defeated; body hits are blocked. If he reaches David, it is game over.
- **Difficulty & settings.** Easy / Medium / Hard scale the challenge. Difficulty and all settings (music volume, effects volume, brightness, and David's tunic) are available **both on the intro screen and in-game** (through the on-screen settings panel), and the two copies stay in sync.

---

## Controls

| Action | Input |
| --- | --- |
| Aim | Move the **mouse** (David turns to face the target; the trajectory preview updates) |
| Charge the sling | **Hold** the left mouse button (power meter fills) |
| Throw the stone | **Release** the left mouse button |
| Reload the sling | **Spacebar** (load the next stone after a throw) |
| Switch camera view | **V** (toggles between third-person and David's first-person POV) |
| Toggle sound | **M** (or the sound button in the on-screen bar) |
| Open settings | **Settings** (gear) in the on-screen bar (music, effects, brightness, tunic) |
| Choose difficulty | **Difficulty** dropdown (on the intro screen and in-game) |
| Start the game | **Begin** button on the intro screen |

### Mobile / touch

On touchscreens the game switches to a touch layout automatically. **Drag** on the scene to aim, **hold** to charge, and **release** to throw; two on-screen buttons let you **Load** the next stone and change the **View**, and the sound and settings controls in the bottom bar work by tap.

---

## Running the game

The project uses native **ES modules** and an **import map**, so it must be served over HTTP - opening `index.html` directly with `file://` will not work.

Use this link to play the game: https://sapienzainteractivegraphicscourse.github.io/final-project-david-s-slinge/

---

## Project structure

The code is split into focused ES modules for readability.

| File | Responsibility |
| --- | --- |
| `index.html` | Entry point. Import map, HUD (health, score, level), the on-screen settings panel, and the intro / boss / victory / game-over overlays. |
| `main.js` | Orchestrator: scene, cameras, lights, the animation loop, input handling, level/boss logic, procedural animations, and UI wiring. |
| `entities.js` | Procedural 3D models (David, lion, Goliath, sheep, stone) and the toon materials. |
| `textures.js` | Procedural textures generated in code (sand color/normal/roughness, woven cloth, iris) and the value-noise helpers behind them. |
| `audio.js` | The `Sound` module: synthesized sound effects and a gentle ambient lyre loop (Web Audio API, no audio files). |
| `environment.js` | Battlefield dressing for the Goliath scene (Philistine army, planted spears, banners, boulders, dead scrub). |
| `physics.js` | Projectile parabola, stone–lion collision, and the sling-string physics. |
| `style.css` | Styling for the HUD, the settings panel, and the themed overlays. |
| `README.md` | This file. |

---

## Technical highlights

Built on **Three.js (r160)** with a `WebGLRenderer`. Notable graphics-course-relevant techniques:

- **Lighting (four lights, three types).**
  - `AmbientLight` : uniform base fill.
  - `DirectionalLight` : the sun, with **PCF soft shadow mapping**.
  - `HemisphereLight` : cool sky tone from above, warm sand bounce from below, for a more natural outdoor fill.
  - `PointLight` : a warm key light placed high (with a visible glowing source) that casts its own shadow.
  - `SpotLight` : a triumphant beam that descends on David when Goliath is defeated.
  - A **brightness** slider scales all of these together at runtime.
- **Two camera views:** A fixed third-person camera and a first-person POV from David's eyes, switchable at runtime with **V**; aiming is always computed from the third-person camera, so switching never affects the throw.
- **Cel / toon shading:** via `MeshToonMaterial` driven by a custom **gradient `DataTexture`** (with `NearestFilter` for hard bands), plus **inverted-hull outlines** for the cartoon contour.
- **Procedural textures of different kinds:** The sand ground combines a **color map**, a **normal map** (derived from a layered value-noise height field) and a **roughness map**; David's tunic has an optional **woven-cloth** color map; and his eyes use a generated **iris** texture. All are built in code as `DataTexture`s, so the project carries no external image files.
- **Fully procedural geometry:**  a lathed torso profile, capsules, spheres and cones assembled in code; curly hair generated from a seeded distribution of small spheres. No imported meshes.
- **Procedural skeletal animation:** The sling throw (wind-up and release) is animated with **Tween.js**; the lion has a hand-written run gait with leg phases and an airborne body bounce; the sheep have a gentle idle motion.
- **Physics:** Parabolic projectile motion under gravity, distance-based collision, and a dotted **trajectory preview** that simulates the same parabola while aiming.
- **Procedural audio:** Synthesized sound effects (throw, hit, victory, game over) and an ambient lyre-like loop, generated with the Web Audio API, no audio files shipped. Volume is adjustable and the sound can be muted.
- **Atmosphere:** Linear distance **fog** fades the distant Philistine army into the horizon; a desert environment with ground, pasture patches, rocks and grass tufts.

---

## Possible future work

- Hand-written **GLSL shaders** (`ShaderMaterial`) for advanced effects, e.g. a gradient sky, a glow on Goliath's weak spot, or a dissolve effect when a lion is defeated. (Currently all shading uses Three.js built-in materials.)
- More enemy variety and behaviors.
- Touch controls for mobile.

---

## Credits

- **Authors:** Emie ALLIX (2285862), Nicola TODARO (1737673).
- **Course:** Interactive Graphics — 2025–2026, Prof. Marco Schaerf.
- **Libraries:** [Three.js](https://threejs.org/) (r160), [Tween.js](https://github.com/tweenjs/tween.js) (r23).
- **Scripture:** *1 Samuel 17* (King James Version) — the intro (vv. 34–36), Goliath's challenge (v. 45), and the victory (v. 50).
- **Live demo:** *https://sapienzainteractivegraphicscourse.github.io/final-project-david-s-slinge/*
