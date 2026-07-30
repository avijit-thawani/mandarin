import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward Netlify Function calls to a locally running `netlify functions:serve`
    // (port 9999). Without this, functions are only reachable through `netlify dev`
    // on port 8888 — a different origin, so the Supabase session and cached vocab
    // from port 5173 don't apply. Harmless when nothing is listening on 9999.
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
    },
  },
})
