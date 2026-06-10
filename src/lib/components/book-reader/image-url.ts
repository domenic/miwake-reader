export function getImageURL(imageElement: Element | null) {
  if (imageElement instanceof HTMLImageElement) return imageElement.src;

  const imageURL = imageElement?.getAttribute('href') || imageElement?.getAttribute('xlink:href');
  if (imageURL) return imageURL;

  if (imageElement && 'href' in imageElement) {
    return (imageElement.href as SVGAnimatedString).baseVal;
  }

  return undefined;
}
