class AppShortcuts {
  #disableCount = $state(0);

  get disabled() {
    return this.#disableCount > 0;
  }

  /**
   * Disables app-level shortcuts while another surface owns input.
   *
   * Reader and statistics shortcuts are registered high in the app, so focused inputs inside
   * dialogs/overlays can otherwise bubble keys into actions like bookmarking or changing the
   * statistics range. Reader surfaces also use this to hide/ignore shortcut-like navigation
   * affordances while a modal surface is active.
   *
   * Returns an idempotent cleanup function. Multiple callers can disable shortcuts at the same time;
   * shortcuts are re-enabled only after every cleanup has run.
   */
  disable() {
    let restored = false;
    this.#disableCount += 1;

    return () => {
      if (restored) return;

      restored = true;
      this.#disableCount -= 1;
    };
  }
}

export const appShortcuts = new AppShortcuts();
