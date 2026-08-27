import { describe, it, expect } from 'vitest';
import { createCamera, updateCamera, worldToScreen, isVisible } from '../src/render/camera';
import { WORLD } from '../src/sim/constants';

describe('câmera', () => {
  it('centra no alvo quando ele está longe das bordas', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 1200, y: 800 }, 800, 600);
    expect(cam.x).toBe(1200 - 400);
    expect(cam.y).toBe(800 - 300);
  });

  it('não passa da borda esquerda/superior do mundo', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 10, y: 10 }, 800, 600);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it('não passa da borda direita/inferior do mundo', () => {
    const cam = createCamera();
    updateCamera(cam, { x: WORLD.w, y: WORLD.h }, 800, 600);
    expect(cam.x).toBe(WORLD.w - 800);
    expect(cam.y).toBe(WORLD.h - 600);
  });

  it('centra o mundo quando a viewport é maior que ele', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 100, y: 100 }, WORLD.w + 400, WORLD.h + 200);
    expect(cam.x).toBe(-200);
    expect(cam.y).toBe(-100);
  });

  it('converte mundo para tela subtraindo a câmera', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 1200, y: 800 }, 800, 600);
    expect(worldToScreen(cam, 1200, 800)).toEqual({ x: 400, y: 300 });
  });

  it('isVisible respeita o padding', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 1200, y: 800 }, 800, 600);
    expect(isVisible(cam, 1200, 800, 0)).toBe(true);
    expect(isVisible(cam, 0, 0, 0)).toBe(false);
    expect(isVisible(cam, cam.x - 30, 800, 64)).toBe(true);
  });
});
