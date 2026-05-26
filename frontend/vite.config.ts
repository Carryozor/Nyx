import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/profiles': { target: 'http://localhost:3000', changeOrigin: true },
      '/brokers': { target: 'http://localhost:3000', changeOrigin: true },
      '/scans': { target: 'http://localhost:3000', changeOrigin: true },
      '/invitations': { target: 'http://localhost:3000', changeOrigin: true },
      '/opt-outs': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
