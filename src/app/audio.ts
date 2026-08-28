// audio.ts — procedural WebAudio sound engine for DungeonGuys2 (no audio
// assets). A near-literal port of ORIG/audio.js: it already was an isolated
// module that only ever touches WebAudio, so the IIFE becomes an
// `export const Sfx = (() => { ... })()` and gets types. `Math.random()`
// stays legal here — the sim/ purity barrier (T3) does not reach app/.
type ToneOpts = {
  freq: number;
  type?: OscillatorType;
  dur: number;
  vol: number;
  slide?: number;
  at?: number;
  delay?: number;
  dest?: AudioNode;
};

type NoiseOpts = {
  dur: number;
  vol: number;
  freq?: number;
  slide?: number;
  filter?: BiquadFilterType;
  at?: number;
  delay?: number;
  dest?: AudioNode;
};

export const Sfx = (() => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let muted = false;
  let vol = 0.5; // master volume 0..1 (independent of mute)
  let musicOn = false;
  let bossMode = false; // swaps to a louder, grittier pattern during boss fights
  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let step = 0;
  let nextNoteTime = 0;
  const lastPlayed: Record<string, number> = {};

  function init(): void {
    if (ctx) { resume(); return; }
    const AC = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : vol;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.2;
    musicGain.connect(master);
  }

  function resume(): void {
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  // one-shot oscillator with a quick attack/decay envelope
  function tone(o: ToneOpts): void {
    if (!ctx || !master) return;
    const t0 = o.at !== undefined ? o.at : ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slide) osc.frequency.linearRampToValueAtTime(Math.max(20, o.freq + o.slide), t0 + o.dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + o.dur);
    osc.connect(g).connect(o.dest || master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  // filtered white-noise burst (whooshes, impacts, hats)
  function noise(o: NoiseOpts): void {
    if (!ctx || !master) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = o.at !== undefined ? o.at : ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.slide) f.frequency.linearRampToValueAtTime(Math.max(40, (o.freq || 1000) + o.slide), t0 + o.dur);
    f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + o.dur);
    src.connect(f).connect(g).connect(o.dest || master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.02);
  }

  const SOUNDS: Record<string, () => void> = {
    shoot: () => tone({ freq: 740, type: 'square', dur: 0.09, vol: 0.15, slide: -350 }),
    eshoot: () => tone({ freq: 330, type: 'sawtooth', dur: 0.12, vol: 0.12, slide: -180 }),
    arrow: () => noise({ dur: 0.12, vol: 0.18, freq: 2800, slide: -1800 }),
    swing: () => noise({ dur: 0.14, vol: 0.2, freq: 1000, slide: -650 }),
    hit: () => {
      tone({ freq: 200, type: 'triangle', dur: 0.06, vol: 0.22, slide: -70 });
      noise({ dur: 0.04, vol: 0.1, freq: 500 });
    },
    death: () => tone({ freq: 320, type: 'sawtooth', dur: 0.22, vol: 0.2, slide: -240 }),
    coin: () => {
      tone({ freq: 1318, dur: 0.05, vol: 0.15 });
      tone({ freq: 1760, dur: 0.1, vol: 0.15, delay: 0.05 });
    },
    potion: () => {
      tone({ freq: 520, type: 'triangle', dur: 0.1, vol: 0.2, slide: 200 });
      tone({ freq: 780, type: 'triangle', dur: 0.12, vol: 0.18, delay: 0.08, slide: 150 });
    },
    levelup: () => [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.1, vol: 0.18, delay: i * 0.07 })),
    hurt: () => {
      tone({ freq: 130, type: 'sawtooth', dur: 0.18, vol: 0.3, slide: -50 });
      noise({ dur: 0.1, vol: 0.12, freq: 300 });
    },
    dodge: () => noise({ dur: 0.08, vol: 0.12, freq: 4000, slide: -1000 }),
    special: () => tone({ freq: 220, type: 'sawtooth', dur: 0.3, vol: 0.22, slide: 500 }),
    explosion: () => {
      noise({ dur: 0.4, vol: 0.4, freq: 250, slide: -180, filter: 'lowpass' });
      tone({ freq: 90, type: 'sine', dur: 0.35, vol: 0.35, slide: -50 });
    },
    chest: () => {
      tone({ freq: 392, dur: 0.08, vol: 0.16 });
      tone({ freq: 587, dur: 0.12, vol: 0.16, delay: 0.08 });
    },
    mimic: () => tone({ freq: 180, type: 'sawtooth', dur: 0.35, vol: 0.25, slide: -120 }),
    upgrade: () => [392, 523, 784].forEach((f, i) =>
      tone({ freq: f, dur: 0.12, vol: 0.2, delay: i * 0.09 })),
    buy: () => {
      tone({ freq: 988, dur: 0.06, vol: 0.16 });
      tone({ freq: 660, type: 'triangle', dur: 0.08, vol: 0.18, delay: 0.05 });
    },
    click: () => tone({ freq: 700, dur: 0.035, vol: 0.1 }),
    waveclear: () => [659, 880].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, vol: 0.18, delay: i * 0.12 })),
    bosshorn: () => {
      tone({ freq: 110, type: 'sawtooth', dur: 0.7, vol: 0.28 });
      tone({ freq: 111.2, type: 'sawtooth', dur: 0.7, vol: 0.18 }); // detune beat
      tone({ freq: 55, type: 'sine', dur: 0.7, vol: 0.25 });
    },
    gameover: () => [392, 311, 233].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.22, delay: i * 0.25 })),
    victory: () => [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.18, vol: 0.2, delay: i * 0.13 })),
  };

  function play(name: string): void {
    if (!ctx || muted || !SOUNDS[name]) return;
    resume();
    const now = performance.now();
    if (lastPlayed[name] && now - lastPlayed[name] < 50) return; // rate limit spam
    lastPlayed[name] = now;
    SOUNDS[name]();
  }

  // ── background music: dark 32-step chiptune loop in A minor ─────────────────
  const STEP = 0.16; // seconds per 16th-ish step (~94 bpm)
  const BASS = [
    110.00, 0, 0, 110.00, 0, 0, 110.00, 0, 87.31, 0, 0, 87.31, 0, 0, 87.31, 0,
    103.83, 0, 0, 103.83, 0, 0, 103.83, 0, 98.00, 0, 0, 98.00, 0, 0, 123.47, 0,
  ];
  const LEAD = [
    0, 0, 440.00, 0, 523.25, 0, 0, 440.00, 0, 349.23, 0, 0, 440.00, 0, 0, 0,
    0, 0, 415.30, 0, 523.25, 0, 0, 622.25, 0, 0, 587.33, 0, 493.88, 0, 0, 0,
  ];
  // boss variant: lower, driving bass + a more frantic lead
  const BASS_BOSS = [
    55.00, 0, 55.00, 0, 55.00, 0, 65.41, 0, 58.27, 0, 58.27, 0, 43.65, 0, 49.00, 0,
    55.00, 0, 55.00, 0, 55.00, 0, 65.41, 0, 73.42, 0, 69.30, 0, 65.41, 0, 61.74, 0,
  ];
  const LEAD_BOSS = [
    440.00, 0, 523.25, 0, 659.25, 0, 523.25, 0, 440.00, 0, 415.30, 0, 493.88, 0, 0, 0,
    587.33, 0, 523.25, 0, 659.25, 0, 783.99, 0, 698.46, 0, 659.25, 0, 587.33, 0, 0, 0,
  ];

  function scheduleStep(s: number, at: number): void {
    const bass = bossMode ? BASS_BOSS : BASS;
    const lead = bossMode ? LEAD_BOSS : LEAD;
    const b = bass[s % bass.length];
    if (b) tone({
      freq: b, type: bossMode ? 'sawtooth' : 'triangle',
      dur: STEP * 1.8, vol: bossMode ? 0.55 : 0.5, at, dest: musicGain ?? undefined,
    });
    const l = lead[s % lead.length];
    if (l) tone({
      freq: l, type: 'square', dur: STEP * 1.1,
      vol: bossMode ? 0.17 : 0.14, at, dest: musicGain ?? undefined,
    });
    // boss fights get a busier hi-hat (every other step vs every 4th)
    if (bossMode ? (s % 2 === 0) : (s % 4 === 2))
      noise({ dur: 0.03, vol: 0.05, freq: 6000, at, dest: musicGain ?? undefined });
  }

  function startMusic(): void {
    if (!ctx || musicOn) return;
    resume();
    musicOn = true;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(() => {
      while (ctx && nextNoteTime < ctx.currentTime + 0.25) {
        scheduleStep(step, nextNoteTime);
        nextNoteTime += STEP;
        step++;
      }
    }, 60);
  }

  function stopMusic(): void {
    musicOn = false;
    setBossMode(false);
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function setBossMode(on: boolean): void {
    bossMode = on;
    if (musicGain) musicGain.gain.value = on ? 0.28 : 0.2;
  }

  function applyMasterGain(): void {
    if (master) master.gain.value = muted ? 0 : vol;
  }

  function setMuted(m: boolean): void {
    muted = m;
    applyMasterGain();
  }

  function setVolume(v: number): void {
    vol = Math.max(0, Math.min(1, v));
    applyMasterGain();
  }

  return {
    init, play, startMusic, stopMusic, setMuted, setVolume, setBossMode,
    get muted() { return muted; },
  };
})();
