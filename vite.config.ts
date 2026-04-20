import { sveltekit }    from '@sveltejs/kit/vite';
import tailwindcss     from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
  plugins: [
    // tailwindcss() doit précéder sveltekit()
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      // ── Stratégie injectManifest : SvelteKit compile src/service-worker.ts
      // → .svelte-kit/output/client/service-worker.js, puis le plugin injecte
      // self.__WB_MANIFEST dans ce fichier compilé.
      strategies: 'injectManifest',

      // ── Le manifest.json est dans static/ — pas besoin d'en générer un
      manifest: false,

      // ── Patterns à précacher (assets hashés générés par Vite)
      injectManifest: {
        globPatterns: [
          'client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'
        ]
      },

      // ── SW désactivé en développement
      devOptions: {
        enabled: false
      }
    })
  ]
});
