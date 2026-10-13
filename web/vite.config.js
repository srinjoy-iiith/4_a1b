import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the web app runs on :5173 and forwards every /api request to the API server.
// That way the browser only talks to one address and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': process.env.VITE_API_TARGET || 'http://localhost:4000' },
  },
  test: { environment: 'jsdom', globals: true },
});
