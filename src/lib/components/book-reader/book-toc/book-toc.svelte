<script lang="ts">
  import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
  import { bookTOCState } from '$lib/components/book-reader/book-toc/book-toc-state.svelte';
  import { PAGE_CHANGE } from '$lib/data/events';
  import { statisticsEnabled$ } from '$lib/data/store';
  import { japaneseLangIfNeeded } from '$lib/functions/japanese-language';
  import { dummyFn } from '$lib/functions/utils';
  import Fa from 'svelte-fa';

  interface Props {
    exploredCharCount?: number;
    verticalMode: boolean;
    resumeTrackerAfterTOCCloses: boolean;
  }

  let { exploredCharCount = 0, verticalMode, resumeTrackerAfterTOCCloses }: Props = $props();

  const componentId = $props.id();

  let currentChapterCharacterProgress = $derived.by(() => {
    const currentChapter = bookTOCState.currentChapter;
    if (!currentChapter) {
      return '0/0';
    }

    const endCharacter = currentChapter.characters;

    return `${Math.min(
      Math.max(exploredCharCount - currentChapter.startCharacter, 0),
      endCharacter
    )} / ${endCharacter}`;
  });
  let currentChapterProgress = $derived(bookTOCState.currentChapterProgress.toFixed(2));
  let currentChapterReference = $derived(bookTOCState.currentChapter?.reference);

  let prevChapterAvailable = $derived(
    verticalMode
      ? bookTOCState.currentChapterIndex < bookTOCState.mainChapters.length - 1
      : !!bookTOCState.currentChapterIndex
  );
  let nextChapterAvailable = $derived(
    verticalMode
      ? !!bookTOCState.currentChapterIndex
      : bookTOCState.currentChapterIndex < bookTOCState.mainChapters.length - 1
  );

  $effect(() => {
    if (!bookTOCState.currentChapter) return;

    scrollToChapterItem(document.getElementById(`for${bookTOCState.currentChapter.reference}`));
  });

  function scrollToChapterItem(elm: HTMLElement | null) {
    if (!elm) {
      return;
    }

    if (elm.scrollIntoViewIfNeeded) {
      elm.scrollIntoViewIfNeeded();
    } else {
      elm.scrollIntoView();
    }
  }

  function changeChapter(canNavigate: boolean, indexMod: number) {
    if (canNavigate) {
      const nextChapter = bookTOCState.chapterAtOffset(indexMod);

      if (nextChapter) {
        goToChapter(nextChapter.reference, false);
      }
    }
  }

  function goToChapter(chapterId: string, closeTOC = false) {
    const nextChapter = bookTOCState.mainChapters.find(
      (chapter) => chapter.reference === chapterId
    );
    const hasCharacterChange = exploredCharCount !== nextChapter?.startCharacter;

    if ($statisticsEnabled$ && closeTOC && hasCharacterChange && resumeTrackerAfterTOCCloses) {
      closeTOCAfterNextPageChange();
    }

    bookTOCState.navigateToChapter(chapterId);

    if ((!hasCharacterChange || !$statisticsEnabled$ || !resumeTrackerAfterTOCCloses) && closeTOC) {
      bookTOCState.isOpen = false;
    }
  }

  function closeTOCAfterNextPageChange() {
    document.addEventListener(
      PAGE_CHANGE,
      () => {
        window.setTimeout(() => {
          bookTOCState.isOpen = false;
        }, 200);
      },
      { once: true }
    );
  }
</script>

<div class="p-4 pr-12">
  <div>Chapter Progress: {currentChapterCharacterProgress} ({currentChapterProgress}%)</div>
</div>
<div class="flex-1 overflow-auto p-4">
  {#each bookTOCState.mainChapters as chapter, chapterIndex (chapter.reference)}
    {@const chapterActionId = `${componentId}-chapter-action-${chapterIndex}`}
    {@const chapterLabelId = `${componentId}-chapter-label-${chapterIndex}`}
    {@const chapterLabelLang = japaneseLangIfNeeded(chapter.label)}
    <div class="my-6 flex justify-between">
      <div
        tabindex="0"
        role="button"
        title={`Go to ${chapter.label}`}
        aria-labelledby={`${chapterActionId} ${chapterLabelId}`}
        id={`for${chapter.reference}`}
        class="mr-4"
        class:opacity-30={chapter.progress === 100 && chapter.reference !== currentChapterReference}
        class:hover:opacity-100={chapter.progress === 100 &&
          chapter.reference !== currentChapterReference}
        class:hover:opacity-60={chapter.progress < 100 ||
          chapter.reference === currentChapterReference}
        onclick={() => goToChapter(chapter.reference, true)}
        onkeyup={dummyFn}
      >
        <span id={chapterActionId} class="sr-only">Go to chapter</span>
        <span id={chapterLabelId} lang={chapterLabelLang}>{chapter.label}</span>
      </div>
      <div
        class:opacity-30={chapter.progress === 100 && chapter.reference !== currentChapterReference}
      >
        {chapter.startCharacter}
      </div>
    </div>
  {/each}
</div>
<div class="flex justify-between px-4 py-6">
  <div
    tabindex="0"
    role="button"
    title={prevChapterAvailable ? `${verticalMode ? 'Next' : 'Previous'} Chapter` : ''}
    class:opacity-30={!prevChapterAvailable}
    onclick={() => changeChapter(prevChapterAvailable, verticalMode ? 1 : -1)}
    onkeyup={dummyFn}
  >
    <Fa icon={faChevronLeft} />
  </div>
  <div
    tabindex="0"
    role="button"
    title={nextChapterAvailable ? `${verticalMode ? 'Previous' : 'Next'} Chapter` : ''}
    class:opacity-30={!nextChapterAvailable}
    onclick={() => changeChapter(nextChapterAvailable, verticalMode ? -1 : 1)}
    onkeyup={dummyFn}
  >
    <Fa icon={faChevronRight} />
  </div>
</div>
