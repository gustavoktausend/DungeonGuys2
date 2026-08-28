// fx.ts — presentation-only state fed by sim events. Everything the original
// kept in global arrays (particles, floatTexts, meleeSwings) and a pair of
// screen-shake globals (shakeT/shakeMag) now lives here instead, aged by
// `update()` and painted by `drawSwings`/`drawParticles`/`drawFloatTexts`
// (three separate methods, not one `draw()` — see the comment above them).
// Nothing here is simulation state: it is fed exclusively through
// `handle(event)` and may freely use Math.random() and performance.now()
// (T3/T17).
//
// Ported from:
//  - particle/float-text physics: ORIG/entities.js:505-531 (spawnParticles,
//    updateParticles), ORIG/items.js:282-291 (addFloatText, updateFloatTexts)
//  - swing physics: ORIG/combat.js:146,259,299 (meleeSwings.push, life decay)
//  - screen shake: ORIG/ui.js:112,125-129 (addShake), ORIG/combat.js:4
//    (shakeT countdown), ORIG/render.js:7-10 (the fading translate)
//  - draw styling: ORIG/render.js:192-217 (swings), :357-371 (float texts),
//    :372-379 (particles)
import type { SimEvent } from '../sim/types';
import { worldToScreen, isVisible, type Camera } from './camera';

type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; decay: number; size: number; color: string;
};
type FloatText = { x: number; y: number; text: string; color: string; life: number };
type Swing = { x: number; y: number; angle: number; range: number; arc: number; life: number };

export function createFx() {
  const particles: Particle[] = [];
  const floatTexts: FloatText[] = [];
  const swings: Swing[] = [];
  let shakeT = 0, shakeMag = 0;
  let enabled = true; // mirrors the "screen shake" setting (ORIG/ui.js:125)

  return {
    setShakeEnabled(v: boolean) { enabled = v; },

    handle(ev: SimEvent) {
      switch (ev.t) {
        case 'particles':
          // ORIG/entities.js:505-519 (spawnParticles) — speed, decay and size
          // are each rolled once per particle; cosmetic randomness stays here.
          for (let i = 0; i < ev.count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 1 + Math.random() * 3;
            particles.push({
              x: ev.x, y: ev.y,
              vx: Math.cos(a) * s, vy: Math.sin(a) * s,
              life: 1,
              decay: 0.03 + Math.random() * 0.04,
              size: 2 + Math.random() * 3,
              color: ev.color,
            });
          }
          break;
        case 'float':
          floatTexts.push({ x: ev.x, y: ev.y, text: ev.text, color: ev.color, life: 1 });
          break;
        case 'swing':
          swings.push({ x: ev.x, y: ev.y, angle: ev.angle, range: ev.range, arc: ev.arc, life: 1 });
          break;
        case 'shake':
          if (!enabled) break;
          shakeMag = Math.max(shakeMag, ev.mag);
          shakeT = Math.max(shakeT, ev.dur);
          break;
        default:
          break; // sfx / announce / phase / unlock / hurtFlash / bossMusic are handled elsewhere
      }
    },

    update(dtMs: number) {
      // ORIG/combat.js:4 — shake countdown decrements by raw dt, no factor.
      if (shakeT > 0) { shakeT -= dtMs; if (shakeT <= 0) shakeMag = 0; }

      // ORIG/entities.js:522 — factor normalizes motion/decay to a ~16.67ms frame.
      const factor = dtMs / 16.67;
      for (const p of particles) {
        p.x += p.vx * factor;
        p.y += p.vy * factor;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= p.decay * factor;
      }
      // ORIG/items.js:287-289
      for (const f of floatTexts) {
        f.y -= dtMs * 0.035;
        f.life -= dtMs / 1100;
      }
      // ORIG/combat.js:299 (`s.life -= dt / 180`) — confirmed with the
      // controller (task-17-report.md, fix round 1) as the real source for
      // swing decay, in place of an invented flat constant; keeps the
      // ~180ms swing sweep duration faithful. `dtMs` is always DT_MS here
      // (fx.update(DT_MS) in main.ts), so this is exactly DT_MS / 180.
      for (const s of swings) s.life -= dtMs / 180;

      prune(particles); prune(floatTexts); prune(swings);
    },

    shakeOffset() {
      if (shakeMag <= 0) return { x: 0, y: 0 };
      // ORIG/render.js:8 — fades out over the shake's remaining life. The
      // divisor is a LITERAL 220, not the active shake's own `dur` — that's
      // how the original reads too (addShake's default dur happens to also
      // be 220, ORIG/ui.js:125, but render.js:8 never looks at the actual
      // dur that was passed to addShake). A shake cast with a longer dur
      // (e.g. mag:14/dur:500, ORIG-equivalent in enemies.ts:357) legitimately
      // overshoots `f > 1` for its first ~280ms. Preserve this exactly —
      // do NOT "fix" it into `shakeT / dur`, that would change the feel of
      // every shake in the game.
      const f = shakeT / 220;
      return { x: (Math.random() - 0.5) * shakeMag * f, y: (Math.random() - 0.5) * shakeMag * f };
    },

    // Three separate draw methods, not one: the original interleaves swings,
    // particles and float texts with other entities at three different
    // points in the draw order (render.js:19, :24, :26) — drawBossTelegraphs/
    // drawObstacles/drawEnemies sit between swings and particles, drawPlayer
    // and drawFog sit between particles and float texts. render/index.ts
    // calls these three at those exact positions instead of one combined
    // `draw()` call, so the z-order matches the original exactly.

    /** Swings — ORIG/render.js:192-215. */
    drawSwings(ctx: CanvasRenderingContext2D, cam: Camera) {
      for (const s of swings) {
        if (!isVisible(cam, s.x, s.y, 96)) continue;
        const p = worldToScreen(cam, s.x, s.y);
        const progress = 1 - s.life; // 0 -> 1
        const start = s.angle - s.arc / 2;
        const end = start + s.arc * Math.min(1, progress * 2.2);

        ctx.save();
        ctx.globalAlpha = s.life * 0.85;
        ctx.strokeStyle = '#ffe066';
        ctx.shadowColor = '#ff8c00';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.range - 6, start, end);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.range - 12, start, end);
        ctx.stroke();
        ctx.restore();
      }
    },

    /** Particles — ORIG/render.js:372-379. */
    drawParticles(ctx: CanvasRenderingContext2D, cam: Camera) {
      for (const q of particles) {
        if (!isVisible(cam, q.x, q.y, 32)) continue;
        const p = worldToScreen(cam, q.x, q.y);
        ctx.globalAlpha = q.life;
        ctx.fillStyle = q.color;
        ctx.fillRect(p.x - q.size / 2, p.y - q.size / 2, q.size, q.size);
      }
      ctx.globalAlpha = 1;
    },

    /** Float texts — ORIG/render.js:357-369. */
    drawFloatTexts(ctx: CanvasRenderingContext2D, cam: Camera) {
      ctx.font = 'bold 15px "MedievalSharp", serif';
      ctx.textAlign = 'center';
      for (const f of floatTexts) {
        if (!isVisible(cam, f.x, f.y, 48)) continue;
        const p = worldToScreen(cam, f.x, f.y);
        ctx.globalAlpha = Math.min(1, f.life * 1.5);
        ctx.fillStyle = '#000';
        ctx.fillText(f.text, p.x + 1, p.y + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    },
  };
}

export type Fx = ReturnType<typeof createFx>;

function prune<T extends { life: number }>(arr: T[]): void {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life <= 0) arr.splice(i, 1);
}
