import { defineConfig } from 'vite';

// The game is served from the root of its own domain by Caddy's file_server,
// whose root points at the /srv/dg2/current symlink (D2-06). No repo subpath.
export default defineConfig({
  base: '/',
  build: { target: 'es2022', outDir: 'dist' },
});
