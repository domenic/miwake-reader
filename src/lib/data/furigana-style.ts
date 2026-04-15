export enum FuriganaStyle {
  Default = 'default',
  Dim = 'dim',
  Toggle = 'toggle',
  Hide = 'hide'
}

export const furiganaStyleLabels: Record<FuriganaStyle, string> = {
  [FuriganaStyle.Default]: 'Default',
  [FuriganaStyle.Dim]: 'Dim',
  [FuriganaStyle.Toggle]: 'Toggle',
  [FuriganaStyle.Hide]: 'Hide'
};

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
