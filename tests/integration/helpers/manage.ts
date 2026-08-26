import type { Page } from '@playwright/test';

export async function selectBookSort(
  page: Page,
  label: string,
  direction: 'ascending' | 'descending'
) {
  await page.getByRole('button', { name: /Sort/ }).click();
  await page.getByRole('button', { name: `Sort by ${label} ${direction}` }).click();
}
