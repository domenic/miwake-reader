import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { env } from 'node:process';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [vitePreprocess()],

  kit: {
    adapter: adapter({
      fallback: '404.html'
    }),
    paths: {
      base: env.VITE_PAGE_PATH || ''
    }
  }
};

export default config;
