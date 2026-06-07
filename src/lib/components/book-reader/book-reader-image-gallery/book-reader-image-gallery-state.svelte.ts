export enum ReaderImageGalleryAvailableKeybind {
  PREVIOUS_IMAGE = 'previousImage',
  NEXT_IMAGE = 'nextImage',
  CLOSE = 'close'
}

export interface ReaderImageGalleryPicture {
  url: string;
  unspoilered: boolean;
}

export type ReaderImageGalleryKeybindMap = Record<string, ReaderImageGalleryAvailableKeybind>;

class ReaderImageGallery {
  #state = $state({
    pictures: [] as ReaderImageGalleryPicture[]
  });

  get pictures() {
    return this.#state.pictures;
  }

  get hasPictures() {
    return this.#state.pictures.length > 0;
  }

  setPictures(pictures: ReaderImageGalleryPicture[]) {
    this.#state.pictures = pictures;
  }

  clear() {
    this.#state.pictures = [];
  }

  togglePictureSpoiler(url: string) {
    this.#state.pictures = this.#state.pictures.map((picture) =>
      picture.url === url ? { ...picture, unspoilered: !picture.unspoilered } : picture
    );
  }

  revealPicture(url: string) {
    this.#state.pictures = this.#state.pictures.map((picture) =>
      picture.url === url ? { ...picture, unspoilered: true } : picture
    );
  }
}

export const readerImageGallery = new ReaderImageGallery();
