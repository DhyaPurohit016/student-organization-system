import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_TARGET lets you point the dev client at another API (default: the local server on 5000)
const API_TARGET = process.env.API_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.CLIENT_PORT) || 5173,
    // Forward API calls and uploaded files to the Express server during development
    proxy: {
      '/api': API_TARGET,
      '/uploads': API_TARGET,
    },
  },
});
