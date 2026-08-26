import type { Page } from '@playwright/test';
import type { CloudProviderType } from '$lib/data/sync/sync-store.svelte';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { expect, SYNC_ASSERTION_TIMEOUT } from './harness.ts';
import { navigateToSettingsSync } from './navigation.ts';

interface CustomOAuthCredentials {
  clientId: string;
  clientSecret: string;
  tokenEndpoint?: string;
}

export async function connectToCloud(page: Page, provider: CloudProviderType): Promise<void> {
  await navigateToSettingsSync(page);
  await cloudProviderCard(page, provider)
    .getByRole('button', { name: 'Connect', exact: true })
    .click();
  await expectCloudConnected(page, provider);
}

export async function connectToCloudWithCustomOAuth(
  page: Page,
  provider: CloudProviderType,
  credentials: CustomOAuthCredentials
): Promise<void> {
  await navigateToSettingsSync(page);
  await cloudProviderCard(page, provider)
    .getByRole('button', { name: 'Use custom credentials' })
    .click();

  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Client ID').fill(credentials.clientId);
  await dialog.getByLabel('Client secret').fill(credentials.clientSecret);
  if (credentials.tokenEndpoint !== undefined) {
    await dialog.getByLabel('Token endpoint').fill(credentials.tokenEndpoint);
  }
  await dialog.getByRole('button', { name: 'Save and connect' }).click();
  await expectCloudConnected(page, provider, { customOAuth: true });
}

export async function expectCloudConnected(
  page: Page,
  provider: CloudProviderType,
  { customOAuth = false }: { customOAuth?: boolean } = {}
): Promise<void> {
  const providerCard = cloudProviderCard(page, provider);
  await expect(providerCard.getByText(providerName(provider), { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(providerCard.getByText('Connected', { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  if (customOAuth) {
    await expect(providerCard.getByText('Custom OAuth', { exact: true })).toBeVisible();
  }
}

export function cloudProviderCard(page: Page, provider: CloudProviderType) {
  return page
    .getByLabel('Sync location')
    .getByText(providerName(provider), { exact: true })
    .locator('xpath=ancestor::div[@aria-disabled][1]');
}

function providerName(provider: CloudProviderType): string {
  return provider === SyncEndpointType.GDRIVE ? 'Google Drive' : 'OneDrive';
}
