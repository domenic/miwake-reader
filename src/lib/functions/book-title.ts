import { fromStore } from 'svelte/store';
import { simplifyBookTitles$ } from '$lib/data/book-title-settings';

const editionMarkerPattern =
  /(?:文庫|新書|単行本|コミックス?)(?:[\p{Script=Katakana}ーA-ZＡ-Ｚ0-9０-９]*)$|MFC$|版$/iu;
const parentheticalSuffixPattern = /\s*(?:\(([^()]*)\)|（([^（）]*)）)$/u;
const bundledContentSuffixPattern = /\s*【[^【】]*付き】$/u;

function simplifyBookTitle(title: string) {
  let simplifiedTitle = title.trimEnd();

  while (simplifiedTitle) {
    const withoutBundledContent = simplifiedTitle.replace(bundledContentSuffixPattern, '');
    if (withoutBundledContent !== simplifiedTitle) {
      simplifiedTitle = withoutBundledContent.trimEnd();
      continue;
    }

    const parentheticalSuffix = simplifiedTitle.match(parentheticalSuffixPattern);
    const parentheticalContent = parentheticalSuffix?.[1] ?? parentheticalSuffix?.[2];
    if (
      !parentheticalSuffix ||
      !parentheticalContent ||
      !editionMarkerPattern.test(parentheticalContent)
    ) {
      break;
    }

    simplifiedTitle = simplifiedTitle.slice(0, parentheticalSuffix.index).trimEnd();
  }

  return simplifiedTitle || title;
}

const simplifyTitles = fromStore(simplifyBookTitles$);

/**
 * The title to render for a stored book title, honoring the
 * simplify-titles setting. Reactive when read in a reactive context;
 * stored titles (database keys, URLs, sync data) are never changed.
 */
export function displayTitle(title: string) {
  return simplifyTitles.current ? simplifyBookTitle(title) : title;
}

/**
 * Order stored book titles by their displayed form, falling back to
 * the stored form so books whose display titles collide sort stably.
 */
export function compareBookTitles(first: string, second: string) {
  return (
    displayTitle(first).localeCompare(displayTitle(second), 'ja-JP', { numeric: true }) ||
    first.localeCompare(second, 'ja-JP', { numeric: true })
  );
}
