import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  // Environment-aware port: 1420 for Tauri (set via TAURI_ENV_FAMILY), 3000 for browser
  server: {
    port: process.env.TAURI_ENV_FAMILY ? 1420 : 3000,
    strictPort: process.env.TAURI_ENV_FAMILY ? true : false,  // Strict for Tauri, flexible for browser
  },
})
