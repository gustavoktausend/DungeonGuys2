// hud.ts — the in-game HUD: HP/XP/stamina/special bars, score, gold, wave
// timer, combo indicator and the boss health bar.
// Ported from ORIG/items.js:295-352 (`updateHUD`).
//
// T1 inversion (see task-18-brief.md): the original called this from inside
// game logic — after buying something, after taking damage, after levelling.
// Here it is called once per frame from the render hook (main.ts), reading
// `world` and `world.players[localId]`. It makes no calls back into game
// logic and pushes nothing anywhere else; it only ever writes DOM text/style
// derived from the current world snapshot.
import { dom } from './dom';
import { CLASS_DEFS, maxStamina, WAVE_DURATION, comboMult, WAVES_TOTAL } from '@dg2/sim';
import type { World } from '@dg2/sim';

export function updateHud(world: World, localId: string): void {
  const p = world.players[localId];
  if (!p) return;

  // ORIG/items.js:296-301 — HP bar fill + color bands.
  const pct = Math.max(0, (p.hp / p.maxHp) * 100);
  dom.hpBar.style.width = pct + '%';
  dom.hpBar.style.background = pct > 50
    ? 'linear-gradient(to right, #27ae60, #2ecc71)'
    : pct > 25
    ? 'linear-gradient(to right, #e67e22, #f39c12)'
    : 'linear-gradient(to right, #c0392b, #e74c3c)';

  // ORIG/items.js:302-303 — score/gold.
  dom.scoreDisplay.textContent = String(world.score);
  dom.goldDisplay.textContent = String(p.gold);

  // ORIG/items.js:305-307 — special-attack cooldown bar.
  const spPct = Math.max(0, 1 - p.specialTimer / CLASS_DEFS[p.cls].specialCd) * 100;
  dom.spBar.style.width = spPct + '%';
  dom.spBar.classList.toggle('ready', spPct >= 100);

  // ORIG/items.js:309-311 — mirrors the special cooldown onto the mobile
  // button (radial sweep + glow). Harmless to keep updating even before
  // touch controls (Task 20) turn the touch UI on.
  dom.touchSpecial.style.setProperty('--cd', (100 - spPct).toFixed(0));
  dom.touchSpecial.classList.toggle('ready', spPct >= 100);

  // ORIG/items.js:313-315 — stamina bar.
  const staPct = (p.stamina / maxStamina(p)) * 100;
  dom.stBar.style.width = staPct + '%';
  dom.stBar.classList.toggle('recovering', !p.sprinting && staPct < 100);

  // ORIG/items.js:317-318 — name/level, XP bar.
  dom.hudName.textContent = p.name + ' · LV ' + p.level;
  dom.xpBar.style.width = (p.xp / p.xpNext) * 100 + '%';

  // ORIG/items.js:321-328 — kill-streak combo indicator (only once it
  // actually multiplies score, i.e. combo >= 5).
  const mult = comboMult(world.combo);
  if (world.combo >= 5 && world.comboTimer > 0) {
    dom.comboDisplay.classList.remove('hidden');
    dom.comboDisplay.textContent = '×' + mult.toFixed(2).replace(/\.?0+$/, '') + ' COMBO';
  } else {
    dom.comboDisplay.classList.add('hidden');
  }

  // ORIG/items.js:331-334 — wave countdown (boss waves don't expire).
  if (!world.waveActive) dom.waveTimer.textContent = '—';
  else if (world.waveHasBoss) dom.waveTimer.textContent = '☠';
  else dom.waveTimer.textContent = String(Math.max(0, Math.ceil((WAVE_DURATION - world.waveTimer) / 1000)));

  // ORIG/engine.js:288 — wave display. In the original this was pushed once
  // from startNextWave(); it is a pure function of world.wave/world.config.mode,
  // so ui/ reads it straight off the world every frame instead (flagged as
  // ui/'s job in run.ts's file header).
  dom.waveDisplay.textContent = world.config.mode === 'endless'
    ? `${world.wave} ∞`
    : `${world.wave}/${WAVES_TOTAL}`;

  // ORIG/items.js:337-347 — boss HP bar (top center), aggregated when
  // several bosses are alive at once.
  const bosses = world.enemies.filter(e => e.boss && !e.dead);
  if (bosses.length > 0) {
    dom.bossBar.classList.remove('hidden');
    dom.bossName.textContent = bosses.length === 1 ? bosses[0].boss! : bosses.length + ' BOSSES';
    const hp = bosses.reduce((s, b) => s + Math.max(0, b.hp), 0);
    const maxHp = bosses.reduce((s, b) => s + b.maxHp, 0);
    dom.bossHp.style.width = (hp / maxHp) * 100 + '%';
  } else {
    dom.bossBar.classList.add('hidden');
  }
}
