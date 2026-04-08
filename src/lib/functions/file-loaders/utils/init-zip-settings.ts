import { UAParser } from 'ua-parser-js';
import { configure as zipConfigure } from '@zip.js/zip.js';

export default function initZipSettings() {
  zipConfigure({
    useWebWorkers: !isKiwiBrowser()
  });
}

function isKiwiBrowser() {
  if (typeof window === 'undefined') return false;
  const parseResult = new UAParser(window.navigator.userAgent).getResult();
  return parseResult.os.name === 'Android' && parseResult.browser.name === 'Chrome';
}
