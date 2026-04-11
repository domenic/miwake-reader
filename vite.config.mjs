import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
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
  ssr: {
    // https://github.com/FortAwesome/Font-Awesome/issues/18677
    noExternal: ['@fortawesome/*', '@popperjs/*']
  }
};

export default config;
