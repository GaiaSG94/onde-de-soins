import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { config as loadEnv } from 'dotenv';
import { handleOrsRequest } from './server/orsProxy.ts';

loadEnv();

function orsProxy(): Plugin {
  const middleware = (req: Parameters<typeof handleOrsRequest>[0], res: Parameters<typeof handleOrsRequest>[1], next: () => void) => {
    if (!req.url?.startsWith('/api/ors/')) {
      next();
      return;
    }
    void handleOrsRequest(req, res);
  };
  return {
    name: 'ors-server-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), orsProxy()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', sourcemap: false },
});
