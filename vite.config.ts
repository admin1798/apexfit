import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import coachHandler from './api/coach.ts';

function apexfitLocalApiPlugin(): Plugin {
  const attachMiddleware = (middlewares: {
    use: (
      route: string,
      fn: (
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse,
        next: () => void
      ) => void
    ) => unknown;
  }) => {
    middlewares.use('/api/coach', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      void coachHandler(req, res);
    });
  };

  return {
    name: 'apexfit-local-api',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [
    apexfitLocalApiPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'ApexFit — Personal Fitness System',
        short_name: 'ApexFit',
        description:
          'Offline-first personal fitness operating system for workouts, nutrition, progress, and AI coaching.',
        theme_color: '#101211',
        background_color: '#101211',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'charts';
          if (id.includes('node_modules/dexie')) return 'db';
          if (id.includes('node_modules/react')) return 'react';
        },
      },
    },
  },
});
