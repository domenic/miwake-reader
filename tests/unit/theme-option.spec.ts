import { describe, expect, test } from 'vitest';
import { availableThemes, resolveThemeOption } from '$lib/data/theme-option';

describe('resolveThemeOption', () => {
  test('uses built-in themes before custom themes with the same id', () => {
    const customTheme = availableThemes.get('gray-theme')!;

    expect(resolveThemeOption('light-theme', { 'light-theme': customTheme })).toBe(
      availableThemes.get('light-theme')
    );
  });

  test('uses custom themes when there is no built-in theme with the same id', () => {
    const customTheme = availableThemes.get('gray-theme')!;

    expect(resolveThemeOption('custom', { custom: customTheme })).toBe(customTheme);
  });
});
