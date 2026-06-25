import type { SectionWithProgress } from '$lib/components/book-reader/book-toc/book-toc-state.svelte';
import type { Section } from '$lib/data/database/books-db/versions/v3/books-db-v3';
import type { PageManager } from '../types';
import type { SectionCharacterStatsCalculator } from './section-character-stats-calculator';

interface ReaderState {
  sectionIndex: number;
  virtualScrollPos: number;
}

interface PageManagerPaginatedOptions {
  contentEl: HTMLElement;
  scrollEl: HTMLElement;
  sections: Element[];
  tocSections: readonly Section[];
  setSectionProgress: (sectionProgress: Map<string, SectionWithProgress>) => void;
  readerState: ReaderState;
  setSectionIndexAndWait: (index: number) => Promise<SectionCharacterStatsCalculator>;
  width: number;
  height: number;
  pageGap: number;
  verticalMode: boolean;
  onPageChange: (isUser: boolean) => void;
}

export class PageManagerPaginated implements PageManager {
  #contentEl: HTMLElement;

  #scrollEl: HTMLElement;

  #sections: Element[];

  #setSectionProgress: (sectionProgress: Map<string, SectionWithProgress>) => void;

  #readerState: ReaderState;

  #setSectionIndexAndWait: (index: number) => Promise<SectionCharacterStatsCalculator>;

  #width: number;

  #height: number;

  #pageGap: number;

  #verticalMode: boolean;

  #onPageChange: (isUser: boolean) => void;

  #translateX = 0;

  #sectionData: Map<string, SectionWithProgress> = new Map();

  constructor({
    contentEl,
    scrollEl,
    sections,
    tocSections,
    setSectionProgress,
    readerState,
    setSectionIndexAndWait,
    width,
    height,
    pageGap,
    verticalMode,
    onPageChange
  }: PageManagerPaginatedOptions) {
    this.#contentEl = contentEl;
    this.#scrollEl = scrollEl;
    this.#sections = sections;
    this.#setSectionProgress = setSectionProgress;
    this.#readerState = readerState;
    this.#setSectionIndexAndWait = setSectionIndexAndWait;
    this.#width = width;
    this.#height = height;
    this.#pageGap = pageGap;
    this.#verticalMode = verticalMode;
    this.#onPageChange = onPageChange;

    tocSections.forEach((section) => {
      this.#sectionData.set(section.reference, { ...section, progress: 0 });
    });
  }

  nextPage() {
    this.flipPage(1);
  }

  prevPage() {
    this.flipPage(-1);
  }

  updateSectionDataByOffset(offset = 0) {
    const viewportSize = this.#verticalMode ? this.#height : this.#width;
    const scrollSize = this.#scrollEl[this.#verticalMode ? 'scrollHeight' : 'scrollWidth'];
    const currentPercentage = (this.#readerState.virtualScrollPos / scrollSize) * 100;

    if (offset) {
      const nextPageOffset = this.#readerState.virtualScrollPos + viewportSize + this.#pageGap;
      const diffPercentage = (nextPageOffset / scrollSize) * 100 - currentPercentage;

      this.#updateSectionData(
        this.#sections[this.#readerState.sectionIndex]?.id,
        currentPercentage + diffPercentage * offset
      );
    } else {
      this.#updateSectionData(
        this.#sections[this.#readerState.sectionIndex]?.id,
        currentPercentage
      );
    }
  }

  flipPage(multiplier: 1 | -1) {
    const scrollSizeProp = this.#verticalMode ? 'scrollHeight' : 'scrollWidth';
    const viewportSize = this.#verticalMode ? this.#height : this.#width;

    const offset = viewportSize + this.#pageGap;
    const isUser = true;

    if (this.#translateX) {
      const clearTranslateX = () => {
        this.#contentEl.style.removeProperty('transform');
        this.#translateX = 0;
      };

      if (multiplier < 0) {
        const prevTranslateX = this.#translateX;
        clearTranslateX();
        this.#scrollToPos(-prevTranslateX - offset, isUser);
        return;
      }

      if (this.#readerState.sectionIndex + 1 < this.#sections.length) {
        clearTranslateX();
        void this.#nextSection(isUser);
      }
      return;
    }

    const minValue = 0;
    const maxValue = this.#scrollEl[scrollSizeProp];
    const currentValue = this.#readerState.virtualScrollPos;
    const newValue = currentValue + offset * multiplier;
    const newValueCeil = Math.ceil(newValue);

    if (newValueCeil < minValue) {
      if (currentValue !== minValue) {
        this.#scrollToPos(minValue, isUser);
        return;
      }

      void this.#prevSection(offset, scrollSizeProp, viewportSize, isUser);
      return;
    }
    if (newValueCeil >= maxValue) {
      void this.#nextSection(isUser);
      return;
    }

    this.#scrollOrTranslateToPos(newValue, maxValue, viewportSize, isUser);
  }

  scrollTo(scrollPos: number, isUser: boolean) {
    const scrollSizeProp = this.#verticalMode ? 'scrollHeight' : 'scrollWidth';
    const viewportSize = this.#verticalMode ? this.#height : this.#width;
    this.#scrollOrTranslateToPos(scrollPos, this.#scrollEl[scrollSizeProp], viewportSize, isUser);
  }

  async #prevSection(
    offset: number,
    scrollSizeProp: 'scrollWidth' | 'scrollHeight',
    viewportSize: number,
    isUser: boolean
  ) {
    const nextPage = this.#readerState.sectionIndex - 1;
    if (nextPage < 0) return false;

    await this.#setSectionIndexAndWait(nextPage);

    const scrollSize = this.#scrollEl[scrollSizeProp];
    let scrollValue = offset * (Math.ceil(scrollSize / offset) - 1);
    if (Math.ceil(scrollValue) >= scrollSize) {
      scrollValue -= offset;
    }
    this.#scrollOrTranslateToPos(scrollValue, scrollSize, viewportSize, isUser);
    return true;
  }

  async #nextSection(isUser: boolean) {
    const nextPage = this.#readerState.sectionIndex + 1;
    if (nextPage >= this.#sections.length) return false;

    await this.#setSectionIndexAndWait(nextPage);

    this.#scrollToPos(0, isUser);
    this.#updateSectionData(this.#sections[nextPage - 1]?.id, 100, false);
    this.#updateSectionData(this.#sections[nextPage]?.id, 0);
    return true;
  }

  #scrollOrTranslateToPos(pos: number, scrollSize: number, viewportSize: number, isUser: boolean) {
    this.#updateSectionData(
      this.#sections[this.#readerState.sectionIndex]?.id,
      (pos / scrollSize) * 100
    );

    if (this.#verticalMode) {
      this.#scrollToPos(pos, isUser);
      return;
    }

    const screenRight = pos + viewportSize;
    if (screenRight <= scrollSize) {
      this.#scrollToPos(pos, isUser);
      return;
    }
    this.#translateXToPos(-pos, isUser);
  }

  #scrollToPos(pos: number, isUser: boolean) {
    this.#readerState.virtualScrollPos = pos;
    this.#scrollEl.scrollTo({ [this.#verticalMode ? 'top' : 'left']: pos });
    this.#onPageChange(isUser);
  }

  #translateXToPos(pos: number, isUser: boolean) {
    this.#readerState.virtualScrollPos = -pos;
    this.#contentEl.style.transform = `translateX(${pos}px)`;
    this.#translateX = pos;
    this.#onPageChange(isUser);
  }

  #updateSectionData(ref: string, progress: number, emit = true) {
    if (!ref || !this.#sectionData.has(ref)) return;

    const sections = [...this.#sectionData.values()];
    let currentRefSeen = false;

    sections.forEach((section) => {
      const entry = this.#sectionData.get(section.reference) as SectionWithProgress;
      const isCurrentRef = section.reference === ref;

      if (isCurrentRef) {
        entry.progress = progress;
      } else if (currentRefSeen) {
        entry.progress = 0;
      } else {
        entry.progress = 100;
      }

      if (!currentRefSeen && isCurrentRef) {
        currentRefSeen = true;
      }
      this.#sectionData.set(section.reference, entry);
    });

    if (emit) {
      this.#setSectionProgress(this.#sectionData);
    }
  }
}
