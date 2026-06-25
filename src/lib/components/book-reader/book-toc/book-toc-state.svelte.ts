import { SvelteMap } from 'svelte/reactivity';

import type { ChapterSection, Section } from '$lib/data/database/books-db/versions/v3/books-db-v3';
import { getWeightedAverage } from '$lib/functions/utils';

export type SectionWithProgress = Section & {
  progress: number;
};

export type ChapterWithProgress = ChapterSection & {
  progress: number;
};

interface BookTOCChapterData {
  mainChapters: ChapterWithProgress[];
  currentChapter: ChapterWithProgress | undefined;
  currentChapterIndex: number;
  currentChapterProgress: number;
}

function isChapterWithProgress(section: SectionWithProgress): section is ChapterWithProgress {
  return section.parentChapter === undefined;
}

function deriveChapterData(sectionData: SectionWithProgress[]): BookTOCChapterData {
  if (!sectionData.length) {
    return {
      mainChapters: [],
      currentChapter: undefined,
      currentChapterIndex: -1,
      currentChapterProgress: 0
    };
  }

  const mainChapters = sectionData.filter(isChapterWithProgress);

  let currentSection = sectionData.find((section) => section.progress < 100);

  if (!currentSection) {
    currentSection = sectionData[sectionData.length - 1];
  }

  const referenceId = currentSection.parentChapter || currentSection.reference;
  const currentChapterIndex = mainChapters.findIndex(
    (section) => section.reference === referenceId
  );
  const currentChapterSections = sectionData.filter(
    (section) => section.reference === referenceId || section.parentChapter === referenceId
  );
  const currentChapterProgress = currentChapterSections.length
    ? getWeightedAverage(
        currentChapterSections.map((section) => section.progress),
        currentChapterSections.map((section) => section.charactersWeight)
      )
    : 0;

  return {
    mainChapters,
    currentChapter: mainChapters[currentChapterIndex],
    currentChapterIndex,
    currentChapterProgress
  };
}

class BookTOCState {
  #sectionProgress = new SvelteMap<string, SectionWithProgress>();

  sections = $state<Section[]>([]);
  isOpen = $state(false);
  sectionData = $derived([...this.#sectionProgress.values()]);
  #chapterData = $derived(deriveChapterData(this.sectionData));

  get mainChapters() {
    return this.#chapterData.mainChapters;
  }

  get currentChapter() {
    return this.#chapterData.currentChapter;
  }

  get currentChapterIndex() {
    return this.#chapterData.currentChapterIndex;
  }

  get currentChapterProgress() {
    return this.#chapterData.currentChapterProgress;
  }

  get hasChapters() {
    return this.mainChapters.length > 0;
  }

  chapterAtOffset(offset: number) {
    return this.mainChapters[this.currentChapterIndex + offset];
  }

  setSections(sections: Section[]) {
    this.sections = sections;
    this.#sectionProgress.clear();

    for (const section of sections) {
      this.#sectionProgress.set(section.reference, { ...section, progress: 0 });
    }
  }

  setSectionProgress(sectionProgress: Map<string, SectionWithProgress>) {
    this.#sectionProgress.clear();

    for (const [reference, section] of sectionProgress) {
      this.#sectionProgress.set(reference, { ...section });
    }
  }

  clearSectionProgress() {
    this.#sectionProgress.clear();
  }
}

export const bookTOCState = new BookTOCState();
