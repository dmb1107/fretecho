import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the project site from /<repo>/, so we need a matching
// base path in production so absolute asset URLs resolve correctly. Locally
// (dev / preview) we serve from the root.
const base = process.env.GITHUB_PAGES === 'true' ? '/fretecho/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg'],
      manifest: {
        name: 'FretEcho',
        short_name: 'FretEcho',
        description: 'Call-and-response bass fretboard trainer.',
        theme_color: '#ff6b35',
        background_color: '#0b0b0b',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  server: { port: 5173, open: true },
});
