// Local `npm run dev`: optional `.env.development.local` with `API_PROXY_TARGET=http://127.0.0.1:8081` if the API is not on 8080.
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget =
    env.API_PROXY_TARGET?.trim() || 'http://127.0.0.1:8080'

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
        manifest: {
          id: '/',
          name: 'Farfartaxi',
          short_name: 'Farfartaxi',
          description: 'Family taxi booking app',
          lang: 'sv',
          start_url: '/app',
          scope: '/',
          display: 'standalone',
          theme_color: '#1d4ed8',
          background_color: '#1d4ed8',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        }
      })
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    },
    // `npm run preview` does not use `server` by default; mirror proxy so `/api` works locally.
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    }
  }
})
