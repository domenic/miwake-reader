import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import process from 'node:process';
import generateIcons from './scripts/generate-icons.mjs';

/** @returns {import('vite').Plugin} */
function iconsPlugin() {
  return {
    name: 'generate-icons',
    buildStart: generateIcons
  };
}

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [iconsPlugin(), tailwindcss(), sveltekit()],
  server: process.env.PORT
    ? {
        port: Number(process.env.PORT),
        strictPort: true
      }
    : undefined,
  ssr: {
    // https://github.com/FortAwesome/Font-Awesome/issues/18677
    noExternal: ['@fortawesome/*', '@popperjs/*']
  }
};

export default config;
