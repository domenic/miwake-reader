import type { Page } from '@playwright/test';
import { expect, test } from './helpers/harness.ts';
import {
  navigateToSettingsAppearance,
  navigateToSettingsReading,
  navigateToSettingsSync,
  navigateToSettingsTracking
} from './helpers/navigation.ts';

test('normalizes stored numeric settings when the app starts', async ({ page }) => {
  await page.addInitScript(() => {
    const values = {
      fontSize: '2700',
      lineHeight: '99',
      textIndentation: '99',
      textMarginValue: '99',
      firstDimensionMargin: '1250',
      secondDimensionMaxValue: '50',
      swipeThreshold: '26',
      autoBookmarkTime: '999',
      pageColumns: '3',
      trackerAutoStartTime: '500',
      trackerIdleTime: '86400',
      trackerForwardSkipThreshold: '-2',
      trackerBackwardSkipThreshold: '0.5'
    };
    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(key, value);
    }
  });

  await page.goto('/manage');

  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.fromEntries(
          [
            'fontSize',
            'lineHeight',
            'textIndentation',
            'textMarginValue',
            'firstDimensionMargin',
            'secondDimensionMaxValue',
            'swipeThreshold',
            'autoBookmarkTime',
            'pageColumns',
            'trackerAutoStartTime',
            'trackerIdleTime',
            'trackerForwardSkipThreshold',
            'trackerBackwardSkipThreshold'
          ].map((key) => [key, localStorage.getItem(key)])
        )
      )
    )
    .toEqual({
      fontSize: '200',
      lineHeight: '5',
      textIndentation: '20',
      textMarginValue: '20',
      firstDimensionMargin: '1000',
      secondDimensionMaxValue: '100',
      swipeThreshold: '40',
      autoBookmarkTime: '300',
      pageColumns: '2',
      trackerAutoStartTime: '300',
      trackerIdleTime: '43200',
      trackerForwardSkipThreshold: '0',
      trackerBackwardSkipThreshold: '1'
    });
});

test('stores the day boundary as a time without importing the legacy hour', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('startDayHoursForTracker', '7'));
  await navigateToSettingsTracking(page);

  const dayBoundary = page.getByLabel('A new reading day starts at');
  await expect(dayBoundary).toHaveValue('00:00');

  await dayBoundary.fill('04:30');
  await expect
    .poll(() =>
      page.evaluate(() => ({
        current: localStorage.getItem('dayBoundaryTime'),
        legacy: localStorage.getItem('startDayHoursForTracker')
      }))
    )
    .toEqual({ current: '04:30', legacy: '7' });
});

test('visible number-setting labels focus and describe their inputs', async ({ page }) => {
  await navigateToSettingsAppearance(page);

  const textSize = page.getByRole('spinbutton', { name: 'Text size', exact: true });
  await page.getByText('Text size', { exact: true }).click();
  await expect(textSize).toBeFocused();
  await expect(textSize).toHaveAccessibleDescription('px');
  await expect(textSize).toHaveAttribute('max', '200');

  await textSize.fill('2700');
  await textSize.blur();
  await expect(textSize).toHaveValue('200');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fontSize'))).toBe('200');

  const lineHeight = page.getByRole('spinbutton', { name: 'Line height', exact: true });
  await page.getByText('Line height', { exact: true }).click();
  await expect(lineHeight).toBeFocused();
  await expect(lineHeight).toHaveAccessibleDescription('× text size');

  const indentation = page.getByRole('spinbutton', { name: 'First-line indent', exact: true });
  await page
    .getByText('Extra indentation at the start of each paragraph.', { exact: true })
    .click();
  await expect(indentation).toBeFocused();
  await expect(indentation).toHaveAccessibleDescription(
    'Extra indentation at the start of each paragraph. rem'
  );

  await navigateToSettingsReading(page);
  await expect(page.getByRole('group', { name: 'Text columns' })).toHaveAccessibleDescription(
    'Auto adds columns as needed to keep each one roughly 1,000 px wide or less. Applies only when text direction is set to Horizontal and reading flow is set to Pages.'
  );
});

test('number inputs keep incomplete and out-of-range edits out of settings stores', async ({
  page
}) => {
  await navigateToSettingsAppearance(page);

  const textSize = page.getByRole('spinbutton', { name: 'Text size', exact: true });
  const previewText = page.getByLabel('Live reader preview').locator('.preview-text');

  await textSize.fill('48');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fontSize'))).toBe('48');
  await expect(previewText).toHaveCSS('font-size', '48px');

  await textSize.fill('');
  await expect(textSize).toHaveValue('');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fontSize'))).toBe('48');
  await expect(previewText).toHaveCSS('font-size', '48px');

  await textSize.fill('2700');
  await expect(textSize).toHaveValue('2700');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fontSize'))).toBe('48');
  await expect(previewText).toHaveCSS('font-size', '48px');

  await textSize.blur();
  await expect(textSize).toHaveValue('200');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fontSize'))).toBe('200');
  await expect(previewText).toHaveCSS('font-size', '200px');
});

test('idle time preserves the value being edited', async ({ page }) => {
  await navigateToSettingsTracking(page);
  await page.getByText('Track reading activity', { exact: true }).click();
  await page.getByText('Pause after no page activity', { exact: true }).click();

  const idleTime = page.getByRole('spinbutton', { name: 'Idle time' });
  await idleTime.fill('4.1');

  await expect(idleTime).toHaveValue('4.1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('trackerIdleTime'))).toBe('246');

  await page.getByText('Pause after no page activity', { exact: true }).click();
  await page.getByText('Pause after no page activity', { exact: true }).click();
  await expect(idleTime).toHaveValue('4.1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('trackerIdleTime'))).toBe('246');
});

test('reader preview clears revealed furigana when its mode changes', async ({ page }) => {
  await navigateToSettingsAppearance(page);

  const furigana = page.getByRole('group', { name: 'Furigana display' });
  const previewRuby = page.getByLabel('Live reader preview').locator('ruby').first();
  await furigana.getByLabel('Dimmed').check();
  await previewRuby.click();
  await expect(previewRuby).toHaveClass(/reveal-rt/);

  await furigana.getByLabel('Reveal on demand').check();
  await expect(previewRuby).not.toHaveClass(/reveal-rt/);
});

test('restores appearance defaults without deleting custom resources', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('customThemes', JSON.stringify({ preserved: {} }));
  });
  await navigateToSettingsAppearance(page);

  await page.getByRole('group', { name: 'Book titles' }).getByLabel('Full').check();
  await page.getByRole('group', { name: 'Text direction' }).getByText('Horizontal').click();
  await page.getByRole('group', { name: 'Reading flow' }).getByText('Scroll').click();
  await page.getByRole('spinbutton', { name: 'Text size', exact: true }).fill('48');

  await expect(page.getByText('Restore appearance defaults', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore defaults…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore appearance defaults?' });
  await expect(dialog).toContainText('Custom themes and imported fonts will not be deleted.');
  await dialog.getByRole('button', { name: 'Restore defaults' }).click();

  await expect(
    page.getByRole('group', { name: 'Book titles' }).getByLabel('Simplified')
  ).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'Text direction' }).getByRole('radio', { name: 'Vertical' })
  ).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'Reading flow' }).getByRole('radio', { name: 'Pages' })
  ).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'Text size', exact: true })).toHaveValue('20');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('customThemes')))
    .toBe(JSON.stringify({ preserved: {} }));
  await expectStoredSettings(page, {
    writingMode: 'vertical-rl',
    viewMode: 'paginated',
    simplifyBookTitles: '1',
    theme: 'light-theme',
    fontFamilyGroupOne: 'Noto Serif JP',
    fontFamilyGroupTwo: 'Noto Sans JP',
    fontSize: '20',
    lineHeight: '1.65',
    textIndentation: '0',
    textMarginMode: 'auto',
    textMarginValue: '0',
    enableTextJustification: '0',
    furiganaStyle: 'default',
    hideSpoilerImageMode: 'off',
    prioritizeReaderStyles: '0',
    enableTextWrapPretty: '0',
    verticalTextOrientation: 'mixed',
    enableFontVPAL: '0'
  });
});

test('restores reading defaults and its local compound-control state', async ({ page }) => {
  await navigateToSettingsReading(page);

  await page.getByRole('group', { name: 'Text direction' }).getByText('Horizontal').click();
  await page.getByRole('group', { name: 'Reading flow' }).getByText('Scroll').click();
  const pageMargins = page.getByRole('group', { name: 'Page margins' });
  await pageMargins.getByRole('radio', { name: 'Custom', exact: true }).check();
  await pageMargins.getByRole('spinbutton', { name: 'Page margins Custom' }).fill('72');
  await page.getByText('Save my position when leaving', { exact: true }).click();

  await page.getByRole('button', { name: 'Restore defaults…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore reading defaults?' });
  await dialog.getByRole('button', { name: 'Restore defaults' }).click();

  await expect(pageMargins.getByRole('radio', { name: 'Automatic (default)' })).toBeChecked();
  await expect(pageMargins.getByRole('spinbutton', { name: 'Page margins Custom' })).toHaveValue(
    '24'
  );
  await expect(page.getByRole('switch', { name: 'Save my position when leaving' })).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'Text direction' }).getByRole('radio', { name: 'Vertical' })
  ).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'Reading flow' }).getByRole('radio', { name: 'Pages' })
  ).toBeChecked();
  await expectStoredSettings(page, {
    writingMode: 'vertical-rl',
    viewMode: 'paginated',
    firstDimensionMargin: '0',
    secondDimensionMaxValue: '0',
    pageColumns: '0',
    avoidPageBreak: '0',
    disableWheelNavigation: '0',
    enableTapEdgeToFlip: '0',
    swipeThreshold: '10',
    enableReaderWakeLock: '0',
    autoBookmark: '1',
    autoBookmarkTime: '3',
    manualBookmark: '0',
    confirmClose: '0',
    selectionToBookmarkEnabled: '0',
    pauseTrackerOnCustomPointChange: '1',
    showCharacterCounter: '1',
    showPercentage: '1',
    showFooterChapterCharacterCounter: '0',
    showFooterChapterPercentage: '0'
  });
});

test('restores tracking preferences without deleting reading data', async ({ page }) => {
  await navigateToSettingsTracking(page);

  await page.getByText('Track reading activity', { exact: true }).click();
  await page.getByLabel('A new reading day starts at').fill('04:30');
  await page
    .getByRole('group', { name: 'After removing a book' })
    .getByLabel('Delete reading data')
    .check();

  await expect(page.getByText('Restore tracking defaults', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore defaults…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore tracking defaults?' });
  await expect(dialog).toContainText(
    'Recorded reading data and reading goals will not be deleted.'
  );
  await dialog.getByRole('button', { name: 'Restore defaults' }).click();

  await expect(page.getByRole('switch', { name: 'Track reading activity' })).not.toBeChecked();
  await expect(page.getByLabel('A new reading day starts at')).toHaveValue('00:00');
  await expect(
    page.getByRole('group', { name: 'After removing a book' }).getByLabel('Keep reading data')
  ).toBeChecked();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('trackerForwardSkipThreshold')))
    .toBe('2700');
  await expectStoredSettings(page, {
    statisticsEnabled: '0',
    trackerAutoStartTime: '0',
    trackerAutoPause: 'moderate',
    trackerPopupDetection: '0',
    trackerIdleTime: '0',
    adjustStatisticsAfterIdleTime: '1',
    openTrackerOnCompletion: '1',
    addCharactersOnCompletion: '0',
    overwriteBookCompletion: '0',
    dayBoundaryTime: '00:00',
    keepLocalReadingDataOnDeletion: '1',
    trackerForwardSkipThreshold: '2700',
    trackerBackwardSkipThreshold: '2700',
    trackerSkipThresholdAction: 'ignore'
  });
});

test('restores advanced sync preferences without disconnecting locations', async ({ page }) => {
  await navigateToSettingsSync(page);
  await page.locator('summary').getByText('Advanced', { exact: true }).click();

  await page.getByRole('group', { name: 'Sync direction' }).getByLabel('Off').check();
  await page
    .getByRole('group', { name: 'How to combine reading statistics' })
    .getByLabel('Replace')
    .check();
  await page
    .getByRole('group', { name: 'How to combine reading goals' })
    .getByLabel('Replace')
    .check();
  await page.getByText('Cache remote file list', { exact: true }).click();
  await page.getByRole('group', { name: 'EPUB import fixes' }).getByLabel('Standard').check();
  await page.getByText('Restrict self-closing-tag fixes to links', { exact: true }).click();

  await page.getByRole('button', { name: 'Restore defaults…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore sync defaults?' });
  await expect(dialog).toContainText('including setting Sync direction to Both');
  await expect(dialog).toContainText('Your sync locations remain connected');
  await dialog.getByRole('button', { name: 'Restore defaults' }).click();

  await expect(
    page.getByRole('group', { name: 'Sync direction' }).getByLabel('Both')
  ).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'How to combine reading statistics' }).getByLabel('Merge')
  ).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'How to combine reading goals' }).getByLabel('Merge')
  ).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Cache remote file list' })).not.toBeChecked();
  await expect(
    page.getByRole('group', { name: 'EPUB import fixes' }).getByLabel('Off')
  ).toBeChecked();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('restrictImportFixToAnchor')))
    .toBe('1');
  await expectStoredSettings(page, {
    autoReplication: 'all',
    statisticsMergeMode: 'merge',
    readingGoalsMergeMode: 'merge',
    cacheStorageData: '0',
    importHTMLFixMode: 'Off',
    restrictImportFixToAnchor: '1'
  });
});

test('switch labels toggle their controls and reading settings fit on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await navigateToSettingsReading(page);

  const tapEdges = page.getByRole('switch', { name: 'Tap page edges to turn pages' });
  await expect(tapEdges).toHaveAccessibleDescription(
    'Reserves a small area on either edge for page turning. Applies only when reading flow is set to Pages.'
  );
  const initiallyChecked = await tapEdges.isChecked();
  await page.getByText('Tap page edges to turn pages', { exact: true }).click();
  await expect(tapEdges).toBeChecked({ checked: !initiallyChecked });
  await page
    .getByText('Reserves a small area on either edge for page turning.', { exact: true })
    .click();
  await expect(tapEdges).toBeChecked({ checked: initiallyChecked });

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(pageWidth).toBe(viewportWidth);

  for (const name of [
    'Show whole-book character count',
    'Show whole-book percentage',
    'Show current-chapter character count',
    'Show current-chapter percentage'
  ]) {
    await expect(page.getByRole('checkbox', { name, exact: true })).toBeVisible();
  }
});

async function expectStoredSettings(page: Page, expected: Record<string, string>) {
  await expect
    .poll(() =>
      page.evaluate((keys) => {
        return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
      }, Object.keys(expected))
    )
    .toEqual(expected);
}

test('saving on exit and warning before exit remain independent', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('manualBookmark', '0');
    localStorage.setItem('confirmClose', '1');
  });
  await navigateToSettingsReading(page);

  const saveOnExit = page.getByRole('switch', { name: 'Save my position when leaving' });
  const warnOnExit = page.getByRole('switch', {
    name: 'Warn before leaving with unsaved progress'
  });
  await expect(saveOnExit).toBeChecked();
  await expect(warnOnExit).toBeChecked();

  await page.getByText('Save my position when leaving', { exact: true }).click();
  await expect(saveOnExit).not.toBeChecked();
  await expect(warnOnExit).toBeChecked();
  await page.getByText('Save my position when leaving', { exact: true }).click();
  await expect(saveOnExit).toBeChecked();
  await expect(warnOnExit).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('confirmClose'))).toBe('1');
});

test('vertical typography preferences remain available in horizontal mode', async ({ page }) => {
  await navigateToSettingsAppearance(page);

  await page.getByRole('group', { name: 'Text direction' }).getByText('Horizontal').click();
  await page.locator('summary').click();

  await expect(
    page.getByRole('group', { name: 'Latin letters and numbers in vertical text' })
  ).toBeVisible();
  const verticalSpacing = page.getByRole('group', {
    name: 'Vertical character spacing',
    exact: true
  });
  await expect(verticalSpacing).toBeVisible();
  await expect(verticalSpacing).toHaveAccessibleDescription(
    'Proportional spacing changes fonts that provide alternate vertical metrics. Applies only when text direction is set to Vertical.'
  );

  const verticalApplicability = page.getByTitle(
    'Applies only when text direction is set to Vertical.'
  );
  await expect(verticalApplicability).toHaveCount(2);
  await expect(verticalApplicability.first()).toHaveCSS('cursor', 'help');
});

test('choice controls preserve boolean and numeric values', async ({ page }) => {
  await navigateToSettingsAppearance(page);

  const bookTitles = page.getByRole('group', { name: 'Book titles' });
  await bookTitles.getByLabel('Full').check();
  await expect(bookTitles.getByLabel('Full')).toBeChecked();

  await page.getByRole('group', { name: 'Text direction' }).getByText('Horizontal').click();
  await navigateToSettingsReading(page);

  const textColumns = page.getByRole('group', { name: 'Text columns' });
  await textColumns.getByText('2', { exact: true }).click();
  await expect(textColumns.getByRole('radio', { name: '2' })).toBeChecked();

  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Text columns' }).getByRole('radio', { name: '2' })
  ).toBeChecked();

  await navigateToSettingsAppearance(page);
  await expect(page.getByRole('group', { name: 'Book titles' }).getByLabel('Full')).toBeChecked();
});

test('custom layout values stay with their radio options', async ({ page }) => {
  await navigateToSettingsReading(page);

  const pageMargins = page.getByRole('group', { name: 'Page margins' });
  const customMargin = pageMargins.getByRole('spinbutton', { name: 'Page margins Custom' });

  await expect(customMargin).toBeDisabled();
  await expect(customMargin).toHaveValue('24');

  await pageMargins.getByRole('radio', { name: 'Custom', exact: true }).check();
  await expect(customMargin).toBeEnabled();
  await customMargin.fill('36');
  await customMargin.blur();

  await pageMargins.getByRole('radio', { name: 'Automatic (default)' }).check();
  await expect(customMargin).toBeDisabled();
  await expect(customMargin).toHaveValue('36');

  await pageMargins.getByRole('radio', { name: 'Custom', exact: true }).check();
  await expect(customMargin).toBeEnabled();
  await expect(customMargin).toHaveValue('36');

  await page.reload();
  const reloadedPageMargins = page.getByRole('group', { name: 'Page margins' });
  await expect(
    reloadedPageMargins.getByRole('radio', { name: 'Custom', exact: true })
  ).toBeChecked();
  await expect(
    reloadedPageMargins.getByRole('spinbutton', { name: 'Page margins Custom' })
  ).toHaveValue('36');

  const lineLength = page.getByRole('group', {
    name: 'Maximum reading area'
  });
  await expect(
    lineLength.getByRole('spinbutton', {
      name: 'Maximum reading area Custom'
    })
  ).toBeDisabled();
});

test('compound number controls follow settings changed in another tab', async ({ page }) => {
  await navigateToSettingsReading(page);

  const pageMargins = page.getByRole('group', { name: 'Page margins' });
  const customMargin = pageMargins.getByRole('spinbutton', { name: 'Page margins Custom' });
  const otherPage = await page.context().newPage();

  try {
    await otherPage.goto('/manage');
    await otherPage.evaluate(() => localStorage.setItem('firstDimensionMargin', '48'));

    await expect(pageMargins.getByRole('radio', { name: 'Custom', exact: true })).toBeChecked();
    await expect(customMargin).toBeEnabled();
    await expect(customMargin).toHaveValue('48');

    await otherPage.evaluate(() => localStorage.setItem('firstDimensionMargin', '0'));

    await expect(pageMargins.getByRole('radio', { name: 'Automatic (default)' })).toBeChecked();
    await expect(customMargin).toBeDisabled();
    await expect(customMargin).toHaveValue('48');

    await navigateToSettingsTracking(page);
    await page.getByText('Track reading activity', { exact: true }).click();
    const idlePause = page.getByRole('switch', { name: 'Pause after no page activity' });

    await otherPage.evaluate(() => localStorage.setItem('trackerIdleTime', '600'));

    await expect(idlePause).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'Idle time' })).toHaveValue('10');

    await otherPage.evaluate(() => localStorage.setItem('trackerIdleTime', '1200'));
    await expect(page.getByRole('spinbutton', { name: 'Idle time' })).toHaveValue('20');

    await otherPage.evaluate(() => localStorage.setItem('trackerIdleTime', '0'));
    await expect(idlePause).not.toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'Idle time' })).toHaveCount(0);
  } finally {
    await otherPage.close();
  }
});

test('reader modes stay available while mode-specific preferences remain configurable', async ({
  page
}) => {
  await navigateToSettingsAppearance(page);

  const appearanceModes = page.locator('[data-reader-mode-settings]');
  await appearanceModes
    .getByRole('group', { name: 'Text direction' })
    .getByText('Horizontal')
    .click();
  await appearanceModes.getByRole('group', { name: 'Reading flow' }).getByText('Scroll').click();

  await navigateToSettingsReading(page);

  const readingModes = page.locator('[data-reader-mode-settings]');
  await expect(
    readingModes
      .getByRole('group', { name: 'Text direction' })
      .getByRole('radio', { name: 'Horizontal' })
  ).toBeChecked();
  await expect(
    readingModes.getByRole('group', { name: 'Reading flow' }).getByRole('radio', { name: 'Scroll' })
  ).toBeChecked();

  await expect(page.getByRole('group', { name: 'Text columns' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Keep paragraphs on one page' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Turn pages by scrolling' })).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Anchor bookmarks near selected text' })
  ).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Pause tracking while setting a reading position' })
  ).toBeVisible();

  await readingModes.getByRole('group', { name: 'Text direction' }).getByText('Vertical').click();
  await readingModes.getByRole('group', { name: 'Reading flow' }).getByText('Pages').click();

  await expect(page.getByRole('group', { name: 'Text columns' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Keep paragraphs on one page' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Turn pages by scrolling' })).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Anchor bookmarks near selected text' })
  ).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Pause tracking while setting a reading position' })
  ).toBeVisible();
});
