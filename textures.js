import * as THREE from 'three';

// Small deterministic PRNG (mulberry32) for reproducible noise.
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Tileable value noise: a grid of random values, bilinearly interpolated with a smoothstep and wrapping at the edges
function makeValueNoise(gridSize, rng) {
    const g = new Float32Array(gridSize * gridSize);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const at = (xi, yi) => g[(((yi % gridSize) + gridSize) % gridSize) * gridSize + (((xi % gridSize) + gridSize) % gridSize)];
    return (u, v) => {
        const x = u * gridSize, y = v * gridSize;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = x - x0, fy = y - y0;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };
}

// Fractal (multi-octave) noise in [0,1].
function fbm(noises, u, v) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < noises.length; i++) {
        const f = 1 << i;
        sum += amp * noises[i](u * f, v * f);
        norm += amp; amp *= 0.5;
    }
    return sum / norm;
}

// Build the three sand maps at the given (power-of-two) size.
export function makeSandTextures(size = 256) {
    const rng = mulberry32(1337);
    const heightNoises = [makeValueNoise(8, rng), makeValueNoise(16, rng), makeValueNoise(32, rng), makeValueNoise(64, rng)];
    const roughNoise = makeValueNoise(48, rng);
    const H = (u, v) => fbm(heightNoises, u, v);

    const color = new Uint8Array(size * size * 4);
    const normal = new Uint8Array(size * size * 4);
    const rough = new Uint8Array(size * size * 4);

    const lo = [0xa6, 0x89, 0x55];   // darker sand in the troughs (wider contrast)
    const hi = [0xe6, 0xd2, 0x9c];   // lighter sand on the crests (wider contrast)
    const eps = 1 / size;
    const strength = 3.8;            // stronger height gradient : more visible relief

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size;
            const h = H(u, v);
            const idx = (y * size + x) * 4;

            // Color: blend the two tones by height, plus fine grain
            const grain = (fbm(heightNoises, u * 4, v * 4) - 0.5) * 0.18;
            const t = Math.min(1, Math.max(0, h + grain));
            color[idx] = lo[0] + (hi[0] - lo[0]) * t;
            color[idx + 1] = lo[1] + (hi[1] - lo[1]) * t;
            color[idx + 2] = lo[2] + (hi[2] - lo[2]) * t;
            color[idx + 3] = 255;

            // normal: from the height-field gradient (finite differences)
            const hL = H(u - eps, v), hR = H(u + eps, v);
            const hD = H(u, v - eps), hU = H(u, v + eps);
            let nx = (hL - hR) * strength, ny = (hD - hU) * strength, nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len; ny /= len; nz /= len;
            normal[idx] = (nx * 0.5 + 0.5) * 255;
            normal[idx + 1] = (ny * 0.5 + 0.5) * 255;
            normal[idx + 2] = (nz * 0.5 + 0.5) * 255;
            normal[idx + 3] = 255;

            // Roughness: sand is rough; vary it slightly so highlights aren't perfectly uniform
            const r = 200 + roughNoise(u, v) * 55; // ~0.78..1.0
            rough[idx] = rough[idx + 1] = rough[idx + 2] = r;
            rough[idx + 3] = 255;
        }
    }

    const mk = (data, srgb) => {
        const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
    };

    return {
        colorMap: mk(color, true),
        normalMap: mk(normal, false),
        roughnessMap: mk(rough, false),
    };
}

// Woven-cloth color map, used as a switchable texture for David's tunic.
export function makeClothTexture(baseHex = 0xcdbb8a, size = 128) {
    const r0 = (baseHex >> 16) & 255, g0 = (baseHex >> 8) & 255, b0 = baseHex & 255;
    const data = new Uint8Array(size * size * 4);
    const weave = makeValueNoise(size / 2, mulberry32(99));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size;
            const thread = 0.07 * Math.sin(x * Math.PI) + 0.07 * Math.sin(y * Math.PI);
            const grain = (weave(u, v) - 0.5) * 0.14;
            const band = (Math.floor(v * 6) % 2 === 0) ? 0.16 : -0.10; // horizontal stripes (stronger)
            const f = 1 + thread + grain + band;
            const idx = (y * size + x) * 4;
            data[idx] = Math.min(255, Math.max(0, r0 * f));
            data[idx + 1] = Math.min(255, Math.max(0, g0 * f));
            data[idx + 2] = Math.min(255, Math.max(0, b0 * f));
            data[idx + 3] = 255;
        }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

// A radial iris texture: dark pupil, a graded blue-green iris with faint radial striations, and a darker limbal ring
export function makeIrisTexture(size = 128) {
    const data = new Uint8Array(size * size * 4);
    const cx = (size - 1) / 2, cy = (size - 1) / 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    const inner = [0x9f, 0xd6, 0xdd];  // bright aqua near the pupil
    const outer = [0x3f, 0x87, 0xa0];  // deeper teal-blue at the rim
    const pupil = [0x0e, 0x12, 0x16];
    const limbal = [0x20, 0x42, 0x4d];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x - cx) / (size / 2), dy = (y - cy) / (size / 2);
            const rr = Math.min(1, Math.hypot(dx, dy)); // 0 center .. 1 disc edge
            const ang = Math.atan2(dy, dx);
            let col;
            if (rr < 0.30) {
                col = pupil;
            } else if (rr < 0.90) {
                const t = (rr - 0.30) / 0.60;
                const stria = 0.07 * Math.sin(ang * 22) * (0.4 + t); // fine fibers
                col = [
                    lerp(inner[0], outer[0], t) * (1 + stria),
                    lerp(inner[1], outer[1], t) * (1 + stria),
                    lerp(inner[2], outer[2], t) * (1 + stria),
                ];
            } else {
                col = limbal;
            }
            const idx = (y * size + x) * 4;
            data[idx] = Math.min(255, Math.max(0, col[0]));
            data[idx + 1] = Math.min(255, Math.max(0, col[1]));
            data[idx + 2] = Math.min(255, Math.max(0, col[2]));
            data[idx + 3] = 255;
        }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}
