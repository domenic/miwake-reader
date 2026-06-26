interface AppKeydownOptions {
  shortcutsDisabled?: boolean;
}

export function shouldIgnoreAppKeydown(
  ev: KeyboardEvent,
  { shortcutsDisabled = false }: AppKeydownOptions = {}
) {
  return shortcutsDisabled || ev.altKey || ev.ctrlKey || ev.shiftKey || ev.metaKey;
}

export function finishAppKeydown(ev: KeyboardEvent) {
  // Only call after a recognized shortcut, so ordinary keys keep their normal browser behavior.
  // Blurring also keeps the next Space/Enter press from activating a previously focused control.
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  ev.preventDefault();
}
