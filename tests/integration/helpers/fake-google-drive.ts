import { Buffer } from 'node:buffer';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { snapshotSyncRoot, type SyncRootSnapshotEntry } from './harness.ts';
import type { LibraryBookFixture } from './fixtures.ts';
import { syncBookFixturesToSource } from './workflows.ts';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth**';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files**';
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_NAME = 'Miwake Reader';

interface FakeDriveFolder {
  id: string;
  name: string;
}

interface FakeDriveFile {
  data: Uint8Array<ArrayBuffer>;
  id: string;
  name: string;
  parentId: string;
}

/**
 * Stateful HTTP-boundary fake for the Google OAuth and Drive APIs used by the app. Application
 * modules, popup orchestration, token persistence, XHR, replication, and IndexedDB remain real.
 */
export class FakeGoogleDrive {
  #accessTokenSequence = 0;
  #authorizationCodeExchanges = 0;
  #authorizationSequence = 0;
  #failedRefreshes = 0;
  #rejectRefreshTokens = false;
  readonly #accessTokens = new Set<string>();
  readonly #authorizationCodes = new Set<string>();
  readonly #folders: FakeDriveFolder[] = [];
  readonly #files: FakeDriveFile[] = [];
  readonly #refreshTokens = new Set<string>();
  readonly #rootId = 'fake-drive-root';

  get authorizationCodeExchanges(): number {
    return this.#authorizationCodeExchanges;
  }

  get failedRefreshes(): number {
    return this.#failedRefreshes;
  }

  /** Builds provider-neutral book artifacts through the real replication path, then serves them
   * through the fake Drive API. */
  static async fromBookFixtures(
    page: Page,
    fixtures: readonly LibraryBookFixture[]
  ): Promise<FakeGoogleDrive> {
    await syncBookFixturesToSource(page, fixtures);
    return new FakeGoogleDrive(await snapshotSyncRoot(page));
  }

  constructor(snapshot: SyncRootSnapshotEntry[]) {
    let folderSequence = 0;
    let fileSequence = 0;

    for (const entry of snapshot) {
      if (entry.kind === 'file') {
        this.#files.push({
          data: entry.data,
          id: `fake-drive-file-${fileSequence++}`,
          name: entry.name,
          parentId: this.#rootId
        });
        continue;
      }

      const folder = { id: `fake-drive-folder-${folderSequence++}`, name: entry.name };
      this.#folders.push(folder);
      for (const child of entry.entries) {
        if (child.kind === 'directory') {
          throw new Error(`FakeGoogleDrive does not support nested directory ${child.name}`);
        }
        this.#files.push({
          data: child.data,
          id: `fake-drive-file-${fileSequence++}`,
          name: child.name,
          parentId: folder.id
        });
      }
    }
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route(AUTH_URL, (route) => this.#authorize(route));
    await context.route(TOKEN_URL, (route) => this.#exchangeToken(route));
    await context.route(DRIVE_FILES_URL, (route) => this.#handleDriveRequest(route));
  }

  expireRefreshToken(): void {
    this.#refreshTokens.clear();
    this.#rejectRefreshTokens = true;
  }

  async #authorize(route: Route): Promise<void> {
    const requestURL = new URL(route.request().url());
    const redirectURL = new URL(requestURL.searchParams.get('redirect_uri')!);
    const code = `fake-authorization-code-${++this.#authorizationSequence}`;
    this.#authorizationCodes.add(code);
    redirectURL.searchParams.set('code', code);
    await route.fulfill({
      status: 302,
      headers: { location: redirectURL.href }
    });
  }

  async #exchangeToken(route: Route): Promise<void> {
    const params = new URLSearchParams(route.request().postData() ?? '');
    const grantType = params.get('grant_type');

    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      await fulfillJSON(route, { error: 'unsupported_grant_type' }, 400);
      return;
    }

    if (grantType === 'authorization_code') {
      const code = params.get('code') ?? '';
      if (!this.#authorizationCodes.delete(code)) {
        await fulfillJSON(route, { error: 'invalid_grant' }, 400);
        return;
      }
      this.#authorizationCodeExchanges += 1;
      this.#rejectRefreshTokens = false;
    } else {
      const refreshToken = params.get('refresh_token') ?? '';
      if (this.#rejectRefreshTokens) {
        this.#failedRefreshes += 1;
        await fulfillJSON(
          route,
          { error: 'invalid_grant', error_description: 'The fake refresh token has expired.' },
          400
        );
        return;
      }
      if (!this.#refreshTokens.has(refreshToken)) {
        await fulfillJSON(route, { error: 'invalid_grant' }, 400);
        return;
      }
    }

    const accessToken = `fake-access-token-${++this.#accessTokenSequence}`;
    this.#accessTokens.add(accessToken);
    const response: Record<string, string | number> = {
      access_token: accessToken,
      expires_in: 3600,
      scope: DRIVE_SCOPE,
      token_type: 'Bearer'
    };
    if (grantType === 'authorization_code') {
      const refreshToken = `fake-refresh-token-${this.#authorizationCodeExchanges}`;
      this.#refreshTokens.add(refreshToken);
      response.refresh_token = refreshToken;
    }
    await fulfillJSON(route, response);
  }

  async #handleDriveRequest(route: Route): Promise<void> {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    const authorization = request.headers().authorization;
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!this.#accessTokens.has(accessToken)) {
      await fulfillJSON(route, { error: { message: 'Missing fake access token' } }, 401);
      return;
    }

    const requestURL = new URL(request.url());
    const fileId = /^\/drive\/v3\/files\/([^/]+)$/.exec(requestURL.pathname)?.[1];
    if (fileId && requestURL.searchParams.get('alt') === 'media') {
      const file = this.#files.find((candidate) => candidate.id === fileId);
      if (!file) {
        await fulfillJSON(route, { error: { message: 'File not found' } }, 404);
        return;
      }
      await route.fulfill({
        body: Buffer.from(file.data),
        headers: {
          ...corsHeaders(),
          'content-type': contentTypeFor(file.name)
        }
      });
      return;
    }

    if (request.method() !== 'GET' || fileId) {
      await fulfillJSON(route, { error: { message: 'Unsupported fake Drive request' } }, 400);
      return;
    }

    await fulfillJSON(route, { files: this.#listFiles(requestURL.searchParams.get('q') ?? '') });
  }

  #listFiles(query: string) {
    const wantsFolders =
      query.includes(`mimeType='${DRIVE_FOLDER_MIME_TYPE}'`) ||
      query.includes(`mimeType = '${DRIVE_FOLDER_MIME_TYPE}'`);

    if (
      wantsFolders &&
      query.includes("'root' in parents") &&
      query.includes(`name = "${ROOT_NAME}"`)
    ) {
      return [{ id: this.#rootId, name: ROOT_NAME, mimeType: DRIVE_FOLDER_MIME_TYPE }];
    }

    if (wantsFolders && query.includes(`'${this.#rootId}' in parents`)) {
      const requestedName = /name = "(?<name>[^"]+)"/.exec(query)?.groups?.name;
      return this.#folders
        .filter((folder) => requestedName === undefined || folder.name === requestedName)
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          mimeType: DRIVE_FOLDER_MIME_TYPE,
          parents: [this.#rootId]
        }));
    }

    if (
      query.includes(`mimeType!='${DRIVE_FOLDER_MIME_TYPE}'`) &&
      query.includes(`'${this.#rootId}' in parents`)
    ) {
      return this.#files
        .filter((file) => file.parentId === this.#rootId)
        .map((file) => ({ id: file.id, name: file.name, parents: [this.#rootId] }));
    }

    return this.#files
      .filter((file) => query.includes(`'${file.parentId}' in parents`))
      .map((file) => ({ id: file.id, name: file.name, parents: [file.parentId] }));
  }
}

async function fulfillJSON(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    body: JSON.stringify(data),
    headers: { ...corsHeaders(), 'content-type': 'application/json' }
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-origin': '*'
  };
}

function contentTypeFor(filename: string): string {
  switch (filename.split('.').at(-1)?.toLowerCase()) {
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'json':
      return 'application/json';
    case 'png':
      return 'image/png';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}
