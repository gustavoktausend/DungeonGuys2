// events.ts — shared DOM event-detail predicates used across the ui/ and
// app/ layers. Both were duplicated verbatim in four files (main.ts,
// ui/screens.ts, ui/settings.ts, app/forge.ts) each carrying its own copy of
// the same rationale; Task 18 already answered this question the same way
// for a formula shared between sim/ and ui/ (export once, import everywhere)
// — this is that same fix applied here (Task 20 fix round 1).

/** ORIG/ui.js:169-171 — keyboard-activated clicks (Space/Enter on a focused
 * button) carry `detail === 0`; game-flow buttons only respond to real
 * mouse clicks, since Space also doubles as the attack key. */
export function mouseOnly(fn: () => void): (e: MouseEvent) => void {
  return e => { if (e.detail !== 0) fn(); };
}

/** ORIG/engine.js:36 — the hero-name field is the only `<input>` that should
 * ever swallow a keystroke; sliders (`type="range"`) must keep steering
 * WASD/arrow movement and the Escape/KeyM/1-2-3 shortcuts through. */
export function isTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return el?.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text';
}
