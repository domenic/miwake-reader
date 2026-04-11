/**
 * Clear all references that aren't packed, which could be caused by:
 * - Bad input file (doesn't include the required image)
 * - Bad image file extension
 */
export default function clearAllBadImageRef(el: HTMLElement) {
  const clearTagBadImageAttribute = (tag: Element, attributeName: string) => {
    const attr = tag.getAttribute(attributeName);
    if (attr && !(attr.startsWith('miwake:') || attr.startsWith('data:image/gif;miwake:'))) {
      tag.setAttribute(`data-miwake-${attributeName}`, attr);
      tag.removeAttribute(attributeName);
    }
  };

  Array.from(el.getElementsByTagName('image')).forEach((tag) => {
    clearTagBadImageAttribute(tag, 'href');
  });

  Array.from(el.getElementsByTagName('img')).forEach((tag) => {
    clearTagBadImageAttribute(tag, 'src');
  });
}
