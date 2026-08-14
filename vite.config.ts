import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // No precaching service worker behind Cloudflare Access. Workbox installs
      // by fetching every precached asset; when the Access session is absent or
      // expired those fetches answer 302 to a cross-origin login page, the
      // install fails with "Failed to fetch", and a service worker script cannot
      // follow a redirect at all. The cache bought nothing here either: with
      // navigateFallback disabled and no runtime caching there was never offline
      // navigation to gain. selfDestroying keeps serving /sw.js so browsers that
      // already registered the old worker fetch this one and unregister.
      selfDestroying: true,
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Personal OS',
        short_name: 'Personal OS',
        description: 'Dashboard privata per salute, patrimonio, documenti e scadenze.',
        theme_color: '#102a43',
        background_color: '#f4f7f9',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      // Nothing is precached, so the application shell always crosses Cloudflare
      // Access and an expired session can never hide behind a cached response.
      workbox: { globPatterns: [], navigateFallback: undefined, runtimeCaching: [] },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'json-summary'] },
  },
})
