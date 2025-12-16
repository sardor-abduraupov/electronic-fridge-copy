import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // When deploying to GitHub Pages for a repo site, set the base to
  // '/<repo-name>/' so built assets use the correct path. Adjust the
  // string below if your repo name is different.
  base: '/',
  plugins: [react()],
  server: {
    host: true, // Needed for network access (e.g. 192.168.x.x)
    port: 3001,
    // Proxy requests starting with /jsonblob to https://jsonblob.com to avoid CORS in dev
    proxy: {
      '/jsonblob': {
        target: 'https://jsonblob.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/jsonblob/, '/api/jsonBlob')
      }
    }
  },
});