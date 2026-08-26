export enum FuriganaStyle {
  Default = 'default',
  Dim = 'dim',
  Toggle = 'toggle',
  Hide = 'hide'
}

interface FuriganaStyleOption {
  id: FuriganaStyle;
  label: string;
  description: string;
  isDefault?: boolean;
}

export const furiganaStyleOptions: FuriganaStyleOption[] = [
  {
    id: FuriganaStyle.Default,
    label: 'As published',
    description: 'Shows furigana normally, as supplied by the book.',
    isDefault: true
  },
  {
    id: FuriganaStyle.Dim,
    label: 'Dimmed',
    description:
      'Shows faint readings; hover to preview, or click or tap one to make it fully visible.'
  },
  {
    id: FuriganaStyle.Toggle,
    label: 'Reveal on demand',
    description: 'Hides readings; hover to preview, or click or tap one to show or hide it.'
  },
  {
    id: FuriganaStyle.Hide,
    label: 'Hidden',
    description: 'Never shows furigana.'
  }
];

/**
 * Adds click listeners to ruby elements within a container for furigana reveal/toggle.
 * Uses event delegation. Returns a cleanup function.
 */
export function setupRubyClickListeners(
  container: HTMLElement,
  furiganaStyle: FuriganaStyle
): () => void {
  if (furiganaStyle === FuriganaStyle.Default || furiganaStyle === FuriganaStyle.Hide) {
    return () => {};
  }

  const isToggle = furiganaStyle === FuriganaStyle.Toggle;
  function handler(e: Event) {
    const ruby = (e.target as HTMLElement).closest('ruby');
    if (!ruby) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isToggle) {
      ruby.classList.toggle('reveal-rt');
    } else {
      ruby.classList.add('reveal-rt');
    }
  }

  container.addEventListener('click', handler);
  return () => container.removeEventListener('click', handler);
}
