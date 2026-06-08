export function watchImageLoadingState(
  contentEl: HTMLElement,
  onloadingstatechange: (loading: boolean) => void
) {
  const loadingImages = new Set(
    Array.from(contentEl.getElementsByTagName('img')).filter((el) => el.src && !el.complete)
  );

  if (loadingImages.size === 0) {
    onloadingstatechange(false);
    return () => {};
  }

  onloadingstatechange(true);

  const abortController = new AbortController();
  const { signal } = abortController;

  function markImageLoaded(imageElement: HTMLImageElement) {
    loadingImages.delete(imageElement);

    if (loadingImages.size === 0) {
      onloadingstatechange(false);
      abortController.abort();
    }
  }

  for (const imageElement of loadingImages) {
    imageElement.addEventListener('load', () => markImageLoaded(imageElement), {
      once: true,
      signal
    });
    imageElement.addEventListener('error', () => markImageLoaded(imageElement), {
      once: true,
      signal
    });

    if (imageElement.complete) {
      markImageLoaded(imageElement);
    }
  }

  return () => abortController.abort();
}
