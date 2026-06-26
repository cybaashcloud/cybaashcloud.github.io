import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // process.env is valid here (vite.config runs in Node.js, not the browser).
  // VITE_BASE_URL is injected by CI (deploy.yml / sync.yml) as: VITE_BASE_URL=/admin/
  // Locally (npm run dev) it falls back to './' which serves from the dev server root.
  // Do NOT use import.meta.env here — that is for client-side code only.
  base: process.env.VITE_BASE_URL ?? './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
    // Warn if any individual chunk exceeds 600 kB (App.jsx is large)
    chunkSizeWarningLimit: 600,
  },
}))
