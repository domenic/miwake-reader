export function isElementGaiji(el: HTMLImageElement) {
  return Array.from(el.classList).some((className) => className.includes('gaiji'));
}
