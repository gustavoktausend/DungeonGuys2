// touch.ts — the mobile joystick + action buttons.
// Ported from ORIG/ui.js:281-289 (coarse-pointer instructions swap +
// upfront touch-UI enable, ORIG/engine.js:24) and :291-368 (joystick +
// action buttons).
//
// The only thing this hands back to app/input.ts is the analog `vec`/
// `active` pair (task-20-brief.md, Step 5: "o joystick alimenta
// app/input.ts com o vetor analógico"). The action buttons (special/sprint/
// pause) instead dispatch the same synthetic keyboard events the keyboard
// itself would fire — `KeyE` for special, `ShiftLeft` down/up for sprint,
// `Escape` for pause — so input.ts's existing `keydown`/`keyup` listeners
// and ui/screens.ts's `createPauseControl` pick them up with zero new
// coupling, exactly the way ORIG's touch buttons called `castSpecial()` /
// set `keys['ShiftLeft']` / called `pauseGame()`/`resumeGame()` directly.
import { dom } from './dom';

export type TouchState = {
  vec: { x: number; y: number }; // analog movement vector, magnitude 0..1
  active: boolean;               // becomes true on the first touch
};

const JOY_RADIUS = 58;

function fireKey(type: 'keydown' | 'keyup', code: string): void {
  dispatchEvent(new KeyboardEvent(type, { code }));
}

export function setupTouch(canvas: HTMLCanvasElement): TouchState {
  const state: TouchState = { vec: { x: 0, y: 0 }, active: false };
  let joyTouchId: number | null = null;
  let joyOrigin = { x: 0, y: 0 };

  function enableTouchUi(): void {
    if (state.active) return;
    state.active = true;
    dom.touchUi.classList.add('enabled');
  }

  // coarse pointer (phone/tablet): swap the instructions upfront and enable
  // the touch UI without waiting for a first touch (ORIG/engine.js:24).
  if (matchMedia('(pointer: coarse)').matches) {
    dom.instDesktop.classList.add('hidden-inst');
    dom.instTouch.classList.remove('hidden-inst');
    enableTouchUi();
  }

  canvas.addEventListener('touchstart', e => {
    enableTouchUi();
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (joyTouchId === null && t.clientX < window.innerWidth * 0.55) {
        joyTouchId = t.identifier;
        joyOrigin = { x: t.clientX, y: t.clientY };
        dom.joyBase.style.left = t.clientX + 'px';
        dom.joyBase.style.top = t.clientY + 'px';
        dom.joyBase.style.display = 'block';
        dom.joyKnob.style.transform = 'translate(-50%, -50%)';
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== joyTouchId) continue;
      let dx = t.clientX - joyOrigin.x;
      let dy = t.clientY - joyOrigin.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > JOY_RADIUS) { dx = dx / len * JOY_RADIUS; dy = dy / len * JOY_RADIUS; }
      state.vec = { x: dx / JOY_RADIUS, y: dy / JOY_RADIUS };
      dom.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }, { passive: false });

  const endTouch = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== joyTouchId) continue;
      joyTouchId = null;
      state.vec = { x: 0, y: 0 };
      dom.joyBase.style.display = 'none';
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  // action buttons — synthetic keyboard events, see file header.
  // `dom.touchSpecial` is the same #btn-touch-special ui/hud.ts already
  // resolved (task-18) for the radial-cooldown CSS var; reused here for the
  // tap listener rather than re-resolving it under a second name.
  dom.touchSpecial.addEventListener('touchstart', e => {
    e.preventDefault();
    fireKey('keydown', 'KeyE');
  }, { passive: false });

  dom.btnTouchSprint.addEventListener('touchstart', e => {
    e.preventDefault();
    fireKey('keydown', 'ShiftLeft');
    dom.btnTouchSprint.classList.add('held');
  }, { passive: false });
  const sprintEnd = () => {
    fireKey('keyup', 'ShiftLeft');
    dom.btnTouchSprint.classList.remove('held');
  };
  dom.btnTouchSprint.addEventListener('touchend', sprintEnd);
  dom.btnTouchSprint.addEventListener('touchcancel', sprintEnd);

  dom.btnTouchPause.addEventListener('touchstart', e => {
    e.preventDefault();
    fireKey('keydown', 'Escape');
  }, { passive: false });

  return state;
}
