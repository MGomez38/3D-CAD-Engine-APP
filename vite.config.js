import { defineConfig } from 'vite';

// Relative base so the build works at any URL — locally, on GitHub Pages
// (https://<user>.github.io/<repo>/), or any static host.
export default defineConfig({
  base: './',
});
