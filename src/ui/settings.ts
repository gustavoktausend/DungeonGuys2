// settings.ts — the start screen: class/mode/name/color selection, unlocks
// and records, sound/auto-aim/screen-shake settings, and the lifetime stats
// screen. Everything here is Save-backed (task-18-report.md's "left
// untouched for the persistence task" list) — none of it is driven by
// `world.phase`, because these screens have no phase of their own (the sim
// starts straight in 'playing').
//
// Ported from ORIG/ui.js:225-280 (unlocks/records/class-select/color wiring
// half — the color-picker mechanics themselves are :611-660, pulled in by
// the class-card click handler), :369-382 (auto-aim toggle), :405-438
// (sound/volume), :439-450 (screen shake), :453-461 (audio unlock gesture),
// :530-563 (stats screen), :565-579 (game mode), :598-660 (hero name +
// color picker), plus the global button-blur/click-sfx and `KeyM` mute
// shortcut from ORIG/ui.js:162-165 and ORIG/engine.js:41.
//
// This file only ever hands the rest of the app a snapshot (`getSelection`)
// or a repaint (`refreshClassRecord`, called after a run settles) — it never
// creates a World or starts a loop. That stays main.ts's job (task-20-brief:
// "isso é chamado por main.ts").
import { dom } from './dom';
import { showScreen, announce } from './screens';
import { Save } from '../app/save';
import { balance, Ledger } from '../app/ledger';
import { Sfx } from '../app/audio';
import { ANIMS, OUTFIT_COLORS, recolorPlayerSheet, playerSheet } from '../render/sprites';
import { CLASS_DEFS } from '@dg2/sim';
import { mouseOnly, isTextInput } from './events';
import type { ClassKey, GameMode } from '@dg2/sim';

// ORIG/ui.js:162-165 — buttons drop focus after click so Space (the attack
// key) never re-activates them, and every click gets a tiny confirmation blip.
document.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest?.('button');
  if (btn) { btn.blur(); Sfx.play('click'); }
});

// ─── Class unlocks & records (ORIG/ui.js:225-261) ────────────────────────────
// coprobo is unlocked by default for now
// (Fix round 1, task-20-report.md: a prior pass added a `coprobo` entry here
// arguing ORIG's `unlocked` default array — which really does omit coprobo —
// made this comment stale. That reasoning misses that `UNLOCKS` itself, not
// `Save.data.progress.unlocked`, is what `refreshClassCards`/`renderStats`
// gate on below: with no entry, `locked` is false and coprobo is playable
// from a fresh save, matching ORIG exactly. sim/run.ts:166 still emits
// `{ t: 'unlock', cls: 'coprobo' }` at wave 10 — redundant with no UNLOCKS
// entry, same as ORIG/engine.js:287, and kept for the same reason: fidelity,
// not effect. Whether coprobo *should* require wave 10 is a balance
// question for Task 21, not this port.)
const UNLOCKS: Partial<Record<ClassKey, string>> = {
  ninja: 'REACH WAVE 6',
  priestess: 'SLAY THE ZOMBIE KING',
  witch: 'REACH LEVEL 8',
};

function classCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.class-card'));
}

/** ORIG/ui.js:233-242. */
function refreshClassCards(): void {
  for (const card of classCards()) {
    const cls = card.dataset.class as ClassKey;
    const desc = card.querySelector('.class-desc') as HTMLElement;
    if (!desc.dataset.original) desc.dataset.original = desc.innerHTML;
    const locked = !!UNLOCKS[cls] && !Save.isUnlocked(cls);
    card.classList.toggle('locked', locked);
    desc.innerHTML = locked ? '🔒 ' + UNLOCKS[cls] : desc.dataset.original;
  }
}

/**
 * ORIG/ui.js:244-254. Exported so app/forge.ts's `finishRun` can repaint it
 * once a run ends — the start screen may already be behind it (the class
 * just played is almost always still `selectedClass`), and it must be fresh
 * the next time Quit brings the start screen back up regardless.
 */
export function refreshClassRecord(): void {
  const r = Save.classRecord(selectedClass);
  if (!r) { dom.classRecord.textContent = 'NO RUNS YET'; return; }
  const parts = ['BEST'];
  if (r.wave) parts.push(`WAVE ${r.wave}`);
  if (r.ewave) parts.push(`∞${r.ewave}`);
  parts.push(`LV ${r.level}`, `${r.score} PTS`);
  if (r.victories) parts.push(`${r.victories}🏆`);
  dom.classRecord.textContent = parts.join(' · ');
}

/**
 * ORIG/ui.js:256-261. The event sink's `unlock` dep (main.ts) — the sim only
 * ever emits `{ t: 'unlock', cls }`; this is what actually calls
 * `Save.unlock`, announces it and re-locks/unlocks the class cards.
 */
export function tryUnlock(cls: string): void {
  if (!Save.unlock(cls)) return;
  announce(cls.toUpperCase() + ' UNLOCKED!');
  Sfx.play('victory');
  refreshClassCards();
}

// ─── Color picker (ORIG/config.js:192-233, wired from ui.js:263-274,611-660) ─
function currentColor(cls: ClassKey): [number, number, number] {
  return Save.data.settings.colors[cls] || OUTFIT_COLORS[cls].light;
}

function setSliders([r, g, b]: [number, number, number]): void {
  dom.sliderR.value = String(r); dom.valR.textContent = String(r);
  dom.sliderG.value = String(g); dom.valG.textContent = String(g);
  dom.sliderB.value = String(b); dom.valB.textContent = String(b);
}

let previewFrame = 0;

/** ORIG/ui.js:625-633. */
function drawColorPreview(): void {
  const pctx = dom.colorPreview.getContext('2d');
  if (!pctx) return;
  pctx.imageSmoothingEnabled = false;
  pctx.clearRect(0, 0, dom.colorPreview.width, dom.colorPreview.height);
  const anim = ANIMS[CLASS_DEFS[selectedClass].anim];
  const [sx, sy, sw, sh] = anim.idle[previewFrame % anim.idle.length];
  const s = 1.7;
  pctx.drawImage(playerSheet, sx, sy, sw, sh,
    (dom.colorPreview.width - sw * s) / 2, (dom.colorPreview.height - sh * s) / 2, sw * s, sh * s);
}

[dom.sliderR, dom.sliderG, dom.sliderB].forEach(sl => sl.addEventListener('input', () => {
  const c: [number, number, number] = [Number(dom.sliderR.value), Number(dom.sliderG.value), Number(dom.sliderB.value)];
  dom.valR.textContent = String(c[0]); dom.valG.textContent = String(c[1]); dom.valB.textContent = String(c[2]);
  Save.data.settings.colors[selectedClass] = c;
  Save.persist();
  recolorPlayerSheet(selectedClass, c);
  drawColorPreview();
}));

// idle animation on the preview while the start screen is up (ORIG/ui.js:645-650).
setInterval(() => {
  if (dom.screens.start.classList.contains('active')) {
    previewFrame++;
    drawColorPreview();
  }
}, 250);

/**
 * Called once by main.ts after `await loadSprites()` resolves — the color
 * preview needs SHEET/COP_SHEET decoded, which ORIG guaranteed by retrying
 * on the images' own `load` events (ui.js:652-660); this port already
 * awaits that promise before touching gameplay, so a single paint here is
 * enough.
 */
export function initStartScreen(): void {
  const color = currentColor(selectedClass);
  setSliders(color);
  recolorPlayerSheet(selectedClass, color);
  drawColorPreview();
}

// ─── Class selection (ORIG/ui.js:263-278) ────────────────────────────────────
let selectedClass: ClassKey = 'mage'; // matches index.html's default `selected` card

for (const card of classCards()) {
  card.addEventListener('click', () => {
    if (card.classList.contains('locked')) return;
    for (const c of classCards()) c.classList.remove('selected');
    card.classList.add('selected');
    selectedClass = card.dataset.class as ClassKey;
    const color = currentColor(selectedClass);
    setSliders(color);
    recolorPlayerSheet(selectedClass, color);
    drawColorPreview();
    refreshClassRecord();
  });
}

// a previously selected class may be locked on a fresh save
if (UNLOCKS[selectedClass] && !Save.isUnlocked(selectedClass)) selectedClass = 'mage';
refreshClassCards();
refreshClassRecord();

// ─── Game mode (ORIG/ui.js:565-579) ──────────────────────────────────────────
let gameMode: GameMode = Save.data.settings.mode === 'endless' ? 'endless' : 'campaign';

document.querySelectorAll<HTMLButtonElement>('.mode-btn[data-mode]').forEach(btn => {
  btn.classList.toggle('selected', btn.dataset.mode === gameMode);
  btn.addEventListener('click', () => {
    gameMode = btn.dataset.mode as GameMode;
    Save.data.settings.mode = gameMode;
    Save.persist();
    document.querySelectorAll<HTMLElement>('.mode-btn').forEach(b =>
      b.classList.toggle('selected', b.dataset.mode === gameMode));
  });
});

// ─── Hero name (ORIG/ui.js:598-609) ──────────────────────────────────────────
dom.heroNameInput.value = Save.data.settings.name;
dom.heroNameInput.addEventListener('input', () => {
  Save.data.settings.name = dom.heroNameInput.value;
  Save.persist();
});

function heroName(): string {
  const n = dom.heroNameInput.value.trim().toUpperCase();
  return n || 'HERO';
}

/** The one thing main.ts needs to actually start (or restart) a run. */
export function getSelection(): { classKey: ClassKey; mode: GameMode; playerName: string } {
  return { classKey: selectedClass, mode: gameMode, playerName: heroName() };
}

// ─── Sound (ORIG/ui.js:405-422, ORIG/engine.js:41 for the KeyM shortcut) ─────
let soundMuted = Save.data.settings.mute;
Sfx.setMuted(soundMuted);

function refreshSoundToggle(): void {
  dom.soundToggle.textContent = (soundMuted ? '🔇' : '🔊') + ' SOUND: ' + (soundMuted ? 'OFF' : 'ON');
  dom.soundToggle.classList.toggle('on', !soundMuted);
}
function toggleSound(): void {
  soundMuted = !soundMuted;
  Save.data.settings.mute = soundMuted;
  Save.persist();
  Sfx.setMuted(soundMuted);
  refreshSoundToggle();
}
dom.soundToggle.addEventListener('click', toggleSound);
refreshSoundToggle();

addEventListener('keydown', e => {
  if (isTextInput(e.target)) return;
  if (e.code === 'KeyM') toggleSound();
});

// ─── Volume slider (ORIG/ui.js:424-437) ──────────────────────────────────────
const savedVolume = typeof Save.data.settings.volume === 'number' ? Save.data.settings.volume : 0.5;
Sfx.setVolume(savedVolume);
dom.sliderVolume.value = String(Math.round(savedVolume * 100));
dom.valVolume.textContent = dom.sliderVolume.value;
dom.sliderVolume.addEventListener('input', () => {
  const v = Number(dom.sliderVolume.value) / 100;
  dom.valVolume.textContent = dom.sliderVolume.value;
  Sfx.setVolume(v);
  Save.data.settings.volume = v;
  Save.persist();
});

// ─── Auto-aim toggle (ORIG/ui.js:369-383) ────────────────────────────────────
// Reads/writes `Save.data.settings.autoAim` directly rather than mirroring it
// in a local variable — app/input.ts reads that same live object each frame
// (task-20-brief.md debt #2), so there is only ever one source of truth.
function refreshAimToggle(): void {
  const on = Save.data.settings.autoAim;
  dom.autoAimToggle.textContent = '🎯 AUTO-AIM: ' + (on ? 'ON' : 'OFF');
  dom.autoAimToggle.classList.toggle('on', on);
}
dom.autoAimToggle.addEventListener('click', () => {
  Save.data.settings.autoAim = !Save.data.settings.autoAim;
  Save.persist();
  refreshAimToggle();
});
refreshAimToggle();

// ─── Screen-shake toggle (ORIG/ui.js:439-451) ────────────────────────────────
// Persists to Save only; main.ts reads `Save.data.settings.shake` once per
// run when it creates that run's `Fx` (`fx.setShakeEnabled`, render/fx.ts) —
// the toggle lives on the start screen, unreachable mid-run, exactly like
// the original (its own `screenShake` global is likewise only ever flipped
// before `startGame()`).
let screenShake = Save.data.settings.shake !== false;
function refreshShakeToggle(): void {
  dom.shakeToggle.textContent = '📳 SHAKE: ' + (screenShake ? 'ON' : 'OFF');
  dom.shakeToggle.classList.toggle('on', screenShake);
}
dom.shakeToggle.addEventListener('click', () => {
  screenShake = !screenShake;
  Save.data.settings.shake = screenShake;
  Save.persist();
  refreshShakeToggle();
});
refreshShakeToggle();

// browsers only allow audio after a user gesture (ORIG/ui.js:453-461).
const audioBoot = () => {
  Sfx.init();
  Sfx.setMuted(soundMuted);
  document.removeEventListener('pointerdown', audioBoot);
  document.removeEventListener('keydown', audioBoot);
};
document.addEventListener('pointerdown', audioBoot);
document.addEventListener('keydown', audioBoot);

// ─── Lifetime stats screen (ORIG/ui.js:530-563) ──────────────────────────────
function renderStats(): void {
  const p = Save.data.progress;
  const total = Object.keys(CLASS_DEFS).length;
  // a class is playable unless it has an unmet unlock requirement
  // (CopRobô has no UNLOCKS entry, so it counts even though it isn't in `unlocked`)
  const playable = Object.keys(CLASS_DEFS).filter(c => !UNLOCKS[c as ClassKey] || Save.isUnlocked(c)).length;
  const lifetime: [string, string | number][] = [
    ['TOTAL RUNS', p.runs || 0],
    ['VICTORIES', p.victories || 0],
    ['TOTAL KILLS', p.kills || 0],
    ['BOSSES SLAIN', p.bossKills || 0],
    ['GOLD EARNED', p.goldEarned || 0],
    ['SOUL GOLD', balance(Ledger.events)],
    ['CLASSES', playable + '/' + total],
  ];
  dom.statsLifetime.innerHTML = lifetime
    .map(([l, v]) => `<div class="stat-row"><span>${l}</span><span>${v}</span></div>`).join('');

  dom.statsClasses.innerHTML = Object.keys(CLASS_DEFS).map(cls => {
    const r = Save.classRecord(cls);
    const val = r
      ? [r.wave ? `W${r.wave}` : null, r.ewave ? `∞${r.ewave}` : null,
        `${r.score}pts`, r.victories ? `${r.victories}🏆` : null].filter(Boolean).join(' · ')
      : '—';
    return `<div class="stat-row"><span>${cls.toUpperCase()}</span><span>${val}</span></div>`;
  }).join('');
}

dom.btnStats.addEventListener('click', mouseOnly(() => {
  renderStats();
  showScreen('stats');
}));
dom.btnStatsClose.addEventListener('click', mouseOnly(() => showScreen('start')));
