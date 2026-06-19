# The David's Sling

A 3D browser game built with **Three.js** for the *Interactive Graphics* course. You play as the young shepherd **David**: defend yourself with your sling against waves of lions across the desert of Judah, then face the giant **Goliath** in a final boss fight. The game is inspired by the biblical account in **1 Samuel 17**.

---

## Overview

David stands in an open desert pasture. Lions appear in the distance and advance toward him; you charge and release the sling to hurl stones along a parabolic arc and bring them down before they reach you. After enough lions are defeated, the Philistine army gathers on the horizon and **Goliath** strides forward for the final duel — you must strike his **forehead** to win, exactly as in the scripture.

Everything is rendered in real time in the browser. All characters and props are **built procedurally in code** (no external 3D model files), with a cartoon / cel-shaded look.

---

## Gameplay

- **Sling mechanic.** Hold to charge the throw (a power meter fills), release to fire. The stone follows a real parabolic trajectory under gravity, and a dotted **aiming preview** shows where it will land while you charge.
- **Lions.** They spawn far away and walk toward David with a procedural run cycle. A hit scores points; if a lion reaches David it deals damage to his health bar.
- **Levels.** Every `LIONS_PER_LEVEL` (5) kills raises the level and the pace.
- **Boss fight.** After `LIONS_BEFORE_BOSS` (10) lions, the shepherd scene gives way to the battlefield: the flock, staff and lyre disappear, the Philistine army appears, and Goliath enters. Goliath takes `GOLIATH_MAX_HEALTH` (3) hits **to the forehead** to be defeated; body hits are blocked. If he reaches David, it is game over.
- **Difficulty.** Easy / Medium / Hard scale the challenge; choose it on the intro screen before starting.

---

## Controls

| Action | Input |
| --- | --- |
| Aim | Move the **mouse** (David turns to face the target; the trajectory preview updates) |
| Charge the sling | **Hold** the left mouse button (power meter fills) |
| Throw the stone | **Release** the left mouse button |
| Reload the sling | **Spacebar** (the sling also auto-reloads shortly after each throw) |
| Switch camera view | **V** (toggles between third-person and David's first-person POV) |
| Start the game | **Begin** button on the intro screen |
| Choose difficulty | **Difficulty** dropdown on the intro screen |

---

## Running the game

The project uses native **ES modules** and an **import map**, so it must be served over HTTP — opening `index.html` directly with `file://` will not work.

**Option A — VS Code Live Server (recommended):**
1. Open the project folder in VS Code.
2. Install the *Live Server* extension.
3. Right-click `index.html` → **Open with Live Server**.

**Option B — any static server, e.g. Python:**
```bash
cd path/to/project
python3 -m http.server 8000
# then open http://localhost:8000 in the browser
```

No build step or `npm install` is required: Three.js and Tween.js are loaded from a CDN through the import map in `index.html`.

> Tip: the console prints a `[VERSION CHECK]` line on load. If a change you expect isn't visible, you are most likely viewing a cached/old copy — do a hard refresh (Ctrl/Cmd+Shift+R) or make sure the server is serving the right folder.

---

## Project structure

| File | Responsibility |
| --- | --- |
| `index.html` | Entry point. Import map, HUD (health, score, level), and the intro / boss / victory / game-over overlays. |
| `main.js` | Scene, camera, lights, the animation loop, input handling, level/boss logic, procedural animations, environment and props. |
| `entities.js` | Procedural 3D models (David, lion, Goliath, sheep, stone) and the toon materials. |
| `physics.js` | Projectile parabola, stone–lion collision, and the sling-string physics. |
| `style.css` | Styling for the HUD and the themed overlays. |
| `README.md` | This file. |

---

## Technical highlights

Built on **Three.js (r160)** with a `WebGLRenderer`. Notable graphics-course-relevant techniques:

- **Lighting (four lights, three types).**
  - `AmbientLight` — uniform base fill.
  - `DirectionalLight` — the sun, with **PCF soft shadow mapping**.
  - `HemisphereLight` — cool sky tone from above, warm sand bounce from below, for a more natural outdoor fill.
  - `PointLight` — a warm key light placed high (with a visible glowing source) that casts its own shadow.
  - `SpotLight` — a triumphant beam that descends on David when Goliath is defeated.
- **Two camera views.** A fixed third-person camera and a first-person POV from David's eyes, switchable at runtime with **V**; aiming is always computed from the third-person camera, so switching never affects the throw.
- **Cel / toon shading** via `MeshToonMaterial` driven by a custom **gradient `DataTexture`** (with `NearestFilter` for hard bands), plus **inverted-hull outlines** for the cartoon contour.
- **Fully procedural geometry** — a lathed torso profile, capsules, spheres and cones assembled in code; curly hair generated from a seeded distribution of small spheres. No imported meshes.
- **Procedural skeletal animation.** The sling throw (wind-up and release) is animated with **Tween.js**; the lion has a hand-written run gait with leg phases and an airborne body bounce; the sheep have a gentle idle motion.
- **Physics.** Parabolic projectile motion under gravity, distance-based collision, and a dotted **trajectory preview** that simulates the same parabola while aiming.
- **Atmosphere.** Linear distance **fog** fades the distant Philistine army into the horizon; a desert environment with ground, pasture patches, rocks and grass tufts.

---

## Possible future work

- Hand-written **GLSL shaders** (`ShaderMaterial`) for advanced effects — e.g. a gradient sky, a glow on Goliath's weak spot, or a dissolve effect when a lion is defeated. (Currently all shading uses Three.js built-in materials.)
- Sound effects and music.
- More enemy variety and behaviours.
- Touch controls for mobile.

---

## Credits

- **Authors:** *[add your names here]*
- **Course:** *Interactive Graphics — [university / academic year]*
- **Libraries:** [Three.js](https://threejs.org/) (r160), [Tween.js](https://github.com/tweenjs/tween.js) (r23).
- **Scripture:** *1 Samuel 17* (King James Version) — the intro (vv. 34–36), Goliath's challenge (v. 45), and the victory (v. 50).
