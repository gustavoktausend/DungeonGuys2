// save-trust.test.ts — localStorage is a trust boundary.
//
// app/ledger.ts already treats it as one (isLedgerEvent on load, assertAmount
// on every mutation) because a corrupted balance loses or duplicates money.
// app/save.ts read the same storage without validating anything, and the two
// modules meet: `progress.forge` feeds app/forge.ts's price maths, which spends
// through the ledger. A string where a number belongs travels that whole path
// as NaN, and `NaN < cost` is false — every buy button unlocks.
//
// These tests drive the real module, not a copy of its guards: the storage is
// stubbed and `src/app/save.ts` is re-imported per case, because `load()` runs
// at module initialisation.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SaveData } from '../src/app/save';

const KEY = 'dungeonguys2_save_v1';

/** Minimal Storage stand-in — save.ts only ever calls getItem/setItem. */
function stubStorage(seed: string | null): void {
  const cell = { value: seed };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === KEY ? cell.value : null),
    setItem: (k: string, v: string) => { if (k === KEY) cell.value = v; },
  });
}

/** Fresh module instance, so `load()` re-runs against the stub above. */
async function loadSave(raw: unknown): Promise<{ data: SaveData }> {
  stubStorage(raw === undefined ? null : JSON.stringify(raw));
  vi.resetModules();
  const mod = await import('../src/app/save');
  return mod.Save;
}

describe('save — localStorage é fronteira de confiança', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('aceita um save honesto sem alterar nada', async () => {
    const Save = await loadSave({
      settings: { name: 'gustavo', volume: 0.3, mute: true },
      progress: { runs: 7, kills: 40, forge: { hp: 2, dmg: 1 } },
      records: { mage: { score: 900, wave: 12, level: 8, victories: 1 } },
    });
    expect(Save.data.settings.name).toBe('gustavo');
    expect(Save.data.settings.volume).toBe(0.3);
    expect(Save.data.progress.runs).toBe(7);
    expect(Save.data.progress.forge).toEqual({ hp: 2, dmg: 1 });
    expect(Save.data.records.mage?.score).toBe(900);
  });

  it('recusa uma string onde o forge devia ter número — a cadeia que gera NaN', async () => {
    // Esta é a falha traçada na revisão: forge['hp'] corrompido chega ao
    // forgeCost de app/forge.ts, vira NaN, e `NaN < cost` é false.
    const Save = await loadSave({
      progress: { forge: { hp: 'muito' as unknown as number } },
    });
    expect(Save.data.progress.forge).toEqual({});
    // A propriedade que realmente importa: nenhum valor do forge é NaN.
    for (const level of Object.values(Save.data.progress.forge)) {
      expect(Number.isFinite(level)).toBe(true);
    }
  });

  it('recusa NaN e Infinity explícitos vindos do storage', async () => {
    // JSON não carrega NaN literal, mas carrega o que os produz.
    const Save = await loadSave({
      progress: { runs: 'NaN' as unknown as number, kills: 1e999 },
    });
    expect(Save.data.progress.runs).toBe(0);   // default preservado
    expect(Number.isFinite(Save.data.progress.kills)).toBe(true);
  });

  it('recusa troca de tipo em settings, campo a campo', async () => {
    const Save = await loadSave({
      settings: { mute: 'sim' as unknown as boolean, volume: null, name: 42 as unknown as string, shake: false },
    });
    expect(Save.data.settings.mute).toBe(false);   // default
    expect(Save.data.settings.volume).toBe(0.5);   // default
    expect(Save.data.settings.name).toBe('');      // default
    expect(Save.data.settings.shake).toBe(false);  // este é honesto e passa
  });

  it('descarta um record de classe com número quebrado e mantém os sãos', async () => {
    const Save = await loadSave({
      records: {
        mage: { score: 900, wave: 12, level: 8, victories: 1 },
        archer: { score: 'alto' as unknown as number, wave: 3, level: 2, victories: 0 },
        warrior: { score: 100, wave: 2, level: 1, victories: 0, ewave: 'nao' as unknown as number },
      },
    });
    expect(Object.keys(Save.data.records)).toEqual(['mage']);
  });

  it('sobrevive a um array onde se esperava objeto, e a JSON corrompido', async () => {
    const asArray = await loadSave({ progress: [1, 2, 3], records: [], settings: 'nada' });
    expect(asArray.data.progress.runs).toBe(0);
    expect(asArray.data.records).toEqual({});

    stubStorage('{ isto nao e json');
    vi.resetModules();
    const broken = (await import('../src/app/save')).Save;
    expect(broken.data.progress.runs).toBe(0);
    expect(broken.data.settings.volume).toBe(0.5);
  });

  it('não ressuscita uma chave que defaults() não declara mais', async () => {
    // D-26: o contador soulGold foi descartado em favor do ledger. Um save
    // antigo não pode trazê-lo de volta como propriedade fantasma.
    const Save = await loadSave({ progress: { runs: 3, soulGold: 5000 } });
    expect(Save.data.progress.runs).toBe(3);
    expect('soulGold' in Save.data.progress).toBe(false);
  });
});
