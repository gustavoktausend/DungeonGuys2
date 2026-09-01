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
// Task 20 adds the Save-backed fields task-18 deliberately left unresolved
// (final-best, final-forge, new-record, victory-forge, new-record-victory)
// plus everything the start/forge/stats screens need — those screens have no
// `Phase` of their own (task-18-report.md), so app/forge.ts and ui/settings.ts
// drive them directly instead of through `syncScreens`.
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

  // Shop screen (Task 19, ORIG/items.js:65-128) — same "resolve once" rule
  // as everything else in this object.
  shopGold: document.getElementById('shop-gold')!,
  shopSlots: document.getElementById('shop-slots')!,
  shopEquip: document.getElementById('shop-equip')!,
  shopItems: document.getElementById('shop-items')!,
  shopStats: document.getElementById('shop-stats')!,
  priceHeal: document.getElementById('price-heal')!,
  priceReroll: document.getElementById('price-reroll')!,
  btnShopHeal: document.getElementById('btn-shop-heal')! as HTMLButtonElement,
  btnShopReroll: document.getElementById('btn-shop-reroll')! as HTMLButtonElement,
  btnNextWave: document.getElementById('btn-next-wave')!,

  // Game-over / victory Save-backed fields (Task 20 — see task-18-report.md).
  finalBest: document.getElementById('final-best')!,
  finalForge: document.getElementById('final-forge')!,
  newRecord: document.getElementById('new-record')!,
  victoryForge: document.getElementById('victory-forge')!,
  newRecordVictory: document.getElementById('new-record-victory')!,

  // Pause screen buttons (ORIG/ui.js:173-176) — Escape-only under task-18;
  // Task 20 wires the clicks too.
  btnResume: document.getElementById('btn-resume')!,
  btnPauseRestart: document.getElementById('btn-pause-restart')!,
  btnQuit: document.getElementById('btn-quit')!,
  btnStart: document.getElementById('btn-start')!,
  // The PWA update offer (D2-09): a service worker stuck in `waiting` has no
  // way to announce itself, so main.ts offers this button instead.
  btnUpdate: document.getElementById('btn-update')!,
  btnRestart: document.getElementById('btn-restart')!,
  btnVictoryRestart: document.getElementById('btn-victory-restart')!,

  // Share (ORIG/ui.js:184-187, :189-224).
  btnShareWa: document.getElementById('btn-share-wa')!,
  btnShareTg: document.getElementById('btn-share-tg')!,
  btnShareWaVictory: document.getElementById('btn-share-wa-victory')!,
  btnShareTgVictory: document.getElementById('btn-share-tg-victory')!,

  // Forge screen (ORIG/ui.js:463-528) — app/forge.ts owns this screen's DOM.
  forgeGold: document.getElementById('forge-gold')!,
  soulGold: document.getElementById('soul-gold')!,
  forgeList: document.getElementById('forge-list')!,
  btnForge: document.getElementById('btn-forge')!,
  btnForgeClose: document.getElementById('btn-forge-close')!,

  // Stats screen (ORIG/ui.js:530-563).
  statsLifetime: document.getElementById('stats-lifetime')!,
  statsClasses: document.getElementById('stats-classes')!,
  btnStats: document.getElementById('btn-stats')!,
  btnStatsClose: document.getElementById('btn-stats-close')!,

  // Start screen: class select / mode / name / color (ORIG/ui.js:225-280,
  // :565-579, :598-660).
  classRecord: document.getElementById('class-record')!,
  heroNameInput: document.getElementById('hero-name')! as HTMLInputElement,
  colorPreview: document.getElementById('color-preview')! as HTMLCanvasElement,
  sliderR: document.getElementById('slider-r')! as HTMLInputElement,
  sliderG: document.getElementById('slider-g')! as HTMLInputElement,
  sliderB: document.getElementById('slider-b')! as HTMLInputElement,
  valR: document.getElementById('val-r')!,
  valG: document.getElementById('val-g')!,
  valB: document.getElementById('val-b')!,

  // Sound / auto-aim / shake / volume (ORIG/ui.js:369-450).
  autoAimToggle: document.getElementById('auto-aim-toggle')!,
  soundToggle: document.getElementById('sound-toggle')!,
  shakeToggle: document.getElementById('shake-toggle')!,
  sliderVolume: document.getElementById('slider-volume')! as HTMLInputElement,
  valVolume: document.getElementById('val-volume')!,

  // Touch (ORIG/ui.js:281-368).
  instDesktop: document.getElementById('inst-desktop')!,
  instTouch: document.getElementById('inst-touch')!,
  touchUi: document.getElementById('touch-ui')!,
  joyBase: document.getElementById('joystick-base')!,
  joyKnob: document.getElementById('joystick-knob')!,
  // `touchSpecial` (above, task-18) is the same #btn-touch-special element —
  // reused here rather than re-resolved under a second name.
  btnTouchSprint: document.getElementById('btn-touch-sprint')!,
  btnTouchPause: document.getElementById('btn-touch-pause')!,
};
