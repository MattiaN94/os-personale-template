import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
      workbox: {
        // The application shell must always cross Cloudflare Access. Serving a
        // cached navigation would leave an expired session on a misleading UI.
        navigateFallback: undefined,
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The OCR runtime is several megabytes and is only needed when an image
        // is actually extracted; precaching it would inflate every install.
        globIgnores: ['**/index.html', '**/private-data/**', '**/api/**', '**/v1/**', '**/oauth/**', 'tesseract/**'],
        maximumFileSizeToCacheInBytes: 4_000_000,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'json-summary'] },
  },
})
