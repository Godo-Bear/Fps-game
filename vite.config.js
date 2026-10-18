import { defineConfig } from 'vite';

// Every build gets its own id. The game checks /version.json now and then and restarts itself
// when a newer build has been deployed (see src/version.js).
const BUILD = Date.now().toString(36);

export default defineConfig(({ command }) => ({
  define: {
    __BUILD__: JSON.stringify(command === 'build' ? BUILD : 'dev'),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    {
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD, at: new Date().toISOString() }) });
      },
    },
  ],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    // `npm run dev` + `npm run cf:dev` in another terminal gives you the online features locally
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
    },
  },
}));
