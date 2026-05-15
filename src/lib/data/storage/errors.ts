/**
 * Typed errors thrown by storage handlers on silent paths so the sync
 * engine can classify them into specific health states ("Sign-in
 * expired" vs. "Permission needed") and the UI can offer the right
 * recovery affordance.
 */

import type { SyncEndpointType } from '$lib/data/storage/storage-types';

export class NeedsInteractiveAuthError extends Error {
  constructor(
    public readonly storageSourceName: string,
    public readonly storageType: SyncEndpointType
  ) {
    super(
      `Interactive sign-in required for ${storageSourceName} (${storageType}); ` +
        'silentOnly was set so no popup was opened.'
    );
    this.name = 'NeedsInteractiveAuthError';
  }
}

export class NeedsPermissionGrantError extends Error {
  constructor(public readonly storageSourceName: string) {
    super(
      `Filesystem permission must be re-granted for ${storageSourceName}; ` +
        'a user gesture is required.'
    );
    this.name = 'NeedsPermissionGrantError';
  }
}
