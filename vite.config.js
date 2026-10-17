import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { songFolder } from './tools/song-folder.js';

export default defineConfig({
  // GitHub Pages serves the app from /<repo-name>/.
  base: '/autotune-app/',
  // Self-signed HTTPS so getUserMedia works when testing on a phone over the LAN,
  // and the karaoke song folder on this computer (see tools/song-folder.js).
  plugins: [basicSsl(), songFolder()],
  server: { host: true },
  preview: { host: true },
  // The AudioWorklet is bundled as a worker chunk; AudioWorklet requires ES module format.
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
