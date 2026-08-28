// events.ts — routes one tick's sim events to sound, UI and effects.
// Every event is handed to `fx` first (it ignores what it doesn't care
// about), then dispatched to whichever app-layer callback owns that event's
// type. sfx/announce/UI wiring are later tasks; main.ts currently passes
// no-op callbacks for them.
import type { SimEvent } from '../sim/types';

export function createEventSink(deps: {
  fx: { handle(e: SimEvent): void };
  playSfx(name: string): void;
  announce(text: string): void;
  hurtFlash(): void;
  unlock(cls: string): void;
  bossMusic(on: boolean): void;
  bossKill(): void;
  onPhase(from: string, to: string): void;
}) {
  return (events: SimEvent[]) => {
    for (const ev of events) {
      deps.fx.handle(ev);
      switch (ev.t) {
        case 'sfx': deps.playSfx(ev.name); break;
        case 'announce': deps.announce(ev.text); break;
        case 'hurtFlash': deps.hurtFlash(); break;
        case 'unlock': deps.unlock(ev.cls); break;
        case 'bossMusic': deps.bossMusic(ev.on); break;
        case 'bossKill': deps.bossKill(); break;
        case 'phase': deps.onPhase(ev.from, ev.to); break;
        default: break;
      }
    }
  };
}
