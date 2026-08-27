import { defineConfig } from 'vite';

// GitHub Pages serves the repo under /DungeonGuys2/
export default defineConfig({
  base: '/DungeonGuys2/',
  build: { target: 'es2022', outDir: 'dist' },
});
