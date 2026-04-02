<script lang="ts">
  import { faXmark, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
  import {
    getChapterData,
    nextChapter$,
    tocIsOpen$,
    type SectionWithProgress
  } from '$lib/components/book-reader/book-toc/book-toc';
  import { isTrackerPaused$ } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { PAGE_CHANGE } from '$lib/data/events';
  import { skipKeyDownListener$, statisticsEnabled$ } from '$lib/data/store';
  import { dummyFn, getWeightedAverage } from '$lib/functions/utils';
  import { debounceTime, fromEvent, merge, take } from 'rxjs';
  import { onMount } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    sectionData?: SectionWithProgress[];
    exploredCharCount?: number;
    verticalMode: boolean;
    wasTrackerPaused: boolean;
  }

  let { sectionData = [], exploredCharCount = 0, verticalMode, wasTrackerPaused }: Props = $props();

  let chapters: SectionWithProgress[] = $state([]);
  let currentChapter: SectionWithProgress = $state(undefined as any);
  let currentChapterIndex = $state(-1);
  let currentChapterCharacterProgress = $state('0/0');
  let currentChapterProgress = $state('0.00');

  let prevChapterAvailable = $derived(
    verticalMode ? currentChapterIndex < chapters.length - 1 : !!currentChapterIndex
  );
  let nextChapterAvailable = $derived(
    verticalMode ? !!currentChapterIndex : currentChapterIndex < chapters.length - 1
  );

  $effect(() => {
    if (sectionData) {
      const [mainChapters, chapterIndex, referenceId] = getChapterData(sectionData);
      const relevantSections = sectionData.filter(
        (section) => section.reference === referenceId || section.parentChapter === referenceId
      );

      currentChapterProgress = getWeightedAverage(
        relevantSections.map((section) => section.progress),
        relevantSections.map((section) => section.charactersWeight)
      ).toFixed(2);
      chapters = mainChapters;
      currentChapterIndex = chapterIndex;
      currentChapter = mainChapters[currentChapterIndex];
    }
  });

  $effect(() => {
    if (currentChapter) {
      scrollToChapterItem(document.getElementById(`for${currentChapter.reference}`));

      const endCharacter = currentChapter.characters as number;

      currentChapterCharacterProgress = `${Math.min(
        Math.max(exploredCharCount - (currentChapter.startCharacter as number), 0),
        endCharacter
      )} / ${endCharacter}`;
    }
  });

  onMount(() => {
    $skipKeyDownListener$ = true;
    dialogManager.dialogs$.next([
      {
        component: '<div/>'
      }
    ]);
    if (currentChapter) {
      scrollToChapterItem(document.getElementById(`for${currentChapter.reference}`));
    }

    return () => {
      $skipKeyDownListener$ = false;
      dialogManager.dialogs$.next([]);
    };
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
      const nextChapter = chapters[currentChapterIndex + indexMod];

      goToChapter(nextChapter.reference, false);
    }
  }

  function goToChapter(chapterId: string, closeToc = false) {
    const nextChapter = chapters.find((chapter) => chapter.reference === chapterId);
    const hasCharacterChange = exploredCharCount !== nextChapter?.startCharacter;

    if ($statisticsEnabled$ && closeToc && hasCharacterChange && !wasTrackerPaused) {
      merge(fromEvent(document, PAGE_CHANGE))
        .pipe(debounceTime(200), take(1))
        .subscribe(() => {
          if (closeToc) {
            closeTocMenu();
          }
        });
    }

    nextChapter$.next(chapterId);

    if ((!hasCharacterChange || !$statisticsEnabled$ || wasTrackerPaused) && closeToc) {
      closeTocMenu();
    }
  }

  function closeTocMenu() {
    tocIsOpen$.next(false);
    dialogManager.dialogs$.next([]);

    if ($statisticsEnabled$ && !wasTrackerPaused) {
      isTrackerPaused$.next(false);
    }
  }
</script>

<div class="flex justify-between p-4">
  <div>Chapter Progress: {currentChapterCharacterProgress} ({currentChapterProgress}%)</div>
  <div
    tabindex="0"
    role="button"
    title="Close table of contents"
    class="flex items-end md:items-center"
    onclick={closeTocMenu}
    onkeyup={dummyFn}
  >
    <Fa icon={faXmark} />
  </div>
</div>
<div class="flex-1 overflow-auto p-4">
  {#each chapters as chapter (chapter.reference)}
    <div class="my-6 flex justify-between">
      <div
        tabindex="0"
        role="button"
        title={`Go to ${chapter.label}`}
        id={`for${chapter.reference}`}
        class="mr-4"
        class:opacity-30={chapter.progress === 100 && chapter !== currentChapter}
        class:hover:opacity-100={chapter.progress === 100 && chapter !== currentChapter}
        class:hover:opacity-60={chapter.progress < 100 || chapter === currentChapter}
        onclick={() => goToChapter(chapter.reference, true)}
        onkeyup={dummyFn}
      >
        {chapter.label}
      </div>
      <div class:opacity-30={chapter.progress === 100 && chapter !== currentChapter}>
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
