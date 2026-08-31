// sprites.ts — spritesheet atlas and the outfit-color palette swap.
// Ported from ORIG/config.js:1-95 (atlas) and ORIG/config.js:172-248 (recolor).
//
// Two changes from the original:
//  - image paths go through import.meta.env.BASE_URL, because Vite serves
//    this app under a base path in production (T-render);
//  - loadSprites() returns a Promise that resolves once SHEET and COP_SHEET
//    are done loading, instead of the original's per-frame `.complete` poll.
import { CLASS_DEFS } from '@dg2/sim';
import type { ClassKey } from '@dg2/sim';

const BASE = import.meta.env.BASE_URL;

// ─── Spritesheet (0x72 DungeonTilesetII v1.7, CC0) ────────────────────────────
export const SHEET = new Image();
SHEET.src = `${BASE}assets/dungeon_tileset.png`;

/** [sx, sy, sw, sh] on the source sheet. */
export type Frame = readonly [number, number, number, number];

// frame list: [sx, sy, sw, sh] — stride lets frames sit on a wider grid
export function frames(x: number, y: number, w: number, h: number, n: number, stride = w): Frame[] {
  const out: Frame[] = [];
  for (let i = 0; i < n; i++) out.push([x + i * stride, y, w, h]);
  return out;
}

export type AnimSet = { idle: Frame[]; run: Frame[]; sheet?: HTMLImageElement };

export const ANIMS: Record<string, AnimSet> = {
  wizzard:    { idle: frames(128, 164, 16, 28, 4), run: frames(192, 164, 16, 28, 4) },
  elf:        { idle: frames(128,  36, 16, 28, 4), run: frames(192,  36, 16, 28, 4) },
  knight:     { idle: frames(128, 100, 16, 28, 4), run: frames(192, 100, 16, 28, 4) },
  wizzard_f:  { idle: frames(128, 132, 16, 28, 4), run: frames(192, 132, 16, 28, 4) },
  masked_orc: { idle: frames(368, 153, 16, 23, 4), run: frames(432, 153, 16, 23, 4) },
  angel:      { idle: frames(368, 304, 16, 16, 4), run: frames(432, 304, 16, 16, 4) },
  skelet:    { idle: frames(368,  88, 16, 16, 4), run: frames(432,  88, 16, 16, 4) },
  goblin:    { idle: frames(368,  40, 16, 16, 4), run: frames(432,  40, 16, 16, 4) },
  chort:     { idle: frames(368, 273, 16, 23, 4), run: frames(432, 273, 16, 23, 4) },
  big_demon: { idle: frames( 16, 428, 32, 36, 4), run: frames(144, 428, 32, 36, 4) },
  big_zombie:{ idle: frames( 16, 332, 32, 36, 4), run: frames(144, 332, 32, 36, 4) },
  ogre:      { idle: frames( 16, 380, 32, 36, 4), run: frames(144, 380, 32, 36, 4) },
  necromancer: { idle: frames(368, 225, 16, 23, 4), run: frames(368, 225, 16, 23, 4) },
  swampy:      { idle: frames(432, 112, 16, 16, 4), run: frames(432, 112, 16, 16, 4) },
};
// mimic only has a 3-frame "open" anim; ping-pong it to fit the 4-frame clock
const MIMIC_F = frames(304, 432, 16, 16, 3);
ANIMS.mimic = { idle: [MIMIC_F[0], MIMIC_F[1], MIMIC_F[2], MIMIC_F[1]],
                run:  [MIMIC_F[0], MIMIC_F[1], MIMIC_F[2], MIMIC_F[1]] };

export const FLASK_RED: Frame    = [288, 352, 16, 16];
export const CHEST_FRAMES        = frames(304, 416, 16, 16, 3); // closed → opening → open
export const CHEST_EMPTY: Frame  = [336, 400, 16, 16];          // looted chest left behind

// second atlas: KingBell's Pixel Sprite Mixer characters (16x24 frames,
// rows follow assets/100_Anims_Order_List.txt — row1 idle, row2 run)
export const COP_SHEET = new Image();
COP_SHEET.src = `${BASE}assets/copRobo.png`;

ANIMS.coprobo = {
  idle: frames(0, 0,  16, 24, 4),
  run:  frames(0, 24, 16, 24, 4),
  sheet: COP_SHEET,
};

export const COIN_FRAMES = frames(289, 385, 6, 7, 4, 8);

export const WEAPON_SPRITES: Record<string, Frame> = {
  staff:       [324, 129,  8, 30],
  staff_green: [340, 129,  8, 30],
  bow:         [289, 195, 14, 26],
  bow_2:       [305, 195, 14, 26],
  sword_rusty: [307,  10, 10, 21],
  sword_knight:[339,  98, 10, 29],
  sword_anime: [322,  65, 12, 30],
  knife:       [293,  10,  6, 13],
  machete:     [294, 105,  5, 22],
  katana:      [293,  66,  6, 29],
  mace:        [339,  39, 10, 24],
  hammer:      [307,  39, 10, 24],
  golden_sword:[291, 137, 10, 22],
  arrow:       [324, 202,  7, 21],
};

export const FLOOR_TILES: Frame[] = [
  [16, 64, 16, 16], [32, 64, 16, 16], [48, 64, 16, 16], [16, 80, 16, 16],
  [32, 80, 16, 16], [48, 80, 16, 16], [16, 96, 16, 16], [32, 96, 16, 16],
];
export const WALL_TILES: Record<string, Frame> = {
  mid:       [32, 16, 16, 16],
  left:      [16, 16, 16, 16],
  right:     [48, 16, 16, 16],
  top:       [32,  0, 16, 16],
  top_left:  [16,  0, 16, 16],
  top_right: [48,  0, 16, 16],
  edge_left:     [32, 152, 16, 16],
  edge_right:    [48, 152, 16, 16],
  edge_bot_left: [32, 168, 16, 16],
  edge_bot_right:[48, 168, 16, 16],
  banner_red:  [16, 32, 16, 16],
  banner_blue: [32, 32, 16, 16],
  hole:    [48, 32, 16, 16],
};

// ─── Arena obstacles & spike traps ────────────────────────────────────────────
export const OBSTACLE_SPRITES: Record<'column' | 'crate', Frame> = { column: [80, 80, 16, 48], crate: [288, 408, 16, 24] };
export const SPIKE_FRAMES = frames(16, 192, 16, 16, 4);

// ─── Palette swap (classic outfit recolor via RGB sliders) ───────────────────
// each class outfit is two exact palette colors: light + its shadow
export const OUTFIT_COLORS: Record<ClassKey, { light: [number, number, number]; dark: [number, number, number] }> = {
  mage:      { light: [ 86, 152, 204], dark: [ 89,  86, 189] },
  archer:    { light: [ 75, 167,  71], dark: [ 61, 115,  79] },
  warrior:   { light: [114, 214, 206], dark: [ 65, 112, 137] },
  ninja:     { light: [ 61, 115,  79], dark: [ 49,  65,  82] },
  priestess: { light: [202, 230, 245], dark: [ 86, 152, 204] },
  witch:     { light: [ 86, 152, 204], dark: [ 89,  86, 189] },
  coprobo:   { light: [145, 141, 141], dark: [ 72,  70,  70] },
};
// strip containing idle+run(+hit) frames of each class on the sheet
export const CLASS_REGION: Record<ClassKey, Frame> = {
  mage:      [128, 164, 144, 28],
  archer:    [128,  36, 144, 28],
  warrior:   [128, 100, 144, 28],
  ninja:     [368, 153, 128, 23],
  priestess: [368, 304, 128, 16],
  witch:     [128, 132, 144, 28],
  coprobo:   [0, 0, 176, 48], // idle+run rows of its own sheet
};

/** Recolored copy used to draw the player. Defaults to the sheet's own colors. */
export let playerSheet: HTMLImageElement | HTMLCanvasElement = SHEET;

export const lum = ([r, g, b]: readonly [number, number, number]): number => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Rebuilds `playerSheet`, swapping the class's baked-in outfit pair for
 * `rgb`. The original read the chosen color from `Save.data.settings.colors`
 * (ORIG/config.js:193); render/ must not depend on app/'s Save, so the
 * caller passes the color in directly.
 */
export function recolorPlayerSheet(cls: ClassKey, rgb: [number, number, number]): void {
  // each class recolors a copy of ITS OWN atlas (0x72 sheet or a mixer sheet)
  const srcSheet = ANIMS[CLASS_DEFS[cls].anim].sheet ?? SHEET;
  if (!srcSheet.complete || srcSheet.naturalWidth === 0) { playerSheet = srcSheet; return; }
  try {
    const oc = document.createElement('canvas');
    oc.width  = srcSheet.naturalWidth;
    oc.height = srcSheet.naturalHeight;
    const c = oc.getContext('2d');
    if (!c) { playerSheet = srcSheet; return; }
    c.drawImage(srcSheet, 0, 0);

    const { light, dark } = OUTFIT_COLORS[cls];
    const target = rgb;
    const shade  = lum(dark) / lum(light); // keep the original shading ratio
    const targetDark = target.map(v => Math.round(v * shade)) as [number, number, number];

    const [rx, ry, rw, rh] = CLASS_REGION[cls];
    const img = c.getImageData(rx, ry, rw, rh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === light[0] && d[i + 1] === light[1] && d[i + 2] === light[2]) {
        d[i] = target[0]; d[i + 1] = target[1]; d[i + 2] = target[2];
      } else if (d[i] === dark[0] && d[i + 1] === dark[1] && d[i + 2] === dark[2]) {
        d[i] = targetDark[0]; d[i + 1] = targetDark[1]; d[i + 2] = targetDark[2];
      }
    }
    c.putImageData(img, rx, ry);
    playerSheet = oc;
  } catch {
    playerSheet = srcSheet; // canvas tainted (file:// double-click) — keep defaults
  }
}

/** Resolves once SHEET and COP_SHEET have finished loading (or failed to). */
export function loadSprites(): Promise<void> {
  const wait = (img: HTMLImageElement) =>
    img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); });
  return Promise.all([wait(SHEET), wait(COP_SHEET)]).then(() => undefined);
}
