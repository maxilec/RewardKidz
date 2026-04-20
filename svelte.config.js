import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // SPA mode: toutes les routes inconnues reçoivent ce fichier HTML
      // Firebase Hosting rewrites "**" → "/index.html" fait le reste
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    prerender: {
      // Pendant la migration, les assets statiques (icônes PWA) peuvent manquer.
      // On avertit au lieu de faire échouer le build.
      handleHttpError: 'warn'
    }
  }
};

export default config;
