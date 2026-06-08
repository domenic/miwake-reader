import { expect, test } from '../helpers/harness.ts';
import { watchImageLoadingState } from '../../../src/lib/components/book-reader/image-loading-state.ts';

test('image loading state completes immediately when there are no pending image loads', () => {
  const loadingStates: boolean[] = [];

  const cleanup = watchImageLoadingState(
    fakeContent([
      fakeImage({ src: 'already-loaded.bmp', complete: true }),
      fakeImage({ src: '', complete: false })
    ]),
    (loading) => loadingStates.push(loading)
  );

  expect(loadingStates).toEqual([false]);
  cleanup();
});

test('image loading state waits for every pending image to load or error', () => {
  const loadingStates: boolean[] = [];
  const pendingLoad = fakeImage({ src: 'pending-load.bmp', complete: false });
  const pendingError = fakeImage({ src: 'pending-error.bmp', complete: false });
  const alreadyLoaded = fakeImage({ src: 'already-loaded.bmp', complete: true });

  watchImageLoadingState(fakeContent([pendingLoad, pendingError, alreadyLoaded]), (loading) =>
    loadingStates.push(loading)
  );

  expect(loadingStates).toEqual([true]);

  pendingLoad.completeWith('load');
  expect(loadingStates).toEqual([true]);

  pendingError.completeWith('error');
  expect(loadingStates).toEqual([true, false]);
});

test('image loading state cleanup stops later image events from updating state', () => {
  const loadingStates: boolean[] = [];
  const pending = fakeImage({ src: 'pending.bmp', complete: false });

  const cleanup = watchImageLoadingState(fakeContent([pending]), (loading) =>
    loadingStates.push(loading)
  );

  cleanup();
  pending.completeWith('load');

  expect(loadingStates).toEqual([true]);
});

function fakeContent(images: FakeImage[]) {
  return {
    getElementsByTagName(tagName: string) {
      expect(tagName).toBe('img');
      return images;
    }
  } as unknown as HTMLElement;
}

interface FakeImageOptions {
  complete: boolean;
  src: string;
}

class FakeImage extends EventTarget {
  complete: boolean;
  src: string;

  constructor({ complete, src }: FakeImageOptions) {
    super();
    this.complete = complete;
    this.src = src;
  }

  completeWith(eventName: 'error' | 'load') {
    this.complete = true;
    this.dispatchEvent(new Event(eventName));
  }
}

function fakeImage(options: FakeImageOptions) {
  return new FakeImage(options);
}
