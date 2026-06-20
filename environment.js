import * as THREE from 'three';

//Philistine soldiers for the Goliath scene
export function createPhilistineArmy() {
    const army = new THREE.Group();
    const tunic = new THREE.MeshStandardMaterial({ color: 0x4a4030, roughness: 1.0 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xcea775, roughness: 1.0 });
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 1.0 });

    const makeSoldier = () => {
        const s = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, 1.8, 8), tunic);
        body.position.y = 1.5; s.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), skin);
        head.position.y = 2.6; s.add(head);
        const helm = new THREE.Mesh(
            new THREE.SphereGeometry(0.34, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), bronze);
        helm.position.y = 2.66; s.add(helm);
        // round shield on one side
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 14), bronze);
        shield.rotation.z = Math.PI / 2;
        shield.position.set(0.52, 1.45, 0.25); s.add(shield);
        // raised spear (the army's spears on the horizon)
        const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), shaftMat);
        spear.position.set(-0.55, 2.1, 0); s.add(spear);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), bronze);
        tip.position.set(-0.55, 3.85, 0); s.add(tip);
        return s;
    };

    const count = 16;
    for (let i = 0; i < count; i++) {
        const sol = makeSoldier();
        const x = -23 + 46 * i / (count - 1) + (Math.random() - 0.5) * 1.6;
        const z = -32 - Math.random() * 6; // far away, varied depth
        sol.position.set(x, 0, z);
        sol.scale.setScalar(0.85 + Math.random() * 0.3);
        army.add(sol);
    }
    army.visible = false; // shown only in the boss scene
    return army;
}

// desert-battlefield dressing shown only during the Goliath
export function createBattlefieldDetails() {
    const g = new THREE.Group();
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 1 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 0.9 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x7a2e22, roughness: 1, side: THREE.DoubleSide });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7d68, roughness: 1, flatShading: true });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x6b6438, roughness: 1 });

    // Spears stuck in the ground at slight angles, scattered
    [[-6, -6], [-4, -9], [5, -7], [7, -4], [-8, -3], [4, -11], [9, -9], [-5, -13]]
        .forEach(([x, z]) => {
            const sp = new THREE.Group();
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), shaftMat);
            shaft.position.y = 1.2; shaft.castShadow = true; sp.add(shaft);
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), bronze);
            tip.position.y = 2.6; sp.add(tip);
            sp.position.set(x, 0, z);
            sp.rotation.z = (Math.random() - 0.5) * 0.5;
            sp.rotation.x = (Math.random() - 0.5) * 0.4;
            g.add(sp);
        });

    // Philistine banners flanking the field
    [[-10, -14], [10, -14]].forEach(([x, z]) => {
        const b = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 8), shaftMat);
        pole.position.y = 2.5; pole.castShadow = true; b.add(pole);
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), clothMat);
        cloth.position.set(0.75, 4.0, 0); b.add(cloth);
        b.position.set(x, 0, z);
        g.add(b);
    });

    // Scattered boulders
    [[-9, -8, 1.0], [8, -6, 1.3], [-5, -12, 0.8], [6, -13, 1.1], [7, -17, 1.5]]
        .forEach(([x, z, s]) => {
            const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
            r.position.set(x, s * 0.4, z);
            r.rotation.set(Math.random(), Math.random(), Math.random());
            r.castShadow = true; r.receiveShadow = true;
            g.add(r);
        });

    // Dead, scrubby bushes for a barren look
    [[-7, -10], [5, -8], [-4, -14], [8, -11]].forEach(([x, z]) => {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), bushMat);
        bush.scale.set(1, 0.6, 1);
        bush.position.set(x, 0.3, z);
        g.add(bush);
    });

    g.visible = false;// shown only in the boss scene
    return g;
}
