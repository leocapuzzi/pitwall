import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend do PitWall. Em dev, /api é proxiado para o FastAPI (porta 8600).
// Em produção, `vite build` gera dist/ e o FastAPI serve esses arquivos.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8600' },
  },
  build: { outDir: 'dist' },
})
