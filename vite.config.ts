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
        registerType: 'autoUpdate',
        manifest: {
          name: 'Farfartaxi',
          short_name: 'Farfartaxi',
          description: 'Family taxi booking app',
          theme_color: '#111827',
          background_color: '#111827',
          display: 'standalone',
          icons: [
            {
              src: '/favicon.svg',
              sizes: '192x192',
              type: 'image/svg+xml'
            }
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
