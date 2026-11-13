import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages (/basketball-board/)
// and when served from any other path.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
});
