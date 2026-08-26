import { createHash } from 'node:crypto';
import type { BrowserContext, Page, Route } from '@playwright/test';
import type { LibraryBookFixture } from './fixtures.ts';
import {
  bearerToken,
  contentTypeFor,
  corsHeaders,
  fulfillBytes,
  fulfillJSON
} from './fake-cloud-http.ts';
import { FakeCloudStorage, type FakeCloudFile, type FakeCloudItem } from './fake-cloud-storage.ts';
import { snapshotSyncRoot, type SyncRootSnapshotEntry } from './harness.ts';
import { syncBookFixturesToSource } from './workflows.ts';

const AUTH_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize**';
const DEFAULT_TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GRAPH_APP_ROOT_URL = 'https://graph.microsoft.com/v1.0/me/drive/special/approot**';
const GRAPH_BATCH_URL = 'https://graph.microsoft.com/v1.0/$batch';
const GRAPH_ITEMS_URL = 'https://graph.microsoft.com/v1.0/me/drive/items**';
const THUMBNAIL_URL = 'https://fake-onedrive-content.test/thumbnails/**';
const UPLOAD_URL = 'https://fake-onedrive-upload.test/**';
const ONEDRIVE_SCOPE = 'files.readwrite.appfolder offline_access';

export const FAKE_ONEDRIVE_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

interface FakeOneDriveOptions {
  clientId?: string;
  clientSecret?: string;
  tokenEndpoint?: string;
}

interface AuthorizationCodeData {
  clientId: string;
  codeChallenge: string;
  redirectURI: string;
}

export interface FakeOneDriveTokenRequest {
  clientId: string;
  clientSecret: string | null;
  grantType: 'authorization_code' | 'refresh_token';
  refreshToken: string | null;
  tokenEndpoint: string;
}

interface UploadSession {
  existingFileId?: string;
  id: string;
  name: string;
  parentId: string;
}

interface GraphBatchRequest {
  id: string;
  method: string;
  url: string;
}

/**
 * Stateful HTTP-boundary fake for the OAuth and Microsoft Graph APIs used by OneDrive sync.
 * Popup orchestration, token persistence, XHR, replication, and IndexedDB remain real.
 */
export class FakeOneDrive {
  #accessTokenSequence = 0;
  #authorizationCodeExchanges = 0;
  #authorizationSequence = 0;
  #failedRefreshes = 0;
  #refreshExchanges = 0;
  #refreshTokenSequence = 0;
  #uploadSessionSequence = 0;
  readonly #accessTokens = new Set<string>();
  readonly #authorizationCodes = new Map<string, AuthorizationCodeData>();
  readonly #clientId: string;
  readonly #clientSecret: string | undefined;
  readonly #refreshTokens = new Set<string>();
  readonly #storage: FakeCloudStorage;
  readonly #tokenEndpoint: string;
  readonly #tokenRequests: FakeOneDriveTokenRequest[] = [];
  readonly #uploadSessions = new Map<string, UploadSession>();

  get authorizationCodeExchanges(): number {
    return this.#authorizationCodeExchanges;
  }

  get failedRefreshes(): number {
    return this.#failedRefreshes;
  }

  get refreshExchanges(): number {
    return this.#refreshExchanges;
  }

  get tokenRequests(): readonly FakeOneDriveTokenRequest[] {
    return this.#tokenRequests.map((request) => ({ ...request }));
  }

  static async fromBookFixtures(
    page: Page,
    fixtures: readonly LibraryBookFixture[],
    options?: FakeOneDriveOptions
  ): Promise<FakeOneDrive> {
    await syncBookFixturesToSource(page, fixtures);
    return new FakeOneDrive(await snapshotSyncRoot(page), options);
  }

  constructor(snapshot: readonly SyncRootSnapshotEntry[], options: FakeOneDriveOptions = {}) {
    this.#clientId = options.clientId ?? FAKE_ONEDRIVE_CLIENT_ID;
    this.#clientSecret = options.clientSecret;
    this.#tokenEndpoint = options.tokenEndpoint ?? DEFAULT_TOKEN_URL;
    this.#storage = new FakeCloudStorage(snapshot, 'fake-onedrive-approot');
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route(AUTH_URL, (route) => this.#authorize(route));
    await context.route(this.#tokenEndpoint, (route) => this.#exchangeToken(route));
    await context.route(GRAPH_APP_ROOT_URL, (route) => this.#handleAppRootRequest(route));
    await context.route(GRAPH_BATCH_URL, (route) => this.#handleBatchRequest(route));
    await context.route(GRAPH_ITEMS_URL, (route) => this.#handleItemsRequest(route));
    await context.route(THUMBNAIL_URL, (route) => this.#handleThumbnailRequest(route));
    await context.route(UPLOAD_URL, (route) => this.#handleUploadRequest(route));
  }

  expireRefreshToken(): void {
    this.#refreshTokens.clear();
  }

  hasBook(title: string): boolean {
    return this.#storage.hasFolder(title);
  }

  hasBookData(title: string): boolean {
    return this.#storage.fileNamesInFolder(title).some((name) => name.startsWith('bookdata_'));
  }

  bookFileNames(title: string): string[] {
    return this.#storage.fileNamesInFolder(title);
  }

  async #authorize(route: Route): Promise<void> {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, body: 'Authorization requests must use GET' });
      return;
    }

    const requestURL = new URL(route.request().url());
    const redirectURI = requestURL.searchParams.get('redirect_uri');
    if (!redirectURI) {
      await route.fulfill({ status: 400, body: 'Missing redirect_uri' });
      return;
    }

    const validationError = this.#validateAuthorizationRequest(requestURL);
    if (validationError) {
      const redirectURL = new URL(redirectURI);
      redirectURL.searchParams.set('error', 'invalid_request');
      redirectURL.searchParams.set('error_description', validationError);
      await route.fulfill({ status: 302, headers: { location: redirectURL.href } });
      return;
    }

    const code = `fake-onedrive-authorization-code-${++this.#authorizationSequence}`;
    this.#authorizationCodes.set(code, {
      clientId: requestURL.searchParams.get('client_id')!,
      codeChallenge: requestURL.searchParams.get('code_challenge')!,
      redirectURI
    });

    const redirectURL = new URL(redirectURI);
    redirectURL.searchParams.set('code', code);
    await route.fulfill({ status: 302, headers: { location: redirectURL.href } });
  }

  #validateAuthorizationRequest(requestURL: URL): string | undefined {
    if (requestURL.searchParams.get('client_id') !== this.#clientId) return 'Unexpected client_id';
    if (!hasSameSpaceSeparatedValues(requestURL.searchParams.get('scope'), ONEDRIVE_SCOPE)) {
      return 'Unexpected scope';
    }
    if (requestURL.searchParams.get('response_type') !== 'code') return 'Unexpected response_type';
    if (requestURL.searchParams.get('code_challenge_method') !== 'S256') {
      return 'Unexpected code_challenge_method';
    }
    if (!/^[\w-]{43}$/.test(requestURL.searchParams.get('code_challenge') ?? '')) {
      return 'Unexpected code_challenge';
    }
    if (requestURL.searchParams.has('access_type') || requestURL.searchParams.has('prompt')) {
      return 'Google-only authorization parameters were sent to OneDrive';
    }
    return undefined;
  }

  async #exchangeToken(route: Route): Promise<void> {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    if (route.request().method() !== 'POST') {
      await fulfillJSON(route, { error: 'unsupported_request' }, 400);
      return;
    }
    if (route.request().headers()['content-type'] !== 'application/x-www-form-urlencoded') {
      await fulfillJSON(route, { error: 'invalid_request' }, 400);
      return;
    }

    const params = new URLSearchParams(route.request().postData() ?? '');
    const grantType = params.get('grant_type');
    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      await fulfillJSON(route, { error: 'unsupported_grant_type' }, 400);
      return;
    }

    this.#tokenRequests.push({
      clientId: params.get('client_id') ?? '',
      clientSecret: params.get('client_secret'),
      grantType,
      refreshToken: params.get('refresh_token'),
      tokenEndpoint: route.request().url()
    });

    if (!this.#hasExpectedCredentials(params)) {
      await fulfillJSON(route, { error: 'invalid_client' }, 401);
      return;
    }

    let refreshToken: string;
    if (grantType === 'authorization_code') {
      const code = params.get('code') ?? '';
      const codeData = this.#authorizationCodes.get(code);
      if (
        !codeData ||
        codeData.clientId !== params.get('client_id') ||
        codeData.redirectURI !== params.get('redirect_uri') ||
        createHash('sha256')
          .update(params.get('code_verifier') ?? '')
          .digest('base64url') !== codeData.codeChallenge
      ) {
        await fulfillJSON(route, { error: 'invalid_grant' }, 400);
        return;
      }
      this.#authorizationCodes.delete(code);
      this.#authorizationCodeExchanges += 1;
      refreshToken = this.#issueRefreshToken();
    } else {
      const suppliedRefreshToken = params.get('refresh_token') ?? '';
      if (!this.#refreshTokens.delete(suppliedRefreshToken)) {
        this.#failedRefreshes += 1;
        await fulfillJSON(
          route,
          { error: 'invalid_grant', error_description: 'The fake refresh token is invalid.' },
          400
        );
        return;
      }
      this.#refreshExchanges += 1;
      refreshToken = this.#issueRefreshToken();
    }

    const accessToken = `fake-onedrive-access-token-${++this.#accessTokenSequence}`;
    this.#accessTokens.add(accessToken);
    await fulfillJSON(route, {
      access_token: accessToken,
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: ONEDRIVE_SCOPE,
      token_type: 'Bearer'
    });
  }

  #hasExpectedCredentials(params: URLSearchParams): boolean {
    if (params.get('client_id') !== this.#clientId) return false;
    if (this.#clientSecret === undefined) return !params.has('client_secret');
    return params.get('client_secret') === this.#clientSecret;
  }

  #issueRefreshToken(): string {
    const refreshToken = `fake-onedrive-refresh-token-${++this.#refreshTokenSequence}`;
    this.#refreshTokens.add(refreshToken);
    return refreshToken;
  }

  async #handleAppRootRequest(route: Route): Promise<void> {
    if (await this.#handleGraphPreflightOrUnauthorized(route)) return;
    const request = route.request();
    const searchParams = new URL(request.url()).searchParams;
    if (
      request.method() !== 'GET' ||
      !hasOnlyUniqueQueryParameters(searchParams, ['$select']) ||
      searchParams.get('$select') !== 'id'
    ) {
      await this.#fulfillGraphError(route, 'Unsupported approot request', 501);
      return;
    }
    await fulfillJSON(route, { id: this.#storage.rootId });
  }

  async #handleBatchRequest(route: Route): Promise<void> {
    if (await this.#handleGraphPreflightOrUnauthorized(route)) return;
    if (route.request().method() !== 'POST') {
      await this.#fulfillGraphError(route, 'Unsupported batch request', 501);
      return;
    }

    const body = route.request().postDataJSON() as { requests?: unknown[] };
    if (
      !Array.isArray(body.requests) ||
      body.requests.length === 0 ||
      body.requests.length > 20 ||
      !body.requests.every(isGraphBatchRequest) ||
      new Set(body.requests.map((request) => request.id)).size !== body.requests.length
    ) {
      await this.#fulfillGraphError(route, 'Invalid Graph batch body', 400);
      return;
    }

    const responses = body.requests.map((request) => {
      const requestURL = new URL(request.url, 'https://graph.microsoft.com');
      const parentId = /^\/me\/drive\/items\/([^/]+)\/children$/.exec(requestURL.pathname)?.[1];
      const hasExpectedQuery =
        hasOnlyUniqueQueryParameters(requestURL.searchParams, ['select', 'expand']) &&
        hasSameUniqueCommaSeparatedValues(requestURL.searchParams.get('select'), 'id,name') &&
        requestURL.searchParams.get('expand') === 'thumbnails(select=large)';
      if (request.method !== 'GET' || !parentId || !hasExpectedQuery) {
        return {
          id: request.id,
          status: 400,
          body: { error: { message: 'Invalid fake Graph batch subrequest' } }
        };
      }
      if (!this.#isFolder(parentId)) {
        return {
          id: request.id,
          status: 404,
          body: { error: { message: 'Parent folder not found' } }
        };
      }
      return {
        id: request.id,
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          value: this.#storage.listChildren(parentId).map((item) => this.#toDriveItem(item, true))
        }
      };
    });
    await fulfillJSON(route, { responses });
  }

  async #handleItemsRequest(route: Route): Promise<void> {
    if (await this.#handleGraphPreflightOrUnauthorized(route)) return;

    const request = route.request();
    const requestURL = new URL(request.url());
    const path = requestURL.pathname;
    const childrenMatch = /^\/v1\.0\/me\/drive\/items\/([^/]+)\/children$/.exec(path);
    const contentMatch = /^\/v1\.0\/me\/drive\/items\/([^/]+)\/content$/.exec(path);
    const newUploadMatch = /^\/v1\.0\/me\/drive\/items\/([^/]+):\/(.+):\/createUploadSession$/.exec(
      path
    );
    const existingUploadMatch = /^\/v1\.0\/me\/drive\/items\/([^/]+)\/createUploadSession$/.exec(
      path
    );
    const itemMatch = /^\/v1\.0\/me\/drive\/items\/([^/]+)$/.exec(path);

    if (request.method() === 'GET' && childrenMatch) {
      await this.#listChildren(route, childrenMatch[1], requestURL.searchParams);
      return;
    }
    if (request.method() === 'GET' && contentMatch) {
      await this.#downloadFile(route, contentMatch[1]);
      return;
    }
    if (request.method() === 'POST' && childrenMatch) {
      await this.#createFolder(route, childrenMatch[1]);
      return;
    }
    if (request.method() === 'POST' && newUploadMatch) {
      await this.#createUploadSession(
        route,
        newUploadMatch[1],
        decodeURIComponent(newUploadMatch[2])
      );
      return;
    }
    if (request.method() === 'POST' && existingUploadMatch) {
      await this.#createUploadSession(route, undefined, undefined, existingUploadMatch[1]);
      return;
    }
    if (request.method() === 'PATCH' && itemMatch) {
      await this.#renameItem(route, itemMatch[1]);
      return;
    }
    if (request.method() === 'DELETE' && itemMatch) {
      if (!this.#storage.delete(itemMatch[1])) {
        await this.#fulfillGraphError(route, 'Item not found', 404);
        return;
      }
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    await this.#fulfillGraphError(route, 'Unsupported fake Graph items request', 501);
  }

  async #listChildren(
    route: Route,
    parentId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    if (!this.#isFolder(parentId)) {
      await this.#fulfillGraphError(route, 'Parent folder not found', 404);
      return;
    }

    const filter = searchParams.get('filter');
    const expand = searchParams.get('expand');
    if (
      !hasOnlyUniqueQueryParameters(searchParams, ['select', 'filter', 'expand']) ||
      !hasSameUniqueCommaSeparatedValues(searchParams.get('select'), 'id,name,file,folder') ||
      (filter !== null && filter !== 'folder ne null') ||
      (expand !== null && expand !== 'thumbnails')
    ) {
      await this.#fulfillGraphError(route, 'Invalid children-list query', 400);
      return;
    }

    const foldersOnly = filter === 'folder ne null';
    const withThumbnails = expand === 'thumbnails';
    const children = this.#storage
      .listChildren(parentId)
      .filter((item) => !foldersOnly || item.kind === 'folder')
      .map((item) => this.#toDriveItem(item, withThumbnails));
    await fulfillJSON(route, { value: children });
  }

  #isFolder(id: string): boolean {
    return id === this.#storage.rootId || this.#storage.get(id)?.kind === 'folder';
  }

  async #downloadFile(route: Route, id: string): Promise<void> {
    const item = this.#storage.get(id);
    if (!item || item.kind !== 'file') {
      await this.#fulfillGraphError(route, 'File not found', 404);
      return;
    }
    await fulfillBytes(route, item.data, contentTypeFor(item.name));
  }

  async #createFolder(route: Route, parentId: string): Promise<void> {
    const body = route.request().postDataJSON() as {
      '@microsoft.graph.conflictBehavior'?: string;
      folder?: Record<string, never>;
      name?: string;
    };
    if (
      !body.name ||
      body.folder === undefined ||
      body['@microsoft.graph.conflictBehavior'] !== 'fail'
    ) {
      await this.#fulfillGraphError(route, 'Invalid folder body', 400);
      return;
    }
    try {
      const folder = this.#storage.createFolder(parentId, body.name);
      await fulfillJSON(route, this.#toDriveItem(folder), 201);
    } catch (error) {
      await this.#fulfillGraphError(route, (error as Error).message, 409);
    }
  }

  async #createUploadSession(
    route: Route,
    parentId?: string,
    pathName?: string,
    existingFileId?: string
  ): Promise<void> {
    const body = route.request().postDataJSON() as { item?: { name?: string } };
    const existing = existingFileId ? this.#storage.get(existingFileId) : undefined;
    if (existingFileId && (!existing || existing.kind !== 'file')) {
      await this.#fulfillGraphError(route, 'Upload target not found', 404);
      return;
    }

    const targetParentId = existing?.parentId ?? parentId;
    const targetName = existing?.name ?? pathName;
    if (!targetParentId || !targetName || body.item?.name !== targetName) {
      await this.#fulfillGraphError(route, 'Invalid upload-session target', 400);
      return;
    }

    const id = `fake-onedrive-upload-session-${++this.#uploadSessionSequence}`;
    this.#uploadSessions.set(id, {
      existingFileId,
      id,
      name: targetName,
      parentId: targetParentId
    });
    await fulfillJSON(route, {
      expirationDateTime: '2099-01-01T00:00:00.000Z',
      uploadUrl: `https://fake-onedrive-upload.test/session/${id}?opaque=${id}`
    });
  }

  async #renameItem(route: Route, id: string): Promise<void> {
    const body = route.request().postDataJSON() as { name?: string };
    if (!body.name) {
      await this.#fulfillGraphError(route, 'Missing item name', 400);
      return;
    }
    try {
      await fulfillJSON(route, this.#toDriveItem(this.#storage.rename(id, body.name)));
    } catch (error) {
      await this.#fulfillGraphError(route, (error as Error).message, 404);
    }
  }

  async #handleUploadRequest(route: Route): Promise<void> {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    if (bearerToken(route)) {
      await fulfillJSON(
        route,
        { error: { message: 'Upload URLs must not receive bearer tokens' } },
        401
      );
      return;
    }

    const requestURL = new URL(request.url());
    const id = /^\/session\/([^/]+)$/.exec(requestURL.pathname)?.[1];
    const session = id ? this.#uploadSessions.get(id) : undefined;
    if (!id || !session) {
      await fulfillJSON(route, { error: { message: 'Upload session not found' } }, 404);
      return;
    }

    if (request.method() === 'DELETE') {
      if ([...requestURL.searchParams].length > 0) {
        await fulfillJSON(route, { error: { message: 'Invalid upload-session query' } }, 400);
        return;
      }
      this.#uploadSessions.delete(id);
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    if (request.method() !== 'PUT') {
      await fulfillJSON(route, { error: { message: 'Unsupported upload-session request' } }, 501);
      return;
    }

    if (
      !hasOnlyUniqueQueryParameters(requestURL.searchParams, ['opaque', 'select']) ||
      requestURL.searchParams.get('opaque') !== session.id ||
      !hasSameUniqueCommaSeparatedValues(requestURL.searchParams.get('select'), 'id,name')
    ) {
      await fulfillJSON(route, { error: { message: 'Invalid upload-session query' } }, 400);
      return;
    }
    const postData = request.postDataBuffer();
    const contentRange = request.headers()['content-range'];
    const match = /^bytes 0-(\d+)\/(\d+)$/.exec(contentRange ?? '');
    if (
      !postData ||
      !match ||
      Number(match[1]) !== postData.byteLength - 1 ||
      Number(match[2]) !== postData.byteLength
    ) {
      await fulfillJSON(route, { error: { message: 'Invalid Content-Range' } }, 400);
      return;
    }

    const file = this.#storage.putFile(
      session.parentId,
      session.name,
      Uint8Array.from(postData),
      session.existingFileId
    );
    this.#uploadSessions.delete(id);
    await fulfillJSON(route, this.#toDriveItem(file), session.existingFileId ? 200 : 201);
  }

  async #handleThumbnailRequest(route: Route): Promise<void> {
    if (route.request().method() !== 'GET') {
      await fulfillJSON(route, { error: { message: 'Unsupported thumbnail request' } }, 501);
      return;
    }
    const id = /^\/thumbnails\/([^/]+)$/.exec(new URL(route.request().url()).pathname)?.[1];
    const item = id ? this.#storage.get(id) : undefined;
    if (!item || item.kind !== 'file') {
      await fulfillJSON(route, { error: { message: 'Thumbnail not found' } }, 404);
      return;
    }
    await fulfillBytes(route, item.data, contentTypeFor(item.name));
  }

  async #handleGraphPreflightOrUnauthorized(route: Route): Promise<boolean> {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return true;
    }
    if (!this.#accessTokens.has(bearerToken(route))) {
      await this.#fulfillGraphError(route, 'Missing or invalid fake OneDrive access token', 401);
      return true;
    }
    return false;
  }

  #toDriveItem(item: FakeCloudItem, withThumbnails = false) {
    if (item.kind === 'folder') {
      return {
        id: item.id,
        name: item.name,
        folder: { childCount: this.#storage.listChildren(item.id).length }
      };
    }

    return {
      id: item.id,
      name: item.name,
      file: { mimeType: contentTypeFor(item.name) },
      ...(withThumbnails && item.name.startsWith('cover_')
        ? { thumbnails: [this.#thumbnail(item)] }
        : {})
    };
  }

  #thumbnail(file: FakeCloudFile) {
    return {
      id: '0',
      large: {
        height: 720,
        width: 720,
        url: `https://fake-onedrive-content.test/thumbnails/${file.id}`
      }
    };
  }

  async #fulfillGraphError(route: Route, message: string, status: number): Promise<void> {
    await fulfillJSON(route, { error: { code: 'fakeOneDriveError', message } }, status);
  }
}

function hasSameSpaceSeparatedValues(actual: string | null, expected: string): boolean {
  const values = spaceSeparatedValueList(actual);
  return (
    values.length === new Set(values).size &&
    setsEqual(new Set(values), new Set(spaceSeparatedValueList(expected)))
  );
}

function hasSameUniqueCommaSeparatedValues(actual: string | null, expected: string): boolean {
  const values = commaSeparatedValueList(actual);
  return (
    values.length === new Set(values).size &&
    setsEqual(new Set(values), commaSeparatedValues(expected))
  );
}

function spaceSeparatedValueList(value: string | null): string[] {
  return value?.trim().split(/\s+/).filter(Boolean) ?? [];
}

function commaSeparatedValues(value: string | null): Set<string> {
  return new Set(
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function commaSeparatedValueList(value: string | null): string[] {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function hasOnlyUniqueQueryParameters(
  searchParams: URLSearchParams,
  allowedNames: readonly string[]
): boolean {
  const names = [...searchParams.keys()];
  const allowed = new Set(allowedNames);
  return names.length === new Set(names).size && names.every((name) => allowed.has(name));
}

function setsEqual(actual: ReadonlySet<string>, expected: ReadonlySet<string>): boolean {
  return actual.size === expected.size && [...expected].every((item) => actual.has(item));
}

function isGraphBatchRequest(value: unknown): value is GraphBatchRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'method' in value &&
    typeof value.method === 'string' &&
    'url' in value &&
    typeof value.url === 'string'
  );
}
