import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Respect PORT when a launcher assigns one (falls back to Vite's 5173)
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
})
