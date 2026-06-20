import * as THREE from 'three';
import { makeIrisTexture } from './textures.js';

console.log('%c[VERSION CHECK] entities.js — boss transition (sand flash + war-horn) build — loaded successfully', 'background: #222; color: #4caf50; font-size: 14px; padding: 4px;');

// A 4-level gradient map for cel-shading: a few hard steps of light/shadow instead of a continuous gradient
function createToonGradientMap() {
    const colors = new Uint8Array([60, 120, 180, 255]);
    const gradientTexture = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
    gradientTexture.needsUpdate = true;
    gradientTexture.minFilter = THREE.NearestFilter;
    gradientTexture.magFilter = THREE.NearestFilter;
    return gradientTexture;
}

const toonGradientMap = createToonGradientMap();

function makeToonMaterial(color) {
    return new THREE.MeshToonMaterial({
        color: color,
        gradientMap: toonGradientMap,
    });
}

// black edges
const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a,
    side: THREE.BackSide,
});

function addOutline(mesh, scale = 1.06) {
    const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMaterial);
    outlineMesh.scale.multiplyScalar(scale);
    mesh.add(outlineMesh);
    return outlineMesh;
}

// create a mesh + outline in one call, with shadows set
function createPart(geometry, material, options = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = options.castShadow !== false;
    mesh.receiveShadow = options.receiveShadow !== false;
    if (options.outline !== false) {
        addOutline(mesh, options.outlineScale || 1.06);
    }
    return mesh;
}

// build david model
export function createDavid() {
    const davidGroup = new THREE.Group();

    // --- MATERIALS ---
    const skinMat = makeToonMaterial(0xffcc99);
    const tunicMat = makeToonMaterial(0x2f5fb0);   // blue tunic
    const beltMat = makeToonMaterial(0xeeeeea);    // white belt/trim
    const hairShadow = makeToonMaterial(0x7e4420);// Copper-blond hair, in three tones
    const hairBase = makeToonMaterial(0xb06a30);
    const hairHi = makeToonMaterial(0xd99a52);
    const hairMat = hairBase;                   
    const sandalMat = makeToonMaterial(0x8a5a3c);

    // torso (V silhouette)
    const torsoProfile = [
        new THREE.Vector2(0.29, 0.0),    // hips (narrower)
        new THREE.Vector2(0.30, 0.22),
        new THREE.Vector2(0.32, 0.50),   // trim waist
        new THREE.Vector2(0.40, 0.78),   // lower chest
        new THREE.Vector2(0.44, 0.96),   // upper chest
        new THREE.Vector2(0.48, 1.08),   // shoulders (broadest point)
        new THREE.Vector2(0.20, 1.22),   // neck base (sharp taper)
    ];
    const torsoGeom = new THREE.LatheGeometry(torsoProfile, 20);
    torsoGeom.translate(0, -0.6, 0); // pivot at the center for natural rotations

    const torso = createPart(torsoGeom, tunicMat);
    torso.position.y = 2.4;
    davidGroup.add(torso);

    // Belt
    const beltGeom = new THREE.TorusGeometry(0.32, 0.05, 8, 16);
    beltGeom.rotateX(Math.PI / 2);
    const belt = createPart(beltGeom, beltMat, { outline: false });
    belt.position.y = -0.05;
    torso.add(belt);

    // tunic folds
    const waistRadius = 0.32, waistYLocal = 0.50 - 0.6;
    const hipRadius = 0.29, hipYLocal = 0.0 - 0.6;
    const nFolds = 7;
    const foldRadius = 0.02;
    const foldColor = new THREE.MeshToonMaterial({ color: 0x244a8f, gradientMap: toonGradientMap });

    for (let i = 0; i < nFolds; i++) {
        const angle = (i / nFolds) * Math.PI * 2;
        const start = new THREE.Vector3(
            waistRadius * Math.sin(angle), waistYLocal, waistRadius * Math.cos(angle)
        );
        const end = new THREE.Vector3(
            hipRadius * Math.sin(angle), hipYLocal, hipRadius * Math.cos(angle)
        );

        const direction = end.clone().sub(start);
        const length = direction.length();
        direction.normalize();

        const foldGeom = new THREE.CapsuleGeometry(foldRadius, Math.max(0.001, length - foldRadius * 2), 4, 6);
        const yAxis = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, direction);
        foldGeom.applyQuaternion(quat);

        const fold = createPart(foldGeom, foldColor, { outline: false });
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        fold.position.copy(midpoint);
        torso.add(fold);
    }

    // neck
    const neckGeom = new THREE.CylinderGeometry(0.14, 0.17, 0.18, 12);
    const neck = createPart(neckGeom, skinMat);
    neck.position.y = 0.72;
    torso.add(neck);

    // head
    const headGeom = new THREE.SphereGeometry(0.34, 20, 20);
    headGeom.scale(0.92, 1.05, 0.95);
    const head = createPart(headGeom, skinMat);
    head.position.y = 0.22;
    neck.add(head);

    // hair
    let hairSeed = 1337;
    const hrand = () => {
        hairSeed = (hairSeed * 1664525 + 1013904223) % 4294967296;
        return hairSeed / 4294967296;
    };
    const hrx = 0.34 * 0.92, hry = 0.34 * 1.05, hrz = 0.34 * 0.95;
    const hairRings = 6;
    for (let ridx = 0; ridx < hairRings; ridx++) {
        const theta = 0.18 + ridx * (2.18 - 0.18) / (hairRings - 1);
        const count = 6 + ridx * 3;
        for (let k = 0; k < count; k++) {
            const phi = 2 * Math.PI * k / count + (ridx % 2) * (Math.PI / count);
            const x = hrx * Math.sin(theta) * Math.sin(phi);
            const y = hry * Math.cos(theta);
            const z = hrz * Math.sin(theta) * Math.cos(phi);
            // keep the face clear: skip curls on the front below the hairline
            if (z > 0.08 && y < 0.24) continue;
            const jx = (hrand() - 0.5) * 0.044;
            const jy = (hrand() - 0.5) * 0.044;
            const jz = (hrand() - 0.5) * 0.044;
            const r = 0.072 + hrand() * 0.032;
            const push = 1.07;
            const px = x * push + jx, py = y + jy, pz = z * push + jz;

            // Shade by height
            const tier = (y / hry) * 0.5 + 0.5 + (hrand() - 0.5) * 0.2;
            const mat = tier > 0.62 ? hairHi : (tier > 0.34 ? hairBase : hairShadow);

            const curl = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
            curl.position.set(px, py, pz);
            curl.scale.set(1, 0.85 + hrand() * 0.45, 1); // slight elongation variety
            curl.castShadow = true;
            head.add(curl);

            const a = hrand() * Math.PI * 2;
            const sat = new THREE.Mesh(new THREE.SphereGeometry(r * (0.55 + hrand() * 0.22), 8, 8), mat);
            sat.position.set(px + Math.cos(a) * r * 0.95, py - r * 0.55, pz + Math.sin(a) * r * 0.95);
            sat.castShadow = true;
            head.add(sat);
        }
    }

    // eyes: light blue-green, with a graded iris texture and a catchlight.
    const irisTexture = makeIrisTexture(128);
    function createEye(xSide) {
        const eyeGroup = new THREE.Group();
        const scleraGeom = new THREE.SphereGeometry(0.075, 12, 12);
        const scleraMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradientMap });
        const sclera = new THREE.Mesh(scleraGeom, scleraMat);
        sclera.scale.set(1, 1.15, 0.8);
        eyeGroup.add(sclera);

        // Iris as a flat disc in front of the sclera.
        const iris = new THREE.Mesh(
            new THREE.CircleGeometry(0.052, 24),
            new THREE.MeshBasicMaterial({ map: irisTexture })
        );
        iris.position.z = 0.063;
        eyeGroup.add(iris);

        // Catchlight: a small white highlight at the upper edge of the iris.
        const catchlight = new THREE.Mesh(
            new THREE.CircleGeometry(0.013, 12),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        catchlight.position.set(xSide * -0.012, 0.018, 0.065);
        eyeGroup.add(catchlight);

        eyeGroup.position.set(xSide * 0.13, 0.02, 0.28);
        return eyeGroup;
    }
    head.add(createEye(1));
    head.add(createEye(-1));

    // Brows
    function createBrow(xSide) {
        const browGeom = new THREE.BoxGeometry(0.12, 0.025, 0.03);
        const brow = new THREE.Mesh(browGeom, hairShadow);
        brow.position.set(xSide * 0.13, 0.11, 0.31);
        brow.rotation.z = xSide * -0.15;
        return brow;
    }
    head.add(createBrow(1));
    head.add(createBrow(-1));

    // capsule for arms
    function capsuleTotalLength(radius, length) {
        return length + radius * 2;
    }

    // hand
    function createHand(isLeft = true) {
        const handGroup = new THREE.Group();
        const palmRadius = 0.1;

        const palmGeom = new THREE.SphereGeometry(palmRadius, 10, 10);
        palmGeom.scale(1, 0.85, 1.1);
        const palm = createPart(palmGeom, skinMat, { outline: false });
        handGroup.add(palm);
        const fingerRadius = 0.022;
        const fingerBaseLength = 0.085;
        const sideFlip = isLeft ? 1 : -1;
        const fingerSpecs = [
            [-0.06 * sideFlip, 0.85, 'pinky'],
            [-0.02 * sideFlip, 1.0, 'ring'],
            [0.02 * sideFlip, 1.0, 'middle'],
            [0.06 * sideFlip, 0.85, 'index'],
        ];
        const angleFromDown = THREE.MathUtils.degToRad(35);
        const attachY = -palmRadius * Math.cos(angleFromDown);
        const attachZ = palmRadius * Math.sin(angleFromDown);

        fingerSpecs.forEach(([xOff, lenScale, label]) => {
            const fLen = fingerBaseLength * lenScale;
            const fTotal = capsuleTotalLength(fingerRadius, fLen);
            const fingerGeom = new THREE.CapsuleGeometry(fingerRadius, fLen, 4, 6);
            fingerGeom.translate(0, -fTotal / 2, 0); // pivot at top
            fingerGeom.rotateX(-0.25); // slight downward/forward tilt
            const finger = createPart(fingerGeom, skinMat, { outline: false });
            finger.position.set(xOff, attachY, attachZ);
            handGroup.add(finger);
        });

        // Thumb
        const thumbRadius = 0.026;
        const thumbLength = 0.06;
        const thumbTotal = capsuleTotalLength(thumbRadius, thumbLength);
        const thumbGeom = new THREE.CapsuleGeometry(thumbRadius, thumbLength, 4, 6);
        thumbGeom.translate(0, -thumbTotal / 2, 0);
        thumbGeom.rotateZ(-Math.PI / 4 * sideFlip);
        const thumb = createPart(thumbGeom, skinMat, { outline: false });
        const theta = THREE.MathUtils.degToRad(15);
        const phi = THREE.MathUtils.degToRad(25);
        thumb.position.set(
            -palmRadius * Math.cos(theta) * Math.cos(phi) * sideFlip,
            -palmRadius * Math.sin(theta),
            palmRadius * Math.cos(theta) * Math.sin(phi)
        );
        handGroup.add(thumb);

        return handGroup;
    }

    function buildArm(xSide) {
        const upperR = 0.13, upperL = 0.42;
        const upperTotal = capsuleTotalLength(upperR, upperL);
        const upperArmGeom = new THREE.CapsuleGeometry(upperR, upperL, 6, 10);
        upperArmGeom.translate(0, -upperTotal / 2, 0); // pivot at top (shoulder)
        const upperArm = createPart(upperArmGeom, skinMat);
        upperArm.position.set(xSide * 0.42, 0.5, 0); // shoulder line
        torso.add(upperArm);

        // Deltoid cap
        const deltGeom = new THREE.SphereGeometry(0.15, 12, 12);
        deltGeom.scale(1.1, 0.9, 1.0);
        const deltoid = createPart(deltGeom, skinMat, { outline: true, outlineScale: 1.04 });
        deltoid.position.set(xSide * 0.02, 0.02, 0);
        upperArm.add(deltoid);

        const foreR = 0.105, foreL = 0.38;  
        const foreTotal = capsuleTotalLength(foreR, foreL);
        const forearmGeom = new THREE.CapsuleGeometry(foreR, foreL, 6, 10);
        forearmGeom.translate(0, -foreTotal / 2, 0); // pivot at top (elbow)
        const forearm = createPart(forearmGeom, skinMat);
        forearm.position.set(0, -upperTotal, 0); // attached to the bottom of the upper arm
        upperArm.add(forearm);

        // hand creation
        const hand = createHand(xSide === -1);
        hand.position.set(0, -foreTotal + 0.05, 0);
        forearm.add(hand);

        return { upperArm, forearm, hand, upperTotal, foreTotal };
    }
    // arms creation
    const rightArm = buildArm(-1);
    const leftArm = buildArm(1);

    // legs
    function buildLeg(xSide) {
        const thighR = 0.155, thighL = 0.6;  
        const thighTotal = capsuleTotalLength(thighR, thighL);
        const thighGeom = new THREE.CapsuleGeometry(thighR, thighL, 6, 10);
        thighGeom.translate(0, -thighTotal / 2, 0); // pivot at top (hip)
        const thigh = createPart(thighGeom, skinMat);
        thigh.position.set(xSide * 0.18, -0.6, 0);
        torso.add(thigh);

        const shinR = 0.125, shinL = 0.56;
        const shinTotal = capsuleTotalLength(shinR, shinL);
        const shinGeom = new THREE.CapsuleGeometry(shinR, shinL, 6, 10);
        shinGeom.translate(0, -shinTotal / 2, 0); // pivot at top (knee)
        const shin = createPart(shinGeom, skinMat);
        shin.position.set(0, -thighTotal, 0); // attached to the bottom of the thigh
        thigh.add(shin);

        // foot
        const footGeom = new THREE.CapsuleGeometry(0.1, 0.22, 6, 8);
        footGeom.rotateZ(Math.PI / 2);
        footGeom.scale(1, 0.7, 1);
        footGeom.translate(0, 0, 0.07);
        const foot = createPart(footGeom, sandalMat, { outline: false });
        foot.position.set(xSide * 0.025, -shinTotal + 0.04, 0); // attached to the bottom of the shin
        shin.add(foot);

        return { thigh, shin, foot, thighTotal, shinTotal };
    }
    const rightLeg = buildLeg(1);
    const leftLeg = buildLeg(-1);

    // Sling
    const slingGroup = new THREE.Group();
    slingGroup.position.set(0, -rightArm.foreTotal - 0.05, 0);
    const stringMat = new THREE.LineBasicMaterial({ color: 0x553311, linewidth: 2 });

    const stringGeomLeft = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.22, -0.8, 0)
    ]);
    const stringLeft = new THREE.Line(stringGeomLeft, stringMat);
    slingGroup.add(stringLeft);

    const stringGeomRight = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.22, -0.8, 0)
    ]);
    const stringRight = new THREE.Line(stringGeomRight, stringMat);
    slingGroup.add(stringRight);

    rightArm.forearm.add(slingGroup);

    const pocketRadius = 0.18;
    const pocketWidth = 0.4;
    const pocketGeom = new THREE.CylinderGeometry(pocketRadius, pocketRadius, pocketWidth, 12, 1, true, 0, Math.PI);
    pocketGeom.rotateZ(Math.PI / 2);
    pocketGeom.rotateX(Math.PI / 2);
    const pocketMat = makeToonMaterial(0x4a2e15);
    const pocket = createPart(pocketGeom, pocketMat, { outline: false });
    pocket.position.set(0, -0.8, 0);
    slingGroup.add(pocket);

    davidGroup.position.set(0, -0.1, 0);

    return {
        model: davidGroup,
        torso,
        head,
        rightUpperArm: rightArm.upperArm,
        rightForearm: rightArm.forearm,
        leftUpperArm: leftArm.upperArm,
        leftForearm: leftArm.forearm,
        rightThigh: rightLeg.thigh,
        rightShin: rightLeg.shin,
        rightFoot: rightLeg.foot,
        leftThigh: leftLeg.thigh,
        leftShin: leftLeg.shin,
        leftFoot: leftLeg.foot,
        sling: slingGroup,
        stringLeft,
        stringRight,
        pocket,
        tunicMat,        
        foldMat: foldColor,
    };
}

// lion
export function createLion() {
    const lionGroup = new THREE.Group();

    // Toon materials
    const furMat = makeToonMaterial(0xc98a35);     // body fur
    const furDarkMat = makeToonMaterial(0xa9701f); // paws (darker)
    const maneMat = makeToonMaterial(0x3d2410);    // dark mane
    const maneMat2 = makeToonMaterial(0x4a2c14);   // mane variation
    const muzzleMat = makeToonMaterial(0xdba85a);  // light muzzle
    const darkMat = makeToonMaterial(0x2a1a0e);    // nose/details
    const eyeMat = makeToonMaterial(0xf4d03f);     // fierce yellow eyes
    const pupilMat = makeToonMaterial(0x1a0e06);
    const toothMat = makeToonMaterial(0xfffaf0);   // zanne

    // Deterministic PRNG for repeatable jitter (mane)
    let seed = 1337;
    function srand() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    }

    // mane "spike" cone, oriented toward 'direction', with its base placed at 'basePos'
    function maneSpike(radius, height, direction, basePos, material) {
        const geom = new THREE.ConeGeometry(radius, height, 7);
        geom.translate(0, height / 2, 0); // base at origin, tip toward +y
        const mesh = new THREE.Mesh(geom, material);
        mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        mesh.position.copy(basePos);
        mesh.castShadow = true;
        return mesh;
    }

    // capsule body
    const bodyGeom = new THREE.CapsuleGeometry(0.5, 1.0, 8, 16);
    bodyGeom.rotateX(Math.PI / 2); // capsula lungo Z
    const body = createPart(bodyGeom, furMat);
    body.position.y = 1.6;
    lionGroup.add(body);

    // bulges
    const lionBulgePositions = [
        [-0.4, -0.4, 0.8], [0.4, -0.4, 0.8],   // shoulders (front)
        [-0.4, -0.4, -0.8], [0.4, -0.4, -0.8], // back
    ];
    lionBulgePositions.forEach((p) => {
        const bGeom = new THREE.SphereGeometry(0.3, 10, 10);
        bGeom.scale(0.85, 1.0, 0.95);
        const bulge = createPart(bGeom, furMat, { outline: false });
        bulge.position.set(p[0], p[1], p[2]);
        body.add(bulge);
    });

    // head (sphere)
    const head = new THREE.Group();
    head.position.set(0, 0.5, 1.2);
    body.add(head);

    const headRadius = 0.44;
    const headGeom = new THREE.SphereGeometry(headRadius, 16, 16);
    headGeom.scale(1.0, 0.92, 1.0);
    const headMesh = createPart(headGeom, furMat);
    head.add(headMesh);

    // muzzle
    const muzzleGeom = new THREE.SphereGeometry(0.23, 12, 12);
    muzzleGeom.scale(1.1, 0.78, 1.0);
    const muzzle = createPart(muzzleGeom, muzzleMat, { outline: false });
    muzzle.position.set(0, -0.11, headRadius + 0.05);
    head.add(muzzle);

    // nose
    const noseGeom = new THREE.SphereGeometry(0.07, 10, 10);
    noseGeom.scale(1.3, 0.8, 0.8);
    const nose = new THREE.Mesh(noseGeom, darkMat);
    nose.position.set(0, -0.05, headRadius + 0.24);
    head.add(nose);

    // fangs
    [-1, 1].forEach((sx) => {
        const fangGeom = new THREE.ConeGeometry(0.026, 0.1, 6);
        fangGeom.rotateX(Math.PI); // points downward (-y)
        const fang = new THREE.Mesh(fangGeom, toothMat);
        fang.position.set(sx * 0.07, -0.22, headRadius + 0.14);
        head.add(fang);
    });

    // aggressive brows
    [-1, 1].forEach((sx) => {
        const browGeom = new THREE.BoxGeometry(0.18, 0.06, 0.09);
        const brow = new THREE.Mesh(browGeom, maneMat);
        brow.rotation.z = THREE.MathUtils.degToRad(-22) * sx;
        brow.rotation.x = THREE.MathUtils.degToRad(20);
        brow.position.set(sx * 0.16, 0.14, headRadius * 0.82);
        head.add(brow);
    });

    // narrow yellow eyes + pupils
    [-1, 1].forEach((sx) => {
        const eyeGeom = new THREE.SphereGeometry(0.058, 10, 10);
        eyeGeom.scale(1.4, 0.7, 0.6);
        const eye = new THREE.Mesh(eyeGeom, eyeMat);
        eye.rotation.z = THREE.MathUtils.degToRad(-18) * sx;
        eye.position.set(sx * 0.16, 0.045, headRadius * 0.86);
        head.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), pupilMat);
        pupil.position.set(sx * 0.16, 0.045, headRadius * 0.86 + 0.035);
        head.add(pupil);
    });

    // ears
    [-1, 1].forEach((sx) => {
        const earGeom = new THREE.SphereGeometry(0.1, 10, 10);
        earGeom.scale(1.0, 1.1, 0.5);
        const ear = createPart(earGeom, furMat, { outline: false });
        ear.position.set(sx * 0.30, headRadius * 0.78, -0.02);
        head.add(ear);
    });

    // spike mane
    const maneCenter = new THREE.Vector3(0, 0, -0.06);
    const nBase = 10;
    for (let i = 0; i < nBase; i++) {
        const ang = (i / nBase) * Math.PI * 2;
        const r = 0.46;
        const z = maneCenter.z - 0.05 + (srand() - 0.5) * 0.2;
        const s = 0.18 + srand() * 0.05;
        const lobeGeom = new THREE.SphereGeometry(s, 8, 8);
        lobeGeom.scale(1, 1, 0.85);
        const lobe = new THREE.Mesh(lobeGeom, maneMat2);
        lobe.position.set(Math.sin(ang) * r, Math.cos(ang) * r * 0.95, z);
        lobe.castShadow = true;
        head.add(lobe);
    }
    
    const nSpikes = 16;
    for (let i = 0; i < nSpikes; i++) {
        const ang = (i / nSpikes) * Math.PI * 2;
        const dx = Math.sin(ang), dy = Math.cos(ang);
        const dz = -0.35 + (srand() - 0.5) * 0.2;
        const direction = new THREE.Vector3(dx, dy, dz);
        const baseR = 0.46;
        const basePos = new THREE.Vector3(
            maneCenter.x + dx * baseR, maneCenter.y + dy * baseR * 0.95, maneCenter.z);
        const spikeLen = 0.26 + srand() * 0.16;
        const spikeRad = 0.075 + srand() * 0.02;
        head.add(maneSpike(spikeRad, spikeLen, direction, basePos,
            (i % 2 === 0) ? maneMat : maneMat2));
    }
    
    const nInner = 7;
    for (let i = 0; i < nInner; i++) {
        const ang = (i / nInner) * Math.PI * 2 + 0.26;
        const dx = Math.sin(ang), dy = Math.cos(ang);
        const dz = -0.1 + (srand() - 0.5) * 0.2;
        const direction = new THREE.Vector3(dx, dy, dz);
        const basePos = new THREE.Vector3(
            maneCenter.x + dx * 0.32, maneCenter.y + dy * 0.32 * 0.95, maneCenter.z + 0.03);
        head.add(maneSpike(0.06, 0.16 + srand() * 0.09, direction, basePos, maneMat));
    }

    // tail as a cylinder with segments
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.3, -1);
    body.add(tailGroup);

    const tailSegments = [];
    const segmentCount = 4;
    const segmentLength = 0.3;
    const segGeom = new THREE.CylinderGeometry(0.07, 0.06, segmentLength, 8);
    segGeom.translate(0, -segmentLength / 2, 0); // pivot at top for each segment
    let parentBone = tailGroup;
    for (let i = 0; i < segmentCount; i++) {
        const segment = new THREE.Mesh(segGeom, furMat);
        segment.castShadow = true;
        segment.position.set(0, i === 0 ? 0 : -segmentLength, 0);
        parentBone.add(segment);
        tailSegments.push(segment);
        parentBone = segment;
    }
    // dark tip tuft
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), maneMat);
    tuft.position.set(0, -segmentLength, 0);
    tuft.castShadow = true;
    parentBone.add(tuft);

    // legs
    const thighGeom = new THREE.CylinderGeometry(0.16, 0.13, 0.6, 10);
    thighGeom.translate(0, -0.3, 0);
    const shinGeom = new THREE.CylinderGeometry(0.135, 0.11, 0.4, 10);
    shinGeom.translate(0, -0.2, 0);
    const pawGeom = new THREE.SphereGeometry(0.2, 12, 12);
    pawGeom.scale(0.8, 0.55, 1.2);
    pawGeom.translate(0, -0.2, 0.1);

    const legs = [];
    const thighPositions = [
        [-0.4, -0.5, 0.8],  // Front Left
        [0.4, -0.5, 0.8],   // Front Right
        [-0.4, -0.5, -0.8], // Back Left
        [0.4, -0.5, -0.8],  // Back Right
    ];
    thighPositions.forEach((pos) => {
        const legGroup = new THREE.Group();
        legGroup.position.set(pos[0], pos[1], pos[2]);
        body.add(legGroup);

        const thigh = createPart(thighGeom, furDarkMat, { outline: false });
        legGroup.add(thigh);

        const shin = createPart(shinGeom, furDarkMat, { outline: false });
        shin.position.set(0, -0.6, 0); // bottom of the thigh
        thigh.add(shin);

        const paw = createPart(pawGeom, furDarkMat, { outline: false });
        paw.position.set(0, -0.2, 0);
        shin.add(paw);

        legs.push({ leg: legGroup, thigh: thigh, shin: shin, paw: paw });
    });

    return {
        model: lionGroup,
        body: body,
        head: head,
        tail: tailGroup,
        tailSegments: tailSegments,
        legs: legs,
        isDead: false,
    };
}


// Goliath
export function createGoliath() {
    const g = new THREE.Group();

    // toon materials
    const brass = makeToonMaterial(0xc89b4a);
    const brassD = makeToonMaterial(0x9a7430);
    const skin = makeToonMaterial(0xc08a55);
    const beardMat = makeToonMaterial(0x241509);
    const tunic = makeToonMaterial(0x5a2424);
    const crestMat = makeToonMaterial(0x8f2222);
    const wood = makeToonMaterial(0x6e4a28);
    const iron = makeToonMaterial(0x8a8f96);

    const cylY = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
    const boxG = (x, y, z) => new THREE.BoxGeometry(x, y, z);

    // legs
    const goliathLegs = [];
    [-1, 1].forEach((sx) => {
        const hx = sx * 0.42;
        const legGroup = new THREE.Group();
        legGroup.position.set(hx, 2.4, 0); 
        g.add(legGroup);

        const thigh = createPart(cylY(0.26, 0.26, 1.05), skin, { outline: false });
        thigh.position.set(0, 1.85 - 2.4, 0);
        legGroup.add(thigh);
        const greave = createPart(cylY(0.24, 0.24, 1.0), brass, { outline: false });
        greave.position.set(0, 0.85 - 2.4, 0.02);
        legGroup.add(greave);
        const kneeGeom = new THREE.SphereGeometry(0.26, 12, 12); kneeGeom.scale(1.0, 0.6, 1.0);
        const knee = new THREE.Mesh(kneeGeom, brassD); knee.position.set(0, 1.38 - 2.4, 0.04); knee.castShadow = true;
        legGroup.add(knee);
        const foot = createPart(boxG(0.42, 0.22, 0.75), brassD, { outline: false });
        foot.position.set(0, 0.11 - 2.4, 0.18);
        legGroup.add(foot);

        goliathLegs.push(legGroup);
    });

    // armored skirt
    const skirtGeom = cylY(0.62, 0.62, 0.6, 18); skirtGeom.scale(1.0, 1.0, 0.85);
    const skirt = createPart(skirtGeom, tunic, { outline: false });
    skirt.position.set(0, 2.55, 0);
    g.add(skirt);
    for (let i = 0; i < 7; i++) {
        const ang = -0.9 + i * 0.3;
        const strip = new THREE.Mesh(boxG(0.16, 0.42, 0.1), brassD);
        strip.position.set(Math.sin(ang) * 0.6, 2.42, Math.cos(ang) * 0.55 + 0.02);
        strip.castShadow = true;
        g.add(strip);
    }

    // cuirass
    const chestGeom = new THREE.SphereGeometry(0.78, 16, 16); chestGeom.scale(1.05, 0.95, 0.72);
    const chest = createPart(chestGeom, brass);
    chest.position.set(0, 3.45, 0);
    g.add(chest);
    const abdomen = createPart(boxG(1.15, 0.55, 0.82), brassD, { outline: false });
    abdomen.position.set(0, 2.95, 0.02);
    g.add(abdomen);
    
    for (let row = 0; row < 3; row++) {
        const y = 3.15 + row * 0.28;
        for (let col = -2; col <= 2; col++) {
            const scaleGeom = new THREE.SphereGeometry(0.1, 8, 8); scaleGeom.scale(1.0, 0.6, 0.4);
            const sc = new THREE.Mesh(scaleGeom, brassD);
            sc.position.set(col * 0.26, y, 0.56 - row * 0.02);
            g.add(sc);
        }
    }

    // shoulders
    [-1, 1].forEach((sx) => {
        const pGeom = new THREE.SphereGeometry(0.34, 12, 12); pGeom.scale(1.1, 0.9, 1.0);
        const pauldron = createPart(pGeom, brass, { outline: false });
        pauldron.position.set(sx * 0.82, 4.02, 0);
        g.add(pauldron);
    });

    // arms
    const upArmR = createPart(cylY(0.2, 0.2, 0.95), skin, { outline: false });
    upArmR.position.set(0.92, 3.5, 0.05); g.add(upArmR);
    const foreR = createPart(cylY(0.17, 0.17, 0.9), skin, { outline: false });
    foreR.position.set(0.95, 2.95, 0.18); g.add(foreR);
    const vambR = createPart(cylY(0.19, 0.19, 0.45), brass, { outline: false });
    vambR.position.set(0.95, 2.95, 0.18); g.add(vambR);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skin);
    handR.position.set(0.96, 2.5, 0.28); handR.castShadow = true; g.add(handR);

    const upArmL = createPart(cylY(0.2, 0.2, 0.9), skin, { outline: false });
    upArmL.position.set(-0.92, 3.5, 0.05); g.add(upArmL);
    const foreL = createPart(cylY(0.17, 0.17, 0.7), skin, { outline: false });
    foreL.rotation.x = THREE.MathUtils.degToRad(70);
    foreL.position.set(-0.9, 3.15, 0.4); g.add(foreL);
    const vambL = createPart(cylY(0.19, 0.19, 0.4), brass, { outline: false });
    vambL.rotation.x = THREE.MathUtils.degToRad(70);
    vambL.position.set(-0.9, 3.05, 0.55); g.add(vambL);

    // shield
    const shieldGeom = cylY(0.62, 0.62, 0.12, 20); shieldGeom.rotateX(Math.PI / 2);
    const shield = createPart(shieldGeom, brass, { outline: false });
    shield.position.set(-0.78, 3.05, 0.75); g.add(shield);
    const rimGeom = cylY(0.62, 0.62, 0.16, 20); rimGeom.rotateX(Math.PI / 2); rimGeom.scale(1.08, 1.08, 1.0);
    const shieldRim = new THREE.Mesh(rimGeom, brassD); shieldRim.position.set(-0.78, 3.05, 0.72); g.add(shieldRim);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), brassD);
    boss.position.set(-0.78, 3.05, 0.84); g.add(boss);

    // spear
    const shaft = createPart(cylY(0.06, 0.06, 3.8), wood, { outline: false });
    shaft.position.set(0.98, 3.7, 0.28); g.add(shaft);
    const collar = new THREE.Mesh(cylY(0.1, 0.1, 0.22), brassD); collar.position.set(0.98, 5.5, 0.28); g.add(collar);
    const spearHead = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.62, 12), iron);
    spearHead.position.set(0.98, 5.85, 0.28); spearHead.castShadow = true; g.add(spearHead);

    // head and neck
    const neck = createPart(cylY(0.22, 0.22, 0.28), skin, { outline: false });
    neck.position.set(0, 4.32, 0); g.add(neck);

    const head = new THREE.Group();
    head.position.set(0, 4.72, 0.04);
    g.add(head);

    const headGeom = new THREE.SphereGeometry(0.42, 16, 16); headGeom.scale(1.0, 1.05, 1.0);
    const headMesh = createPart(headGeom, skin);
    head.add(headMesh);
    const beardGeom = new THREE.SphereGeometry(0.4, 14, 14); beardGeom.scale(1.0, 0.85, 1.0);
    const beardM = new THREE.Mesh(beardGeom, beardMat); beardM.position.set(0, -0.16, 0.02); head.add(beardM);
    const noseGeom = new THREE.SphereGeometry(0.08, 10, 10); noseGeom.scale(0.8, 1.1, 1.0);
    const nose = new THREE.Mesh(noseGeom, skin); nose.position.set(0, -0.02, 0.4); head.add(nose);
    [-1, 1].forEach((sx) => {
        const eyeGeom = new THREE.SphereGeometry(0.05, 10, 10); eyeGeom.scale(1.3, 0.7, 0.6);
        const eye = new THREE.Mesh(eyeGeom, makeToonMaterial(0x1a0e06));
        eye.position.set(sx * 0.16, 0.06, 0.37); head.add(eye);
        const brow = new THREE.Mesh(boxG(0.18, 0.05, 0.08), beardMat);
        brow.rotation.z = THREE.MathUtils.degToRad(-12) * sx;
        brow.position.set(sx * 0.16, 0.15, 0.36); head.add(brow);
    });

    // helmet
    const helmGeom = new THREE.SphereGeometry(0.46, 16, 16); helmGeom.scale(1.05, 1.0, 1.05);
    const helm = createPart(helmGeom, brass, { outline: false });
    helm.position.set(0, 0.18, 0); head.add(helm);
    const nasal = new THREE.Mesh(boxG(0.1, 0.42, 0.12), brassD); nasal.position.set(0, 0.02, 0.42); head.add(nasal);
    const rim2 = new THREE.Mesh(cylY(0.47, 0.47, 0.1), brassD); rim2.position.set(0, 0.18, 0); head.add(rim2);
    for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const h = 0.26 + 0.2 * Math.sin(t * Math.PI);
        const plume = new THREE.Mesh(boxG(0.2, h, 0.13), crestMat);
        plume.position.set(0, 0.6 + h / 2 - 0.08, -0.34 + t * 0.68);
        plume.castShadow = true;
        head.add(plume);
    }

    // forehead
    const forehead = new THREE.Object3D();
    forehead.position.set(0, 0.14, 0.42);
    head.add(forehead);

    return {
        model: g,
        head: head,
        forehead: forehead,
        legs: goliathLegs,
        isDead: false,
    };
}

// sheep
export function createSheep() {
    const s = new THREE.Group();
    const wool = makeToonMaterial(0xf1ede1);
    const dark = makeToonMaterial(0x3a3633);
    const sph = (r, sx = 1, sy = 1, sz = 1) => {
        const g = new THREE.SphereGeometry(r, 12, 12);
        if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
        return g;
    };

    // woolly body
    const body = createPart(sph(0.45, 1.35, 0.95, 1.05), wool, { outline: true, outlineScale: 1.04 });
    body.position.set(0, 0.62, 0);
    s.add(body);
    // wool bumps for the fluffy look
    [[-0.32, 0.85, 0.15, 0.28], [0.34, 0.85, 0.12, 0.27], [0.0, 0.92, -0.05, 0.30],
     [-0.18, 0.82, -0.45, 0.24], [0.22, 0.82, -0.42, 0.24], [0.0, 0.8, 0.5, 0.22]]
        .forEach(([x, y, z, r]) => {
            const f = new THREE.Mesh(sph(r), wool);
            f.position.set(x, y, z); f.castShadow = true; s.add(f);
        });

    // head
    const head = new THREE.Group();
    head.position.set(0, 0.6, 0.66);
    s.add(head);
    const headMesh = createPart(sph(0.21, 0.92, 1.12, 1.0), dark, { outline: false });
    head.add(headMesh);
    const forelock = new THREE.Mesh(sph(0.13, 1.1, 0.9, 0.9), wool);
    forelock.position.set(0, 0.18, -0.06); head.add(forelock);
    [1, -1].forEach((sx) => {
        const ear = new THREE.Mesh(sph(0.1, 1.7, 0.7, 0.5), dark);
        ear.position.set(sx * 0.2, 0.04, -0.08); head.add(ear);
        const eye = new THREE.Mesh(sph(0.045), makeToonMaterial(0xffffff));
        eye.position.set(sx * 0.09, 0.06, 0.17); head.add(eye);
        const pup = new THREE.Mesh(sph(0.022), makeToonMaterial(0x141414));
        pup.position.set(sx * 0.09, 0.06, 0.2); head.add(pup);
    });
    const snout = new THREE.Mesh(sph(0.1, 1.0, 0.8, 0.9), dark);
    snout.position.set(0, -0.1, 0.12); head.add(snout);

    // legs
    [[0.26, 0.33], [-0.26, 0.33], [0.26, -0.33], [-0.26, -0.33]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8), dark);
        leg.position.set(x, 0.21, z); leg.castShadow = true; s.add(leg);
    });

    // small tail
    const tail = new THREE.Mesh(sph(0.13), wool);
    tail.position.set(0, 0.66, -0.66); tail.castShadow = true; s.add(tail);

    return { model: s, head: head };
}

// stone projectile
export function createStone() {
    const stoneGeom = new THREE.SphereGeometry(0.15, 8, 8);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 });
    const stone = new THREE.Mesh(stoneGeom, stoneMat);
    stone.castShadow = true;
    return stone;
}
