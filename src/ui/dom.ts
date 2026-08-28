// dom.ts — every DOM element hud.ts and screens.ts touch, resolved once.
// Ported from ORIG/ui.js:138-159 (the `screens` object and the loose HUD/
// screen constants), trading the loose top-level `const`s for one exported
// object.
//
// The original also reached for a handful of elements ad hoc, inline inside
// updateHUD (ORIG/items.js:309,317-318,322,331,337-346) instead of resolving
// them up front: the touch special-attack button, hud-name, xp-bar,
// combo-display, wave-timer, boss-bar/boss-name/boss-hp. Those are resolved
// here too, for the same reason as everything else in this object — once,
// not every frame.
//
// Elements this task never writes to (final-best, final-forge, new-record,
// victory-forge, new-record-victory — all Save-backed, see task-18-report.md)
// are intentionally NOT resolved here: nothing in ui/ owns them yet.
//
// Every id is resolved with `document.getElementById(id)!` — if an id is
// missing from index.html, that surfaces immediately as a runtime error the
// first time the element is touched, not a silently-ignored null.
export const dom = {
  screens: {
    start: document.getElementById('start-screen')!,
    pause: document.getElementById('pause-screen')!,
    shop: document.getElementById('shop-screen')!,
    gameover: document.getElementById('gameover-screen')!,
    victory: document.getElementById('victory-screen')!,
    levelup: document.getElementById('levelup-screen')!,
    forge: document.getElementById('forge-screen')!,
    stats: document.getElementById('stats-screen')!,
  },

  hud: document.getElementById('hud')!,
  hpBar: document.getElementById('hp-bar')!,
  spBar: document.getElementById('sp-bar')!,
  stBar: document.getElementById('st-bar')!,
  waveDisplay: document.getElementById('wave-display')!,
  scoreDisplay: document.getElementById('score-display')!,
  goldDisplay: document.getElementById('gold-display')!,
  waveAnnounce: document.getElementById('wave-announce')!,
  finalScore: document.getElementById('final-score')!,
  finalWave: document.getElementById('final-wave')!,
  finalGold: document.getElementById('final-gold')!,

  // Resolved once instead of via inline document.getElementById (see file header).
  touchSpecial: document.getElementById('btn-touch-special')!,
  hudName: document.getElementById('hud-name')!,
  xpBar: document.getElementById('xp-bar')!,
  comboDisplay: document.getElementById('combo-display')!,
  waveTimer: document.getElementById('wave-timer')!,
  bossBar: document.getElementById('boss-bar')!,
  bossName: document.getElementById('boss-name')!,
  bossHp: document.getElementById('boss-hp')!,
  hurtFlash: document.getElementById('hurt-flash')!,
  levelupChoices: document.getElementById('levelup-choices')!,

  // Game-over / victory fields this task populates from `world`
  // (ORIG/entities.js:570-588, ORIG/engine.js:230-248 — world-backed part only).
  victoryScore: document.getElementById('victory-score')!,
  victoryGold: document.getElementById('victory-gold')!,
};
