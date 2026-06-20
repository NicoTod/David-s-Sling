import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { createDavid, createLion, createStone, createGoliath, createSheep } from './entities.js';
import { updatePhysics, slingPhysics } from './physics.js';
import { makeSandTextures, makeClothTexture } from './textures.js';
import { Sound } from './audio.js';
import { createPhilistineArmy, createBattlefieldDetails } from './environment.js';

// Global Variables
let scene, camera, renderer;
let davidGroup;
let projectiles = [];
let enemies = [];
let lastTime = 0;
let spawnTimeoutId = null; // spawning can be stopped on game over

// Centralized game state
const gameState = {
    level: 1,
    lionsKilledTotal: 0,      // total counter, used to compute the level
    lionsKilledThisLevel: 0,  // counter within the current level, UI/debug only
    score: 0,
    davidHealth: 100,
    davidMaxHealth: 100,
    isGameOver: false,
};

// lions constants
const LIONS_PER_LEVEL = 5;       // how many kills per level-up
const LION_DAMAGE_PER_HIT = 15;  // damage to David when a lion reaches him
const LION_REACH_DISTANCE = 1.3; // distance (on Z) below which a lion "reaches" David
const BASE_LION_SPEED = 1.4; // units/second

// Input State for david ans sling
const MAX_CHARGE = 30;
let isThrowing = false;
let isSlingOpen = false;
let isCharging = false;
let chargeForce = 0;

// trajectory parameters
const TRAJ_DOTS = 26;
let trajectoryDots = [];
const _prevPocket = new THREE.Vector3();
const _prevPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _prevTarget = new THREE.Vector3();

// The game starts only after the player presses "Take up the sling" on the intro screen
let gameStarted = false;
// Difficulty multiplier chosen from the dropdown 
let difficultyMultiplier = 1.0; // medium by default

// Final boss : goliath
const GOLIATH_MAX_HEALTH = 3;        // FOREHEAD hits to bring him down
const LIONS_BEFORE_BOSS = 25;        // lions to kill before Goliath appears
const GOLIATH_SPEED = 0.6;           // advances slowly (he's huge)
const GOLIATH_REACH_DISTANCE = 2.5;  // distance (on Z) at which he reaches David
const FOREHEAD_HIT_RADIUS = 0.85;    // radius of the weak spot (the forehead)

let goliath = null;            // boss instance (null until it appears)
let bossActive = false;        // true during the boss fight
let bossDefeated = false;      // true after defeating it (victory)
let goliathHealth = 3;
let bossIntroShowing = false;        // true while the narrative banner is shown
let goliathWalkPhase = 0;            // walk-cycle phase

// scene
let sheepFlock = [];                 // ambient sheep (David's flock)
let victoryLight = null;             // dramatic beam on David, on at victory
let battlefield = null;              // desert-battlefield dressing for the Goliath scene
let viewMode = 'third';              // 'third' (default) or 'first' (David's POV); toggle with V
let brightnessLights = [];           // {light, baseIntensity} for the brightness slider
let fpCamera = null;                 // separate camera for the first-person view
const lastTargetPoint = new THREE.Vector3(0, 0, -10); // last aim point (from the fixed camera)

let staffProp = null;                // shepherd's staff (lion scene only)
let lyreProp = null;                 // ten-string lyre (lion scene only)
let philistineArmy = null;           // distant Philistine line (boss scene only)

// Ray Casting tools
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

init();
requestAnimationFrame(animate);

function degToRad(degrees) {
    return degrees * (Math.PI / 180);
}

function onLionKilled(enemy) {
    gameState.score += 10;
    gameState.lionsKilledTotal += 1;
    gameState.lionsKilledThisLevel += 1;
    Sound.hit();

    document.getElementById('score').innerText = gameState.score;

    // Level up every LIONS_PER_LEVEL total kills
    const newLevel = Math.floor(gameState.lionsKilledTotal / LIONS_PER_LEVEL) + 1;
    if (newLevel > gameState.level) {
        gameState.level = newLevel;
        gameState.lionsKilledThisLevel = 0;
        document.getElementById('level').innerText = gameState.level;
    }

    // After enough lions are killed, the final BOSS enters
    if (!bossActive && !bossDefeated && gameState.lionsKilledTotal >= LIONS_BEFORE_BOSS) {
        startBossPhase();
    }
}

function updateHealthBarUI() {
    const pct = (gameState.davidHealth / gameState.davidMaxHealth) * 100;
    const fill = document.getElementById('health-fill');
    if (fill) {
        fill.style.width = `${pct}%`;
        // Color that changes with remaining health: green -> yellow -> red
        if (pct > 50) {
            fill.style.backgroundColor = '#4caf50';
        } else if (pct > 20) {
            fill.style.backgroundColor = '#ffb300';
        } else {
            fill.style.backgroundColor = '#e53935';
        }
    }
}

function triggerGameOver() {
    gameState.isGameOver = true;
    Sound.gameOver();
    Sound.stopMusic();

    // Stop spawning new lions (otherwise it would keep going forever even after the game is over)
    if (spawnTimeoutId) {
        clearTimeout(spawnTimeoutId);
        spawnTimeoutId = null;
    }

    const overlay = document.getElementById('game-over-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        const finalScoreEl = document.getElementById('final-score');
        if (finalScoreEl) finalScoreEl.innerText = gameState.score;
        const finalLevelEl = document.getElementById('final-level');
        if (finalLevelEl) finalLevelEl.innerText = gameState.level;
    }
}

//Shepherd's staff (crook): a wooden shaft with a curved hook at the top. Returns a Group to be placed in the scene.
function createShepherdStaff() {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a552e, roughness: 1.0 });
    // shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 2.6, 8), woodMat);
    shaft.position.y = 1.3;
    shaft.castShadow = true;
    g.add(shaft);
    // hook at the top
    const hook = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.05, 8, 18, Math.PI * 1.35),
        woodMat
    );
    hook.position.set(-0.2, 2.55, 0);
    hook.rotation.z = -Math.PI / 2; // curves over the shaft like a crook
    hook.castShadow = true;
    g.add(hook);
    return g;
}

//Ten-string lyre: a wooden soundbox, two arms that splay outward to a crossbar, and ten strings. Returns a Group
function createLyre() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 1.0 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x543820, roughness: 1.0 });
    const stringMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.8 });

    // helper: a cylinder spanning two points
    const rod = (p0, p1, r, mat) => {
        const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
        cyl.position.copy(a).addScaledVector(dir, 0.5);
        cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        cyl.castShadow = true;
        return cyl;
    };

    // soundbox + bridge
    const soundbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.14), wood);
    soundbox.position.set(0, 0.30, 0); soundbox.castShadow = true; g.add(soundbox);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.16), woodDark);
    bridge.position.set(0, 0.52, 0); bridge.castShadow = true; g.add(bridge);

    // two arms splaying outward-up + crossbar (yoke)
    g.add(rod([-0.20, 0.52, 0], [-0.44, 1.5, 0], 0.035, wood));
    g.add(rod([0.20, 0.52, 0], [0.44, 1.5, 0], 0.035, wood));
    g.add(rod([-0.46, 1.5, 0], [0.46, 1.5, 0], 0.04, woodDark));

    // 10 strings from the yoke down to the bridge
    for (let i = 0; i < 10; i++) {
        const x = -0.18 + 0.36 * i / 9;
        g.add(rod([x, 1.47, 0.02], [x, 0.55, 0.02], 0.006, stringMat));
    }
    return g;
}

function init() {
    // Scene Setup
    scene = new THREE.Scene();
    // Skybox color
    scene.background = new THREE.Color(0x87ceeb); 
    scene.fog = new THREE.Fog(0x87ceeb, 10, 50);

    // Camera Setup
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(1.5, 3.2, 9); // closer to David (was z=15), a bit to the right
    camera.lookAt(0, 1.3, 0);

    // First-person camera (David's POV); toggled with the V key. The fixed camera above is always used for aiming, so switching views never changes where the stone goes.
    fpCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

    // Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    scene.add(dirLight);

    // Hemisphere light: cool sky tone from above, warm sand bounce from below. A more natural outdoor fill than flat ambient alone, and a different light type from the ambient + directional already in use.
    const hemiLight = new THREE.HemisphereLight(0x9ec9ff, 0xceb98a, 0.45);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // A warm key light placed HIGH and to the side, so the glowing source stays out of the main sightline and doesn't block the view.
    // Intensities are physical in three r160, so being farther away it  needs a higher value.
    const lampOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd27f, fog: false })
    );
    lampOrb.position.set(4, 9, 5);
    scene.add(lampOrb);

    const pointLight = new THREE.PointLight(0xffd27f, 140, 60, 2);
    pointLight.position.copy(lampOrb.position);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(1024, 1024);
    pointLight.shadow.camera.near = 0.5;
    pointLight.shadow.camera.far = 60;
    scene.add(pointLight);

    // Lights driven by the brightness slider (base intensities stored).
    brightnessLights = [
        { l: ambientLight, b: ambientLight.intensity },
        { l: dirLight, b: dirLight.intensity },
        { l: hemiLight, b: hemiLight.intensity },
        { l: pointLight, b: pointLight.intensity },
    ];

    // Victory beam on David: a spotlight from straight above, OFF until
    // he defeats Goliath, then ramped up for a dramatic final triumph.
    victoryLight = new THREE.SpotLight(0xfff2d0, 0, 45, 0.5, 0.5, 1.5);
    victoryLight.position.set(0, 14, 1);
    victoryLight.target.position.set(0, 1, 0);
    victoryLight.castShadow = true;
    victoryLight.shadow.mapSize.set(1024, 1024);
    scene.add(victoryLight);
    scene.add(victoryLight.target);

    // Environment (Ground) Judean desert with pasture patches
    // Sandy base
    const groundGeom = new THREE.PlaneGeometry(120, 120);
    // Procedural sand textures of different kinds (color + normal +
    // roughness), tiled across the ground.
    const sand = makeSandTextures(256);
    [sand.colorMap, sand.normalMap, sand.roughnessMap].forEach(t => t.repeat.set(13, 13));
    const groundMat = new THREE.MeshStandardMaterial({
        map: sand.colorMap,
        normalMap: sand.normalMap,
        roughnessMap: sand.roughnessMap,
        normalScale: new THREE.Vector2(1.3, 1.3),
        roughness: 1.0,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true; // Receive shadows from entities
    scene.add(ground);

    // Green pasture patches (flat discs, just above the sand)
    const pastureMat = new THREE.MeshStandardMaterial({ color: 0x7a9e44, roughness: 1.0 });
    [[-13, -4, 7], [12, -6, 8], [-9, -14, 6], [10, -16, 7],
     [-15, -10, 5], [14, -2, 5], [0, -20, 9], [-4, 4, 5]]
        .forEach(([x, z, r]) => {
            const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 20), pastureMat);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(x, 0.02, z);
            patch.receiveShadow = true;
            scene.add(patch);
        });

    // Desert rocks (low, faceted, rounded)
    const rockMatA = new THREE.MeshStandardMaterial({ color: 0x9b8e76, roughness: 1.0 });
    const rockMatB = new THREE.MeshStandardMaterial({ color: 0x847866, roughness: 1.0 });
    [[-7, -8, 0.7], [8, -11, 0.9], [-12, -18, 1.1], [13, -20, 0.8],
     [5, -5, 0.5], [-16, -6, 0.9], [16, -13, 0.7], [-3, -23, 0.6]]
        .forEach(([x, z, sc], i) => {
            const rockGeom = new THREE.IcosahedronGeometry(sc, 0);
            rockGeom.scale(1.2, 0.7, 1.0);
            const rock = new THREE.Mesh(rockGeom, i % 2 ? rockMatB : rockMatA);
            rock.position.set(x, sc * 0.32, z);
            rock.rotation.y = Math.random() * Math.PI;
            rock.castShadow = true; rock.receiveShadow = true;
            scene.add(rock);
        });

    // Scattered grass tufts (green and dry), sparser in the desert
    const tuftGreen = new THREE.MeshStandardMaterial({ color: 0x6f9a3e, roughness: 1.0 });
    const tuftDry = new THREE.MeshStandardMaterial({ color: 0xa79a5e, roughness: 1.0 });
    for (let i = 0; i < 60; i++) {
        const x = (Math.random() - 0.5) * 90;
        const z = -25 + Math.random() * 33;
        if (Math.abs(x) < 2 && z > -6) continue; // keep David's area clear
        const tuft = new THREE.Group();
        const blades = 3 + Math.floor(Math.random() * 3);
        const dry = Math.random() < 0.45;
        for (let b = 0; b < blades; b++) {
            const blade = new THREE.Mesh(
                new THREE.ConeGeometry(0.04, 0.3 + Math.random() * 0.2, 4),
                dry ? tuftDry : tuftGreen
            );
            blade.position.set((Math.random() - 0.5) * 0.18, 0.18, (Math.random() - 0.5) * 0.18);
            blade.rotation.z = (Math.random() - 0.5) * 0.5;
            tuft.add(blade);
        }
        tuft.position.set(x, 0, z);
        scene.add(tuft);
    }

    // Flock of sheep (to the side, out of the lions' lane)
    [[-13, -4], [12, -7], [-15, -11], [11, -15], [-5, 5]]
        .forEach(([x, z]) => {
            const sh = createSheep();
            sh.model.position.set(x, 0, z);
            sh.model.rotation.y = Math.random() * Math.PI * 2;
            scene.add(sh.model);
            sheepFlock.push({ obj: sh, phase: Math.random() * Math.PI * 2 });
        });

    // Shepherd's staff leaning to one side, near David (lion scene)
    staffProp = createShepherdStaff();
    staffProp.position.set(-2.6, 0, 2.2);
    staffProp.rotation.z = 0.16;   // slightly tilted
    staffProp.rotation.y = 0.3;
    scene.add(staffProp);

    // Ten-string lyre (David's kinnor) on the other side (lion scene)
    lyreProp = createLyre();
    lyreProp.position.set(3.3, 0, 1.7);
    lyreProp.rotation.y = -0.28;
    scene.add(lyreProp);

    // Distant Philistine army for the Goliath scene (hidden for now)
    philistineArmy = createPhilistineArmy();
    scene.add(philistineArmy);

    battlefield = createBattlefieldDetails();
    scene.add(battlefield);

    // Instantiate Entities
    davidGroup = createDavid();
    scene.add(davidGroup.model);
    davidGroup.model.rotation.y = Math.PI; // face the lions
    // add the stone for the first throw
    davidGroup.currentStone = createStone();
    if (davidGroup.pocket) {
        davidGroup.pocket.add(davidGroup.currentStone);
        davidGroup.currentStone.position.set(0, 0, 0);
        davidGroup.currentStone.rotation.set(0, 0, 0);
    }

    // Event Listeners (User Interaction)
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', spaceBarPressed);
    window.addEventListener('keydown', toggleViewKey);

    // Touch support (mobile): auto-detected. Touches on the game canvas
    // reuse the mouse aim/charge/throw logic (drag to aim, hold to
    // charge, release to throw); UI overlays handle their own touches.
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
        document.body.classList.add('touch-mode');
    }
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove',  onTouchMove,  { passive: false });
    renderer.domElement.addEventListener('touchend',   onTouchEnd,   { passive: false });
    renderer.domElement.addEventListener('touchcancel', onTouchEnd,  { passive: false });
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', toggleMuteUI);

    // Settings panel: open/close (in-game gear button).
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsToggle && settingsPanel) {
        settingsToggle.addEventListener('click', () => settingsPanel.classList.toggle('open'));
    }

    // Settings live controls
    const setDifficulty = (v) => {
        const difficultyMap = { easy: 0.7, medium: 1.0, hard: 1.5 };
        difficultyMultiplier = difficultyMap[v] ?? 1.0;
    };
    function wirePair(idGame, idIntro, evt, apply) {
        const a = document.getElementById(idGame);
        const b = document.getElementById(idIntro);
        const handler = (e) => {
            const val = e.target.value;
            apply(val);
            if (a && a !== e.target) a.value = val;
            if (b && b !== e.target) b.value = val;
        };
        if (a) a.addEventListener(evt, handler);
        if (b) b.addEventListener(evt, handler);
    }
    wirePair('set-music',  'set-music-intro',  'input',  (v) => Sound.setMusicVolume(v / 100));
    wirePair('set-sfx',    'set-sfx-intro',    'input',  (v) => Sound.setSfxVolume(v / 100));
    wirePair('set-bright', 'set-bright-intro', 'input',  (v) => setBrightness(v / 100));
    wirePair('set-tunic',  'set-tunic-intro',  'change', (v) => applyTunic(v));
    wirePair('difficulty', 'difficulty-intro', 'change', setDifficulty);

    // Intro screen button: starts the game
    const beginButton = document.getElementById('begin-button');
    if (beginButton) {
        beginButton.addEventListener('click', startGame);
    }

    // Goliath narrative banner button: starts the boss fight
    const goliathBeginBtn = document.getElementById('goliath-begin-btn');
    if (goliathBeginBtn) {
        goliathBeginBtn.addEventListener('click', beginGoliathFight);
    }

    // Touch buttons (mobile): reload the sling and toggle the camera view.
    const touchReload = document.getElementById('touch-reload');
    if (touchReload) touchReload.addEventListener('click', () => {
        if (isSlingOpen && !isThrowing) reloadSling();
    });
    const touchView = document.getElementById('touch-view');
    if (touchView) touchView.addEventListener('click', () => {
        viewMode = (viewMode === 'first') ? 'third' : 'first';
        setViewName();
    });
}

// Start the game: hides the intro screen, unlocks the controls and spawns the first lion (which in turn schedules the next spawns).
function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    const intro = document.getElementById('intro-overlay');
    if (intro) intro.style.display = 'none';
    Sound.resume();
    Sound.startMusic();
    spawnEnemy();
}

function spawnEnemy() {
    if (gameState.isGameOver) return; // stop spawning enemies on game over
    if (bossActive || bossDefeated) return; // no lions during/after the boss

    const enemyData = createLion();
    const spawnX = (Math.random() - 0.5) * 20;
    enemyData.model.position.set(spawnX, 0, -30);

    // Pick a target: about half the lions stalk a (still visible) sheep, the rest go for David. David-hunters aim BESIDE him (never straight down his center line), so they never hide behind him: either way a lion ends up off to one side and stays visible.
    const visibleSheep = sheepFlock.filter(s => s.obj.model.visible);
    if (visibleSheep.length && Math.random() < 0.5) {
        const s = visibleSheep[Math.floor(Math.random() * visibleSheep.length)];
        enemyData.targetSheep = s;
        enemyData.targetPos = s.obj.model.position.clone();
    } else {
        enemyData.targetSheep = null;
        const side = Math.random() < 0.5 ? -1 : 1;
        enemyData.targetPos = new THREE.Vector3(side * (0.9 + Math.random() * 0.6), 0, 0);
    }
    scene.add(enemyData.model);
    enemies.push(enemyData);

    // Spawn rate: more lions, faster, at higher levels and higher difficulty
    const baseDelay = Math.random() * 3000 + 1000;
    const levelFactor = Math.max(0.4, 1 - (gameState.level - 1) * 0.12);
    const delay = Math.max(400, baseDelay * levelFactor / difficultyMultiplier);

    spawnTimeoutId = setTimeout(spawnEnemy, delay);
}

function onMouseDown(e) {
    if (e.target && e.target.closest && e.target.closest('#hint-bar, #controls, #settings-panel')) return; // UI clicks, not aiming
    if (!gameStarted) return; // the game hasn't started yet
    if (bossIntroShowing) return; // narrative banner open: no throws
    if (gameState.isGameOver) return;
    if(e.button !== 0) return; // Only left click
    if(isSlingOpen) return; // Can't charge if sling is open
    if(isThrowing) return;
    isCharging = true;
    chargeForce = 0;

    if (davidGroup.pocketVelocity) {
        davidGroup.pocketVelocity.set(0, 0, 0);
    }
    if (davidGroup.freeStringVelocity) {
        davidGroup.freeStringVelocity.set(0, 0, 0);
    }
    // If there's no stone in the sling
    if (!davidGroup.currentStone) {
        davidGroup.currentStone = createStone();
        if (davidGroup.pocket) {
            davidGroup.pocket.add(davidGroup.currentStone);
            davidGroup.currentStone.position.set(0, 0, 0);
            davidGroup.currentStone.rotation.set(0, 0, 0);
        }
    }
    davidGroup.currentStone.visible = true;
}

function onMouseUp(e) {
    if (e.target && e.target.closest && e.target.closest('#hint-bar, #controls, #settings-panel')) return; // UI clicks, not aiming
    if (!gameStarted) return;
    if (gameState.isGameOver) return;
    if (bossIntroShowing) return; // narrative banner open: no throws
    if(e.button !== 0) return;
    if (isSlingOpen) return;
    if(isThrowing) return;
    if (!isCharging) return;
    isCharging = false;
    isThrowing = true;
    Sound.throwWhoosh();
    document.getElementById('power-fill').style.width = '0%';

    const throwDuration = 170;
    const savedForce = chargeForce;
    chargeForce = 0;

    // Throw animation
    // rotate torso forward
    new TWEEN.Tween(davidGroup.torso.rotation)
        .to({ y: degToRad(22) }, throwDuration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            new TWEEN.Tween(davidGroup.torso.rotation).to({ y: 0 }, 350)
                .easing(TWEEN.Easing.Back.Out).start(); // follow-through settle
        })
        .start();
    // Rotate upper arm forward and straighten it
    new TWEEN.Tween(davidGroup.rightUpperArm.rotation)
        .to({ x: degToRad(-45), z: 0 }, throwDuration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            new TWEEN.Tween(davidGroup.rightUpperArm.rotation).to({ x: 0 }, 350)
                .easing(TWEEN.Easing.Back.Out).start();
        })
        .start();
    // Straighten forearm
    new TWEEN.Tween(davidGroup.rightForearm.rotation)
        .to({ x: 0 }, throwDuration)
        .easing(TWEEN.Easing.Cubic.Out).onComplete(() => {
            new TWEEN.Tween(davidGroup.rightForearm.rotation).to({ x: 0, z: 0 }, 300).start();
        })
        .start();
    // Sling rotation
    new TWEEN.Tween(davidGroup.sling.rotation)
        .to({ x: degToRad(270)}, throwDuration)
        .easing(TWEEN.Easing.Cubic.In)
        .onComplete(() => {
            davidGroup.sling.rotation.x = 0; // Re-initialize the sling
            isThrowing = false;
        })
        .start();
    
    //left arm
    new TWEEN.Tween(davidGroup.leftUpperArm.rotation).to({ x: 0, z: 0 }, throwDuration).start();
    new TWEEN.Tween(davidGroup.leftForearm.rotation).to({ x: 0 }, throwDuration).start();

    new TWEEN.Tween(davidGroup.torso.position)
        .to({ y: 2.5 }, throwDuration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(davidGroup.rightThigh.rotation).to({ x: 0 }, throwDuration).start();
    new TWEEN.Tween(davidGroup.leftThigh.rotation).to({ x: 0 }, throwDuration).start();
    new TWEEN.Tween(davidGroup.rightShin.rotation).to({ x: 0 }, throwDuration).start();
    new TWEEN.Tween(davidGroup.leftShin.rotation).to({ x: 0 }, throwDuration).start();
    new TWEEN.Tween(davidGroup.rightFoot.rotation).to({ x: 0 }, throwDuration).start();
    new TWEEN.Tween(davidGroup.leftFoot.rotation).to({ x: 0 }, throwDuration).start();
    
    // wait for the throw animation to launch the stone
    setTimeout(() => {
        if (!davidGroup.currentStone) return;

        // Create and launch projectile
        const stone = davidGroup.currentStone;
        
        // Start stone at David's hand position (approximate based on arm rotation)
        const pocketWorldPos = new THREE.Vector3();
        davidGroup.pocket.getWorldPosition(pocketWorldPos);
        scene.attach(stone);

        //Raycasting 
        // Convert mouse position into normalized coordinates (-1 to +1)
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        // Launch the ray from the camera
        raycaster.setFromCamera(mouse, camera);
        // create a ground plane
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const targetPoint = new THREE.Vector3();
        // find where the laser crosses the ground plane
        raycaster.ray.intersectPlane(groundPlane, targetPoint);
        // Avoid the shoot to go backwards
        if (targetPoint.z > -1) {
            targetPoint.z = -1;
        }
        // Calculate direction vector between hand and target point
        const direction = new THREE.Vector3().subVectors(targetPoint, pocketWorldPos);
        // Add y component to have a parabolic trajectory
        direction.y = 0;
        direction.normalize(); 
        direction.y = 0.5; 
        direction.normalize(); 
        // Apply force
        const velocity = direction.multiplyScalar(savedForce + 10);

        projectiles.push({ mesh: stone, velocity: velocity });
        davidGroup.currentStone = null;
        isSlingOpen = true;
        if (davidGroup.freeStringVelocity) {
            davidGroup.freeStringVelocity.copy(velocity).multiplyScalar(0.5); 
        }
    }, throwDuration*0.7);
}

function onMouseMove(e) {
    if (e.target && e.target.closest && e.target.closest('#settings-panel')) return; // dragging a slider shouldn't re-aim
    // Update mouse coordinates for raycasting
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();

    // Orient david to look at the point where the mouse ray intersects the ground plane
    if (raycaster.ray.intersectPlane(groundPlane, targetPoint)) {
        // Make david look straigght if the mouse is above him
        if (targetPoint.z > -1) {
            targetPoint.z = -1;
        }
        // David faces the target
        davidGroup.model.lookAt(targetPoint.x, davidGroup.model.position.y, targetPoint.z);
        lastTargetPoint.copy(targetPoint); // for the first-person camera aim
    }
}

// Touch handlers: thin adapters that translate a touch into the same
// shape the mouse handlers expect, so the aim/charge/throw logic is
// shared. Drag to aim, hold to charge, release to throw.
function touchToEvent(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return null;
    return { clientX: t.clientX, clientY: t.clientY, target: t.target || e.target, button: 0 };
}
function onTouchStart(e) {
    const p = touchToEvent(e);
    if (!p) return;
    if (p.target && p.target.closest &&
        p.target.closest('#hint-bar, #controls, #settings-panel, #touch-controls, button, input, select')) return;
    e.preventDefault();
    onMouseMove(p); // aim at the touch point first
    onMouseDown(p); // then start charging
}
function onTouchMove(e) {
    const p = touchToEvent(e);
    if (!p) return;
    if (p.target && p.target.closest && p.target.closest('#settings-panel')) return;
    e.preventDefault();
    onMouseMove(p); // keep aiming while dragging
}
function onTouchEnd(e) {
    const p = touchToEvent(e);
    if (!p) return;
    e.preventDefault();
    onMouseUp(p); // release -> throw
}

// Reload the sling: closes the sling and creates a new stone in the pocket
function reloadSling() {
    if (gameState.isGameOver) return;
    if (isThrowing) return; // don't reload while a throw is in progress
    if (davidGroup.currentStone) return; // already loaded

    isSlingOpen = false;
    davidGroup.currentStone = createStone();
    if (davidGroup.pocket) {
        davidGroup.pocket.add(davidGroup.currentStone);
        davidGroup.currentStone.position.set(0, 0, 0);
        davidGroup.currentStone.rotation.set(0, 0, 0);
    }
}

// Scale the main lights by a factor (the brightness slider).
function setBrightness(factor) {
    brightnessLights.forEach(({ l, b }) => { l.intensity = b * factor; });
}

// David's outfit presets: solid colors plus a switchable cloth texture.
const tunicPresets = {
    blue:    { color: 0x2f5fb0, fold: 0x244a8f },
    crimson: { color: 0x9e2b25, fold: 0x6f1c18 },
    olive:   { color: 0x5b6b35, fold: 0x3f4a24 },
    sand:    { color: 0xc9b07a, fold: 0x927c4f },
    striped: { texture: 0xcdbb8a, fold: 0x8a7a52 },
};
let clothTexture = null;
function applyTunic(key) {
    if (!davidGroup || !davidGroup.tunicMat) return;
    const p = tunicPresets[key];
    if (!p) return;
    const m = davidGroup.tunicMat;
    if (p.texture) {
        if (!clothTexture) { clothTexture = makeClothTexture(p.texture, 128); clothTexture.repeat.set(2, 2); }
        m.map = clothTexture;
        m.color.set(0xffffff); // let the texture show its own colors
    } else {
        m.map = null;
        m.color.set(p.color);
    }
    m.needsUpdate = true; // toggling .map needs a material refresh
    if (davidGroup.foldMat) davidGroup.foldMat.color.set(p.fold);
}

function spaceBarPressed(e) {
    if (gameState.isGameOver) return;
    if (e.code === 'Space' && isSlingOpen && !isThrowing) {
        reloadSling();
    }
}

// Toggle between the third-person and first-person (David's POV) views, and toggle audio with M. Both update the on-screen hint bar.
function setViewName() {
    const el = document.getElementById('view-name');
    if (el) el.textContent = (viewMode === 'first') ? 'First person' : 'Third person';
}
function toggleMuteUI() {
    const muted = Sound.toggleMute();
    const btn = document.getElementById('mute-btn');
    if (btn) {
        btn.classList.toggle('muted', muted);
        btn.innerHTML = muted ? '\uD83D\uDD07&nbsp; Sound off' : '\uD83D\uDD0A&nbsp; Sound on';
    }
}
function toggleViewKey(e) {
    if (e.code === 'KeyV') {
        viewMode = (viewMode === 'first') ? 'third' : 'first';
        setViewName();
    } else if (e.code === 'KeyM') {
        toggleMuteUI();
    }
}

// Place the first-person camera at David's head, looking toward the aim point
function updateFPCamera() {
    const head = new THREE.Vector3();
    davidGroup.head.getWorldPosition(head);
    const dir = new THREE.Vector3(
        lastTargetPoint.x - davidGroup.model.position.x, 0,
        lastTargetPoint.z - davidGroup.model.position.z
    );
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    fpCamera.position.copy(head).addScaledVector(dir, 0.45);
    fpCamera.position.y = head.y + 0.05;
    fpCamera.lookAt(lastTargetPoint.x, 0.6, lastTargetPoint.z);
}


function updateProceduralAnimations(time, dt) {
    if (gameState.isGameOver) return;

    // Animate enemies walking
    enemies.forEach(enemy => {
        if (enemy.isDead) return;

        const levelSpeedFactor = 1 + (gameState.level - 1) * 0.15;
        const speed = BASE_LION_SPEED * levelSpeedFactor * difficultyMultiplier;

        // If the stalked sheep is gone (fled/eaten), switch to David.
        if (enemy.targetSheep && !enemy.targetSheep.obj.model.visible) {
            enemy.targetSheep = null;
            const side = enemy.model.position.x >= 0 ? 1 : -1;
            enemy.targetPos = new THREE.Vector3(side * (0.9 + Math.random() * 0.6), 0, 0);
        }

        // Walk toward the target in the XZ plane 
        const pos = enemy.model.position;
        const tp = enemy.targetPos;
        const dx = tp.x - pos.x, dz = tp.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-4) {
            const step = Math.min(speed * dt, dist);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            enemy.model.rotation.y = Math.atan2(dx, dz);
        }

        // Articulated gait
        animateLionRun(enemy, time * levelSpeedFactor * difficultyMultiplier);

        // Caught up to the stalked sheep: it flees (hides) and the lion immediately re-targets David (beside him), so it never gets stranded jittering on the empty spot where the sheep was.
        if (enemy.targetSheep) {
            const sp = enemy.targetSheep.obj.model.position;
            if (Math.hypot(sp.x - pos.x, sp.z - pos.z) < 1.6) {
                enemy.targetSheep.obj.model.visible = false;
                enemy.targetSheep = null;
                const side = pos.x >= 0 ? 1 : -1;
                enemy.targetPos = new THREE.Vector3(side * (0.9 + Math.random() * 0.6), 0, 0);
            }
        }

        // Reached David (close to the origin in the XZ plane): it deals damage and "retreats" (removed like killed lions, to avoid it dealing damage every frame)
        if (Math.hypot(pos.x, pos.z) <= LION_REACH_DISTANCE + 0.3) {
            enemy.isDead = true;
            enemy.reachedDavid = true; // immediate removal (see cleanup below)
            scene.remove(enemy.model);
            damageDavid(LION_DAMAGE_PER_HIT);
        }
    });

    // Cleanup: remove the lions that reached David
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].reachedDavid) {
            enemies.splice(i, 1);
        }
    }
}

function damageDavid(amount) {
    gameState.davidHealth = Math.max(0, gameState.davidHealth - amount);
    updateHealthBarUI();
    if (gameState.davidHealth <= 0 && !gameState.isGameOver) {
        triggerGameOver();
    }
}

// Lion run animation
function animateLionRun(lion, time) {
    if (lion.isDead) return; // don't fight the death animation
    const speed = 0.5;
    const progress = (time * speed) % 1.0;

    const legPhase = progress * Math.PI * 2;

    // leg order during the run
    const offsets = [0.25, 0, 0.5, 0.75];

    lion.legs.forEach((leg, index) => {
        const phaseRad = (legPhase + offsets[index] * Math.PI * 2) % (Math.PI * 2);
        const progress = phaseRad / (Math.PI * 2);

        let thighRotation = 0;
        let shinRotation = 0;
        let pawRotation = 0;

        // angle and amplitude parameters
        const thighAmplitudeMax = -0.9;
        const kneeBendingMax = degToRad(80);
        const kneeBendingMin = degToRad(0);
        const extraKneeFlexionInAir = degToRad(50);
        const pawAtRest = degToRad(0);
        const pawFlexionInAir = degToRad(30);
        const pawExtensionOnGround = -degToRad(20);

        // push phase
        if (progress < 0.5) {
            const t = progress / 0.5;

            thighRotation = THREE.MathUtils.lerp(thighAmplitudeMax, -thighAmplitudeMax, t);
            shinRotation = t * kneeBendingMax; // slight knee bend
            pawRotation = THREE.MathUtils.lerp(pawAtRest, pawExtensionOnGround, t);
        }
        // the paw moves forward
        else {
            const t = (progress - 0.5) / 0.5;

            thighRotation = THREE.MathUtils.lerp(-thighAmplitudeMax, thighAmplitudeMax, t);

            shinRotation = THREE.MathUtils.lerp(kneeBendingMax, kneeBendingMin, t) + (Math.sin(t * Math.PI) * extraKneeFlexionInAir);
            pawRotation = THREE.MathUtils.lerp(pawExtensionOnGround, pawAtRest, t) + (Math.sin(t * Math.PI) * (pawFlexionInAir - pawExtensionOnGround));
        }
        // apply the rotations
        leg.thigh.rotation.x = THREE.MathUtils.lerp(leg.thigh.rotation.x, thighRotation, 0.3);
        leg.shin.rotation.x  = THREE.MathUtils.lerp(leg.shin.rotation.x, shinRotation, 0.3);
        leg.paw.rotation.x   = THREE.MathUtils.lerp(leg.paw.rotation.x || 0, pawRotation, 0.3);
    });

    // body bounce (propulsion)
    let bounce = 0;
    let isInAir = false;
    let t = 0;

    const backRightTouchGround  = (offsets[2]) % 1; //0.5
    const frontRightTouchGround = offsets[1] % 1;   //0
    const groundTime = 0.2;
    const backRightTakeoff = (backRightTouchGround + groundTime) % 1; //0.7

    if (backRightTakeoff < frontRightTouchGround) {
        if (progress >= backRightTakeoff && progress < frontRightTouchGround) {
            isInAir = true;
            t = (progress - backRightTakeoff) / (frontRightTouchGround - backRightTakeoff);
        }
    } else {
        if (progress >= backRightTakeoff || progress < frontRightTouchGround) {
            isInAir = true;
            const flightDuration = (1.0 - backRightTakeoff) + frontRightTouchGround;
            const timePassed = (progress >= backRightTakeoff)
                ? (progress - backRightTakeoff)
                : (1.0 - backRightTakeoff) + progress;
            t = timePassed / flightDuration;
        }
    }
    if (isInAir) {
        bounce = Math.sin(t * Math.PI) * 0.1;
    }
    lion.model.position.y = bounce;

    // forward/back tilt
    const inclinationAmplitude = 0.1;
    const bodyPitch = Math.sin(legPhase) * inclinationAmplitude;
    lion.model.rotation.x = bodyPitch;

    // left/right tilt
    const rollAmplitude = 0.05;
    const bodyRoll = Math.cos(legPhase) * rollAmplitude;
    lion.model.rotation.z = bodyRoll;

    // tail
    if (lion.tailSegments) {
        lion.tailSegments.forEach((segment, index) => {
            const wavePhase = legPhase - (index * 0.5);
            segment.rotation.z = Math.sin(wavePhase) * 0.2;
            segment.rotation.x = 0.2 + Math.cos(wavePhase) * 0.1;
        });
    }
}

//lion death animation: The lion falls to the side per the stone's impact direction, after ~6s it sinks and is removed from the scene
function animateLionDeath(lion, impactDirection) {
    if (lion.isDead) return;
    lion.isDead = true;

    let rotationX = 0;
    let rotationZ = 0;
    const fallAngle = Math.PI / 2;

    if (impactDirection.x > 0) {
        rotationZ = -fallAngle; // falls to the right side
    } else {
        rotationZ = fallAngle;  // falls to the left side
    }

    const targetY = 0.5;
    const duration = 800;

    const currentState = {
        rotX: lion.model.rotation.x,
        rotZ: lion.model.rotation.z,
        posY: lion.model.position.y
    };
    new TWEEN.Tween(currentState)
        .to({ rotX: rotationX, rotZ: rotationZ, posY: targetY }, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
            lion.model.rotation.x = currentState.rotX;
            lion.model.rotation.z = currentState.rotZ;
            lion.model.position.y = currentState.posY;
        })
        .start();

    lion.legs.forEach((leg, index) => {
        let targetLegZ = 0;
        if (rotationZ === -fallAngle) {
            if (index === 0 || index === 2) targetLegZ = fallAngle * 0.7;
        } else if (rotationZ === fallAngle) {
            if (index === 1 || index === 3) targetLegZ = -fallAngle * 0.7;
        }
        if (targetLegZ !== 0) {
            new TWEEN.Tween(leg.thigh.rotation)
                .to({ z: targetLegZ }, duration * 0.8)
                .easing(TWEEN.Easing.Cubic.Out).start();
            new TWEEN.Tween(leg.shin.rotation)
                .to({ x: degToRad(20) }, duration * 0.8)
                .easing(TWEEN.Easing.Cubic.Out).start();
        }
    });

    if (lion.tailSegments) {
        lion.tailSegments.forEach((segment, index) => {
            let targetTailZ = 0;
            let weightFactor = 0.4;
            if (index === 1) weightFactor = -0.1;
            else if (index === 2) weightFactor = -0.15;
            else if (index === 3) weightFactor = -0.08;
            if (rotationZ === -fallAngle) targetTailZ = fallAngle * weightFactor;
            else targetTailZ = -fallAngle * weightFactor;
            new TWEEN.Tween(segment.rotation)
                .to({ x: 0, z: targetTailZ }, duration * (0.6 + index * 0.1))
                .easing(TWEEN.Easing.Cubic.Out).start();
        });
    }

    setTimeout(() => {
        new TWEEN.Tween(lion.model.position)
            .to({ y: -2 }, 1000)
            .onComplete(() => {
                scene.remove(lion.model);
                const idx = enemies.indexOf(lion);
                if (idx > -1) enemies.splice(idx, 1);
            })
            .start();
    }, 5000);
}
window.animateLionDeathGlobal = animateLionDeath;


// FINAL BOSS: GOLIATH

// Show/hide the lion-scene shepherd decor (flock, staff, lyre).
function setShepherdSceneVisible(visible) {
    for (const s of sheepFlock) s.obj.model.visible = visible;
    if (staffProp) staffProp.visible = visible;
    if (lyreProp) lyreProp.visible = visible;
}

function startBossPhase() {
    bossActive = true;
    // Stop spawning lions immediately.
    if (spawnTimeoutId) { clearTimeout(spawnTimeoutId); spawnTimeoutId = null; }

    // War-horn challenge call
    Sound.challenge();

    const haze = new THREE.Color(0xd2bb95);
    const swapToArena = () => {
        // Remove any remaining lions
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].model) scene.remove(enemies[i].model);
            enemies.splice(i, 1);
        }
        setShepherdSceneVisible(false);
        if (philistineArmy) philistineArmy.visible = true;
        if (battlefield) battlefield.visible = true;
        if (scene.background && scene.background.copy) scene.background.copy(haze);
        if (scene.fog) scene.fog.color.copy(haze);
    };
    const showBanner = () => {
        bossIntroShowing = true;
        const intro = document.getElementById('boss-intro-overlay');
        if (intro) intro.style.display = 'flex';
    };

    const flash = document.getElementById('scene-flash');
    if (flash) {
        requestAnimationFrame(() => { flash.style.opacity = '1'; }); // bloom in (~0.36s)
        setTimeout(swapToArena, 380);                                // swap behind the flash
        setTimeout(() => { flash.style.opacity = '0'; }, 540);       // fade the flash out
        setTimeout(showBanner, 1080);                                // banner after the flash is gone
    } else {
        swapToArena();
        showBanner();
    }
}

// Actually begin the boss fight (from the banner button)
function beginGoliathFight() {
    bossIntroShowing = false;
    const intro = document.getElementById('boss-intro-overlay');
    if (intro) intro.style.display = 'none';

    // Spawn Goliath far away, already facing David.
    goliath = createGoliath();
    goliath.model.position.set(0, 0, -25);
    scene.add(goliath.model);
    goliathHealth = GOLIATH_MAX_HEALTH;
    goliathWalkPhase = 0;

    const bossUI = document.getElementById('boss-ui');
    if (bossUI) bossUI.style.display = 'block';
    updateBossBarUI();
    showBossMessage('Goliath the Philistine strides forth — strike the forehead!');
}

// Goliath's reaction when he takes a hit to the forehead: he jerks backward and his head snaps back.
function staggerGoliath() {
    if (!goliath || goliath.isDead) return;
    goliath.model.position.z -= 0.6; // knockback
    const h = goliath.head;
    new TWEEN.Tween(h.rotation).to({ x: -0.5 }, 120).easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            new TWEEN.Tween(h.rotation).to({ x: 0 }, 260).easing(TWEEN.Easing.Quadratic.In).start();
        }).start();
}

function updateBossBarUI() {
    const fill = document.getElementById('boss-fill');
    if (fill) fill.style.width = `${Math.max(0, (goliathHealth / GOLIATH_MAX_HEALTH) * 100)}%`;
}

let bossMsgTimeoutId = null;
function showBossMessage(text) {
    const el = document.getElementById('boss-msg');
    if (!el) return;
    el.innerText = text;
    el.style.opacity = '1';
    if (bossMsgTimeoutId) clearTimeout(bossMsgTimeoutId);
    bossMsgTimeoutId = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

const _foreheadWorld = new THREE.Vector3();

//Light flock animation: a gentle up/down "breathing" and a slow head dip to graze the grass (out of phase per sheep, so they don't move in unison)
 
function animateSheep(t) {
    for (const s of sheepFlock) {
        s.obj.model.position.y = Math.sin(t * 1.4 + s.phase) * 0.04;
        if (s.obj.head) {
            s.obj.head.rotation.x = Math.max(0, Math.sin(t * 0.4 + s.phase)) * 0.7;
        }
    }
}

function updateBoss(dt) {
    if (gameState.isGameOver) return;
    if (!bossActive || !goliath || goliath.isDead) return;

    // Goliath advances slowly toward David, with a heavy walk.
    goliath.model.position.z += GOLIATH_SPEED * dt;
    goliathWalkPhase += dt * 2.4; // step rhythm
    const stride = 0.30;
    if (goliath.legs && goliath.legs.length === 2) {
        goliath.legs[0].rotation.x = Math.sin(goliathWalkPhase) * stride;
        goliath.legs[1].rotation.x = Math.sin(goliathWalkPhase + Math.PI) * stride;
    }
    // body sway: a slight up/down each step + lateral oscillation
    goliath.model.position.y = Math.abs(Math.sin(goliathWalkPhase)) * 0.13;
    goliath.model.rotation.z = Math.sin(goliathWalkPhase) * 0.05;

    // World position of the forehead
    goliath.forehead.getWorldPosition(_foreheadWorld);
    const gx = goliath.model.position.x;
    const gz = goliath.model.position.z;

    // Stone-vs-Goliath collisions.
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pos = projectiles[i].mesh.position;
        // Hit on the FOREHEAD -> damage to the boss.
        if (pos.distanceTo(_foreheadWorld) < FOREHEAD_HIT_RADIUS) {
            scene.remove(projectiles[i].mesh);
            projectiles.splice(i, 1);
            goliathHealth -= 1;
            updateBossBarUI();
            if (goliathHealth <= 0) {
                defeatGoliath();
            } else {
                showBossMessage('A stone finds his brow! The giant reels.');
                // Reaction: the head snaps back and then returns.
                if (goliath.head) {
                    new TWEEN.Tween(goliath.head.rotation)
                        .to({ x: -0.45 }, 110).easing(TWEEN.Easing.Quadratic.Out)
                        .onComplete(() => {
                            new TWEEN.Tween(goliath.head.rotation)
                                .to({ x: 0 }, 280).easing(TWEEN.Easing.Quadratic.In).start();
                        }).start();
                }
            }
            continue;
        }
        // Hit on the BODY (armor): close to Goliath's axis and within the body's height range -> deflected, no damage.
        const horiz = Math.hypot(pos.x - gx, pos.z - gz);
        if (horiz < 1.3 && pos.y > 0.4 && pos.y < 3.9) {
            scene.remove(projectiles[i].mesh);
            projectiles.splice(i, 1);
            showBossMessage('Turned aside by his armor — strike the forehead!');
            continue;
        }
    }

    // Goliath reaches David: the giant overwhelms him -> defeat.
    if (gz >= -GOLIATH_REACH_DISTANCE) {
        showBossMessage('The giant is upon you...');
        triggerGameOver();
    }
}

function defeatGoliath() {
    if (!goliath || goliath.isDead) return;
    goliath.isDead = true;
    bossActive = false;
    bossDefeated = true;
    Sound.victory();

    const bossUI = document.getElementById('boss-ui');
    if (bossUI) bossUI.style.display = 'none';

    // The giant's fall: the legs buckle, the head reclines, it stops swaying, then topples backward and sinks into the ground.
    const m = goliath.model;
    m.rotation.z = 0; // stop the lateral sway
    if (goliath.legs) {
        goliath.legs.forEach((leg) => {
            new TWEEN.Tween(leg.rotation).to({ x: 0.25 }, 500).easing(TWEEN.Easing.Quadratic.Out).start();
        });
    }
    if (goliath.head) {
        new TWEEN.Tween(goliath.head.rotation).to({ x: -0.5 }, 700).easing(TWEEN.Easing.Quadratic.Out).start();
    }
    new TWEEN.Tween(m.rotation).to({ x: -Math.PI / 2 }, 1300).easing(TWEEN.Easing.Cubic.In).start();
    new TWEEN.Tween(m.position).to({ y: -1.2 }, 1700).delay(500).easing(TWEEN.Easing.Quadratic.In)
        .onComplete(() => { scene.remove(m); })
        .start();

    // The triumphant beam of light descends on David.
    if (victoryLight) {
        victoryLight.intensity = 0;
        new TWEEN.Tween(victoryLight).to({ intensity: 550 }, 1400).delay(700)
            .easing(TWEEN.Easing.Quadratic.Out).start();
    }

    // Victory screen with the closing verse
    setTimeout(() => {
        const ov = document.getElementById('victory-overlay');
        if (ov) ov.style.display = 'flex';
    }, 1800);
}


// TRAJECTORY PREVIEW 
function ensureTrajectoryDots() {
    if (trajectoryDots.length) return;
    const geo = new THREE.SphereGeometry(0.07, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, fog: false });
    for (let i = 0; i < TRAJ_DOTS; i++) {
        const dot = new THREE.Mesh(geo, mat);
        dot.visible = false;
        scene.add(dot);
        trajectoryDots.push(dot);
    }
}

function hideTrajectory() {
    for (const d of trajectoryDots) d.visible = false;
}

function updateTrajectoryPreview() {
    if (!isCharging || !davidGroup || !davidGroup.pocket) { hideTrajectory(); return; }
    ensureTrajectoryDots();

    davidGroup.pocket.getWorldPosition(_prevPocket);
    raycaster.setFromCamera(mouse, camera);
    if (!raycaster.ray.intersectPlane(_prevPlane, _prevTarget)) { hideTrajectory(); return; }
    if (_prevTarget.z > -1) _prevTarget.z = -1;

    // Same formula as onMouseUp for the velocity.
    const dir = _prevTarget.clone().sub(_prevPocket);
    dir.y = 0; dir.normalize(); dir.y = 0.5; dir.normalize();
    const vx0 = dir.x * (chargeForce + 10);
    const vy0 = dir.y * (chargeForce + 10);
    const vz0 = dir.z * (chargeForce + 10);

    // Parabola simulation
    let px = _prevPocket.x, py = _prevPocket.y, pz = _prevPocket.z;
    let vx = vx0, vy = vy0, vz = vz0;
    const dt = 1 / 60, stepsPerDot = 4;
    let di = 0;
    for (let step = 0; step < TRAJ_DOTS * stepsPerDot && di < TRAJ_DOTS; step++) {
        vy += -15.0 * dt; px += vx * dt; py += vy * dt; pz += vz * dt;
        if (py < 0) break;
        if (step % stepsPerDot === 0) {
            const d = trajectoryDots[di++];
            d.position.set(px, py, pz);
            d.visible = true;
        }
    }
    for (let i = di; i < TRAJ_DOTS; i++) trajectoryDots[i].visible = false;
}

function animate(time) {
    requestAnimationFrame(animate);

    // Calculate Delta Time
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    // Update UI Charge Meter
    if (isCharging) {
        chargeForce = Math.min(chargeForce + 30 * dt, MAX_CHARGE);
        document.getElementById('power-fill').style.width = `${(chargeForce / MAX_CHARGE) * 100}%`;

        const progress = chargeForce / MAX_CHARGE;

        // Animate David's throwing arm winding back based on charge progress
        davidGroup.torso.rotation.y = degToRad(-45) * progress;
        davidGroup.rightUpperArm.rotation.x = degToRad(120) * progress;
        davidGroup.rightForearm.rotation.x = degToRad(-15) * progress;
        davidGroup.rightForearm.rotation.z = degToRad(-30) * progress;

        // Left (support) arm
        davidGroup.leftUpperArm.rotation.x = degToRad(-80) * progress; 
        davidGroup.leftUpperArm.rotation.z = degToRad(-10) * progress;
        davidGroup.leftForearm.rotation.x = degToRad(-10) * progress; 

        // little squat with legs
        davidGroup.torso.position.y = 2.5 - (0.3 * progress); 
        davidGroup.rightThigh.rotation.x = degToRad(-35) * progress;
        davidGroup.leftThigh.rotation.x = degToRad(-35) * progress;
        davidGroup.rightShin.rotation.x = degToRad(70) * progress;
        davidGroup.leftShin.rotation.x = degToRad(70) * progress;
        davidGroup.rightFoot.rotation.x = degToRad(-35) * progress;
        davidGroup.leftFoot.rotation.x = degToRad(-35) * progress;
    }

    TWEEN.update(time);
    
    // Custom logic modules
    updatePhysics(projectiles, enemies, scene, dt, onLionKilled);
    slingPhysics(davidGroup, isThrowing, dt, isSlingOpen);
    updateProceduralAnimations(time / 1000, dt);
    updateBoss(dt);
    animateSheep(time * 0.001);
    if (philistineArmy && philistineArmy.visible) {
        philistineArmy.rotation.z = Math.sin(time * 0.0006) * 0.006;
    }
    updateTrajectoryPreview();

    // Render from the active view: David's POV or the fixed third-person.
    if (viewMode === 'first' && davidGroup && davidGroup.head) {
        updateFPCamera();
        renderer.render(scene, fpCamera);
    } else {
        renderer.render(scene, camera);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (fpCamera) {
        fpCamera.aspect = window.innerWidth / window.innerHeight;
        fpCamera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
}