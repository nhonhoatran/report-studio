import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // Ports live in server/.env so the API and its dev proxy can never drift apart.
  const env = { ...loadEnv(mode, fileURLToPath(new URL('../server', import.meta.url)), ''), ...process.env };
  const apiPort = Number(env.PORT || 18400);
  const webPort = Number(env.WEB_PORT || 18401);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // pure modules both ends run (the formula language): the server owns them, the client bundles them
        '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)),
      },
    },
    server: {
      port: webPort,
      // fail loudly instead of silently moving to another port
      strictPort: true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'echarts-for-react/lib/core'],
            grid: ['react-grid-layout', '@dnd-kit/core', '@dnd-kit/utilities'],
          },
        },
      },
    },
  };
});
