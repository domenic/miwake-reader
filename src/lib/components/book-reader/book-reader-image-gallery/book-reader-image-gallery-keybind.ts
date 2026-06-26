import { finishAppKeydown, shouldIgnoreAppKeydown } from '$lib/functions/keybind';

enum ImageGalleryKeybindAction {
  PREVIOUS_IMAGE = 'previousImage',
  NEXT_IMAGE = 'nextImage',
  CLOSE = 'close'
}

type ImageGalleryKeybindMap = Readonly<Record<string, ImageGalleryKeybindAction>>;

interface ImageGalleryKeybindOptions {
  close: () => void;
  nextImage: () => void;
  previousImage: () => void;
}

const imageGalleryKeybindMap: ImageGalleryKeybindMap = {
  PageDown: ImageGalleryKeybindAction.NEXT_IMAGE,
  ArrowDown: ImageGalleryKeybindAction.NEXT_IMAGE,
  ArrowRight: ImageGalleryKeybindAction.NEXT_IMAGE,
  ArrowUp: ImageGalleryKeybindAction.PREVIOUS_IMAGE,
  ArrowLeft: ImageGalleryKeybindAction.PREVIOUS_IMAGE,
  PageUp: ImageGalleryKeybindAction.PREVIOUS_IMAGE,
  Escape: ImageGalleryKeybindAction.CLOSE
};

// Use `KeyboardEvent.key` so shortcuts are semantic/layout-aware; `code` is physical-key based.
export function handleImageGalleryKeydown(ev: KeyboardEvent, options: ImageGalleryKeybindOptions) {
  if (shouldIgnoreAppKeydown(ev)) {
    return;
  }

  const action = imageGalleryKeybindMap[ev.key];

  switch (action) {
    case ImageGalleryKeybindAction.PREVIOUS_IMAGE:
      options.previousImage();
      break;
    case ImageGalleryKeybindAction.NEXT_IMAGE:
      options.nextImage();
      break;
    case ImageGalleryKeybindAction.CLOSE:
      if (ev.repeat) return;

      options.close();
      break;
    default:
      return;
  }

  finishAppKeydown(ev);
}
