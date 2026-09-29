import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The public path where the app is served. Behind nginx at
// example.com/estructuradaabon/ we ship the build with BASE=/estructuradaabon/
// so every asset URL is prefixed. Locally we serve from the root (`/`).
const BASE = process.env.APP_BASE ?? '/'

export default defineConfig({
  base: BASE,
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
})
