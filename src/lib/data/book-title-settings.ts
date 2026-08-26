import { booleanLocalStorageStore } from '$lib/data/internal/persistent-local-storage-store';
import { appearanceSettingsDefaults } from '$lib/data/settings-defaults';

export const simplifyBookTitles$ = booleanLocalStorageStore(
  'simplifyBookTitles',
  appearanceSettingsDefaults.simplifyBookTitles
);
