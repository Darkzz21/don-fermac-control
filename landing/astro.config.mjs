import { defineConfig } from 'astro/config';

// La landing se publica en la raíz del sitio; la app va aparte en /app (la copia el workflow de GitHub Pages).
export default defineConfig({
  site: 'https://appgestia.github.io',
  build: { inlineStylesheets: 'always' },
});
