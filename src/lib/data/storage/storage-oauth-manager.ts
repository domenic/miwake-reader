import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import {
  gDriveAuthEndpoint,
  gDriveClientId,
  gDriveClientSecret,
  gDriveScope,
  gDriveTokenEndpoint,
  oneDriveAuthEndpoint,
  oneDriveClientId,
  oneDriveScope,
  oneDriveTokenEndpoint,
  pagePath
} from '$lib/data/env';
import { logger } from '$lib/data/logger';
import {
  isAppDefault,
  isRemoteContext,
  type RemoteContext
} from '$lib/data/storage/storage-source-manager';
import { StorageSourceDefault, StorageKey } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import { messageDialog } from '$lib/data/simple-dialogs';
import { convertAuthErrorResponse } from '$lib/functions/replication/error-handler';
import { isMobile } from '$lib/functions/utils';

interface OAuthTokenData {
  accessToken: string;
  expiration: number;
  scope: string;
  refreshToken?: string;
}

export const storageOAuthTokens = new Map<string, OAuthTokenData>();

/**
 * Thrown by `getToken` when it's called with `silentOnly: true` and
 * there's no cached/refreshable token — i.e. an interactive popup
 * would be required. Callers (like the sync engine's boot
 * reconciliation) catch this to set a "needs attention" UI state
 * rather than triggering auth without a user gesture.
 */
export class NeedsInteractiveAuthError extends Error {
  constructor(
    public readonly storageSourceName: string,
    public readonly storageType: StorageKey
  ) {
    super(
      `Interactive sign-in required for ${storageSourceName} (${storageType}); ` +
        'silentOnly was set so no popup was opened.'
    );
    this.name = 'NeedsInteractiveAuthError';
  }
}

export class StorageOAuthManager {
  private storageType: StorageKey;

  private readonly refreshEndpoint;

  private parentWindow: Window | undefined;

  private storageSourceName = '';

  private remoteData: RemoteContext | undefined;

  private authWindow: Window | null = null;

  private codeVerifier = '';

  private static AUTH_CHANNEL = 'miwake-auth';

  private static AUTH_STORAGE_KEY = 'miwake-auth-data';

  private authResolver: ((value: OAuthTokenData | PromiseLike<OAuthTokenData>) => void) | undefined;

  private authRejector: ((error: Error) => void) | undefined;

  private broadcastChannel: BroadcastChannel | undefined;

  private authTimeout = 120000;

  private authTimeoutTimer: number | undefined;

  private pendingGetToken: Promise<string | undefined> | undefined;

  constructor(type: StorageKey, refreshEndpoint: string) {
    this.storageType = type;
    this.refreshEndpoint = refreshEndpoint;
  }

  async getToken(
    window: Window,
    storageSourceName: string,
    authWindow?: Window | null,
    silentOnly = false
  ): Promise<string | undefined> {
    if (this.pendingGetToken) {
      return this.pendingGetToken;
    }

    this.pendingGetToken = this.doGetToken(window, storageSourceName, authWindow, silentOnly);

    try {
      return await this.pendingGetToken;
    } finally {
      this.pendingGetToken = undefined;
    }
  }

  private async doGetToken(
    window: Window,
    storageSourceName: string,
    authWindow?: Window | null,
    silentOnly = false
  ): Promise<string | undefined> {
    const oldToken = storageOAuthTokens.get(storageSourceName);

    if (!oldToken || this.storageSourceName !== storageSourceName) {
      this.remoteData = undefined;
      this.storageSourceName = storageSourceName;
    }

    // 1. Try the in-memory cached token
    let token = await this.verifyToken(oldToken);

    if (token) {
      return token.accessToken;
    }

    // 2. Load credentials (and any stored refresh token)
    this.remoteData = undefined;

    let storageSource: BooksDbStorageSource | undefined;
    const defaultSource = isAppDefault(storageSourceName);

    if (defaultSource) {
      const db = await database.db;
      const stored = await db.get('storageSource', storageSourceName);
      const storedData = stored?.data as RemoteContext | undefined;

      const isGDrive = storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT;
      this.remoteData = {
        clientId: isGDrive ? gDriveClientId : oneDriveClientId,
        clientSecret: isGDrive ? gDriveClientSecret : '',
        refreshToken: storedData?.refreshToken
      };
    } else {
      const db = await database.db;
      storageSource = await db.get('storageSource', storageSourceName);

      if (!storageSource) {
        throw new Error(`No storage source with name ${storageSourceName} found`);
      }
      if (!isRemoteContext(storageSource.data)) {
        throw new Error(`Storage source ${storageSourceName} is missing remote credentials`);
      }

      this.remoteData = { ...storageSource.data };
    }

    // 3. Try refreshing with stored refresh token
    token = await this.verifyToken(undefined);

    if (token) {
      storageOAuthTokens.set(storageSourceName, token);
      return token.accessToken;
    }

    // 4. No valid token — would need interactive auth.
    if (silentOnly) {
      throw new NeedsInteractiveAuthError(storageSourceName, this.storageType);
    }

    this.parentWindow = window;

    logger.warn(`Opening auth window for ${storageSourceName} (${this.storageType})`);

    await this.stashAuthData();

    if (authWindow) {
      this.authWindow = authWindow;
      // If the popup was opened BEFORE we stashed, its copy-on-open of
      // the opener's sessionStorage didn't capture the stash. Same-origin
      // so we can write into it directly before navigating.
      try {
        const stash = sessionStorage.getItem(StorageOAuthManager.AUTH_STORAGE_KEY);
        if (stash) {
          authWindow.sessionStorage.setItem(StorageOAuthManager.AUTH_STORAGE_KEY, stash);
        }
      } catch {
        // Cross-origin or closed popup — give up on the pre-copy and
        // rely on the popup's own (possibly empty) sessionStorage.
      }
      this.authWindow.location.assign(`${pagePath}/auth?miwake-init-auth=1`);
    } else {
      this.authWindow = StorageOAuthManager.createWindow(
        `${pagePath}/auth?miwake-init-auth=1`,
        'auth',
        Math.min(Math.max(this.parentWindow.innerWidth, 300), 560),
        Math.min(Math.max(this.parentWindow.innerHeight, 300), 560),
        window
      );
    }

    if (!this.authWindow) {
      // Popup blocked. Surface the message dialog (a user gesture) and
      // retry by pre-opening a wait-window during the click.
      await messageDialog({
        title: 'Login Required',
        message: 'Log in to your cloud storage account when prompted.'
      });

      return this.doGetToken(
        window,
        storageSourceName,
        StorageOAuthManager.createWindow(
          `${pagePath}/auth?miwake-init-wait=1`,
          'auth',
          Math.min(Math.max(this.parentWindow.innerWidth, 300), 560),
          Math.min(Math.max(this.parentWindow.innerHeight, 300), 560),
          window
        )
      );
    }

    // 5. Wait for popup auth result and persist refresh token
    let errorMessage = '';

    try {
      token = await this.waitForAuth(window);

      storageOAuthTokens.set(storageSourceName, token);

      if (token.refreshToken && token.refreshToken !== this.remoteData.refreshToken) {
        this.remoteData.refreshToken = token.refreshToken;

        try {
          const db = await database.db;
          const existingStorageSourceData = storageSource || {
            storedInManager: false,
            encryptionDisabled: true
          };

          await db.put('storageSource', {
            ...existingStorageSourceData,
            name: storageSourceName,
            type: this.storageType,
            data: {
              clientId: this.remoteData.clientId,
              clientSecret: this.remoteData.clientSecret,
              refreshToken: token.refreshToken
            },
            lastSourceModified: Date.now()
          });
        } catch (err: any) {
          logger.error(`Error updating refresh token for ${storageSourceName}: ${err.message}`);
        }
      }
    } catch (error: any) {
      errorMessage = error.message;
    } finally {
      this.clearAuthData();
    }

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return token?.accessToken;
  }

  private async verifyToken(token: OAuthTokenData | undefined) {
    if (!token && !this.remoteData) {
      return undefined;
    }

    if (token && token.expiration > Date.now()) {
      return token;
    }

    return this.refreshToken();
  }

  private async refreshToken() {
    if (
      !(
        this.refreshEndpoint &&
        this.storageSourceName &&
        this.remoteData?.clientId &&
        this.remoteData.refreshToken
      )
    ) {
      logger.debug(
        `refreshToken: silent early-return — ` +
          `refreshEndpoint=${!!this.refreshEndpoint}, ` +
          `storageSourceName=${JSON.stringify(this.storageSourceName ?? null)}, ` +
          `clientId=${!!this.remoteData?.clientId}, ` +
          `refreshToken=${!!this.remoteData?.refreshToken}`
      );
      return undefined;
    }
    logger.debug(`refreshToken: posting to ${this.refreshEndpoint} for ${this.storageSourceName}`);

    const form = new FormData();
    form.append('client_id', this.remoteData.clientId);
    form.append('refresh_token', this.remoteData.refreshToken);
    form.append('grant_type', 'refresh_token');

    if (this.storageType === StorageKey.GDRIVE) {
      form.append('client_secret', this.remoteData.clientSecret);
    }

    const response = await fetch(this.refreshEndpoint, { method: 'POST', body: form })
      .then(async (httpResponse) => {
        if (!httpResponse.ok) {
          throw new Error(await convertAuthErrorResponse(httpResponse));
        }

        return httpResponse.json();
      })
      .catch((error) => {
        logger.error(`Unable to refresh token for ${this.storageSourceName}: ${error.message}`);
        return undefined;
      });

    if (!response) {
      this.remoteData.refreshToken = undefined;
      return undefined;
    }

    const { access_token: accessToken, expires_in: expiration, scope } = response;

    if (!accessToken || !expiration || !scope) {
      this.remoteData.refreshToken = undefined;
      logger.error(
        `A required authentication property was not found\nhad token: ${!!accessToken}\nhad expiration: ${!!expiration}\nhad scope: ${!!scope}`
      );
      return undefined;
    }

    const token: OAuthTokenData = {
      accessToken,
      scope,
      expiration: Date.now() + (Number.parseInt(expiration, 10) - 600) * 1000,
      refreshToken: this.remoteData.refreshToken
    };

    storageOAuthTokens.set(this.storageSourceName, token);

    return token;
  }

  private static base64Url(buffer: Uint8Array) {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async stashAuthData() {
    if (!this.remoteData) {
      return;
    }

    if (!this.codeVerifier) {
      const arr = new Uint8Array(32);
      crypto.getRandomValues(arr);
      this.codeVerifier = StorageOAuthManager.base64Url(arr);
    }

    const codeChallenge = StorageOAuthManager.base64Url(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.codeVerifier))
      )
    );

    const authData = {
      ...this.remoteData,
      ...StorageOAuthManager.getAuthVariables(this.storageType),
      needsRefreshToken: !this.remoteData.refreshToken,
      codeVerifier: this.codeVerifier,
      codeChallenge
    };

    sessionStorage.setItem(StorageOAuthManager.AUTH_STORAGE_KEY, JSON.stringify(authData));
  }

  private waitForAuth(window: Window): Promise<OAuthTokenData> {
    return new Promise((resolve, reject) => {
      if (!this.parentWindow) {
        reject(new Error('Parent window not defined'));
        return;
      }

      this.authResolver = resolve;
      this.authRejector = reject;

      this.broadcastChannel = new BroadcastChannel(StorageOAuthManager.AUTH_CHANNEL);
      this.broadcastChannel.onmessage = (event: MessageEvent) => {
        if (!this.authResolver || !this.authRejector) {
          return;
        }

        switch (event.data.type) {
          case 'auth':
            this.authResolver(event.data.payload);
            break;
          case 'failure':
            logger.error(event.data.payload.detail);
            this.authRejector(new Error(event.data.payload.message));
            break;
          default:
            break;
        }
      };

      this.authTimeoutTimer = window.setTimeout(() => {
        reject(
          new Error(
            `Login timeout for ${this.storageSourceName} (${this.storageType}) after ${this.authTimeout / 1000}s`
          )
        );
      }, this.authTimeout);
    });
  }

  private clearAuthData() {
    clearTimeout(this.authTimeoutTimer);

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = undefined;
    }

    sessionStorage.removeItem(StorageOAuthManager.AUTH_STORAGE_KEY);

    this.authResolver = undefined;
    this.authRejector = undefined;
    this.parentWindow = undefined;
    this.authWindow = null;
    this.codeVerifier = '';
  }

  static createWindow(url: string, title: string, w: number, h: number, window: Window) {
    const onMobile = isMobile(window);
    const screenX = typeof window.screenX !== 'undefined' ? window.screenX : window.screenLeft;
    const screenY = typeof window.screenY !== 'undefined' ? window.screenY : window.screenTop;
    const outerWidth =
      typeof window.outerWidth !== 'undefined'
        ? window.outerWidth
        : document.documentElement.clientWidth;
    const outerHeight =
      typeof window.outerHeight !== 'undefined'
        ? window.outerHeight
        : document.documentElement.clientHeight - 22;
    const targetWidth = onMobile ? null : w;
    const targetHeight = onMobile ? null : h;
    const V = screenX < 0 ? window.screen.width + screenX : screenX;
    const left = targetWidth ? parseInt(`${V + (outerWidth - targetWidth) / 2}`, 10) : 0;
    const right = targetHeight
      ? parseInt(`${screenY + (outerHeight - targetHeight) / 2.5}`, 10)
      : 0;
    const features = [];

    if (targetWidth !== null) {
      features.push(`width=${targetWidth}`);
    }

    if (targetHeight !== null) {
      features.push(`height=${targetHeight}`);
    }

    features.push(`left=${left}`);
    features.push(`top=${right}`);
    features.push('scrollbars=1');

    const newWindow = window.open(url, title, features.join(','));

    return newWindow;
  }

  static getAuthVariables(target: StorageKey) {
    switch (target) {
      case StorageKey.GDRIVE:
        return {
          authEndpoint: gDriveAuthEndpoint,
          tokenEndpoint: gDriveTokenEndpoint,
          scope: gDriveScope
        };

      case StorageKey.ONEDRIVE:
        return {
          authEndpoint: oneDriveAuthEndpoint,
          tokenEndpoint: oneDriveTokenEndpoint,
          scope: oneDriveScope
        };

      default:
        return {};
    }
  }

  static revokeToken(revokeEndpoint: string, token: string) {
    const params = new URLSearchParams();

    params.append('token', token);

    fetch(`${revokeEndpoint}?${params.toString()}`, { method: 'POST' }).catch(() => {
      // no-op
    });
  }
}
