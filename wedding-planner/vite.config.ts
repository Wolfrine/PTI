import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { publicContent, renderInvitation } from './src/public-content';
import {weddingPwaPlugin} from './scripts/pwa-build.mjs';

export default defineConfig({
  plugins:[{name:'approved-public-invitation',transformIndexHtml(html,context){return context.path==='/index.html'||context.path==='/'?html.replace('<!-- PUBLIC_INVITATION -->',renderInvitation(publicContent)):html;}},weddingPwaPlugin()],
  build: {
    rollupOptions: { input: { invitation: resolve(import.meta.dirname, 'index.html'), family: resolve(import.meta.dirname, 'family/index.html'), offline: resolve(import.meta.dirname, 'offline.html') } }
  }
});
