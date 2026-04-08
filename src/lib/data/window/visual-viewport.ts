export const visualViewport: VisualViewport =
  typeof window !== 'undefined'
    ? window.visualViewport
    : ({
        addEventListener: () => 0,
        removeEventListener: () => 0
      } as any);
