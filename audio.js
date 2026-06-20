// functions for sound game
export const Sound = (() => {
    let ctx = null, master = null, musicGain = null, sfxGain = null;
    let muted = false, musicOn = false, musicTimer = null, step = 0;

    function ensure() {
        if (ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.0001;
        master.connect(ctx.destination);
        master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.6); // gentle fade-in
        musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
        sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    }
    function resume() { ensure(); if (ctx.state === 'suspended') ctx.resume(); }

    // A short plucked note 
    function pluck(freq, time, dur, dest, peak = 0.5) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(peak, time + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        o.connect(g); g.connect(dest);
        o.start(time); o.stop(time + dur + 0.02);
    }

    // A filtered noise burst with a sweeping band
    function noiseBurst(time, dur, f0, f1, peak, dest) {
        const n = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(f0, time);
        bp.frequency.exponentialRampToValueAtTime(f1, time + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(peak, time + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        src.connect(bp); bp.connect(g); g.connect(dest);
        src.start(time); src.stop(time + dur + 0.02);
    }

    function throwWhoosh() { if (ctx) noiseBurst(ctx.currentTime, 0.28, 500, 1800, 0.5, sfxGain); }

    function hit() {
        if (!ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
        g.gain.setValueAtTime(0.6, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + 0.24);
        noiseBurst(t, 0.12, 1200, 400, 0.3, sfxGain);
    }

    function victory() {
        if (!ctx) return;
        const t = ctx.currentTime;
        [392.0, 493.9, 587.3, 784.0].forEach((f, i) => pluck(f, t + i * 0.16, 0.9, sfxGain, 0.5));
    }

    function gameOver() {
        if (!ctx) return;
        const t = ctx.currentTime;
        [392.0, 329.6, 261.6].forEach((f, i) => pluck(f, t + i * 0.22, 0.7, sfxGain, 0.45));
    }

    // A brassy, swelling war-horn
    function hornBlast(time, f0, dur, peak, dest) {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * 0.94, time);
        o.frequency.exponentialRampToValueAtTime(f0, time + 0.14);     // scoop up into pitch
        lp.type = 'lowpass'; lp.Q.value = 0.8;
        lp.frequency.setValueAtTime(420, time);
        lp.frequency.exponentialRampToValueAtTime(1700, time + dur * 0.5);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(peak, time + 0.14);        // swell
        g.gain.setValueAtTime(peak, time + dur * 0.65);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);       // release
        o.connect(lp); lp.connect(g); g.connect(dest);
        o.start(time); o.stop(time + dur + 0.05);
    }

    // a two-note ram's-horn blast
    function challenge() {
        if (!ctx) return;
        const t = ctx.currentTime;
        hornBlast(t, 116.5, 0.85, 0.5, sfxGain);          // A#2, long low blast
        hornBlast(t + 0.72, 155.6, 1.15, 0.55, sfxGain);  // D#3, higher, held
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(56, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.42, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 1.0);
    }

    // Ambient lyre loop: a slow arpeggio scheduled in JS.
    const pattern = [293.66, 349.23, 440.0, 587.33, 440.0, 349.23]; // D4 F4 A4 D5 A4 F4
    function scheduleMusic() {
        if (!musicOn || !ctx) return;
        const t = ctx.currentTime + 0.05;
        pluck(pattern[step % pattern.length], t, 1.6, musicGain, 0.4);
        if (step % pattern.length === 0) pluck(146.83, t, 2.4, musicGain, 0.3); // low D drone
        step++;
        musicTimer = setTimeout(scheduleMusic, 480);
    }
    function startMusic() { ensure(); if (musicOn) return; musicOn = true; step = 0; scheduleMusic(); }
    function stopMusic() { musicOn = false; if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; } }

    function toggleMute() {
        ensure();
        muted = !muted;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.9, ctx.currentTime + 0.15);
        return muted;
    }
    function isMuted() { return muted; }

    function setMusicVolume(v) { ensure(); musicGain.gain.value = Math.max(0, Math.min(1, v)); }
    function setSfxVolume(v) { ensure(); sfxGain.gain.value = Math.max(0, Math.min(1, v)); }

    return { resume, throwWhoosh, hit, victory, gameOver, challenge, startMusic, stopMusic, toggleMute, isMuted, setMusicVolume, setSfxVolume };
})();
