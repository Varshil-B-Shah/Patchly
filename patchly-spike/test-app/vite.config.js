import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { patchlyPlugin } from '../patchly-vite-plugin.js'

export default defineConfig({
  plugins: [patchlyPlugin(), react()],
})
