import type { BrowserContext, Page, Route } from '@playwright/test';
import type { LibraryBookFixture } from './fixtures.ts';
import { FakeCloudStorage, type FakeCloudItem } from './fake-cloud-storage.ts';
import {
  bearerToken,
  contentTypeFor,
  corsHeaders,
  fulfillBytes,
  fulfillJSON
} from './fake-cloud-http.ts';
import { snapshotSyncRoot, type SyncRootSnapshotEntry } from './harness.ts';
import { syncBookFixturesToSource } from './workflows.ts';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth**';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files**';
const DRIVE_UPLOADS_URL = 'https://www.googleapis.com/upload/drive/v3/files**';
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_NAME = 'Miwake Reader';

interface FakeGoogleDriveOptions {
  expectedClientSecrets?: Readonly<Record<string, string>>;
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
  #refreshExchanges = 0;
  #rejectRefreshTokens = false;
  #rootPresent: boolean;
  readonly #accessTokens = new Set<string>();
  readonly #authorizationCodes = new Map<string, GoogleAuthorization>();
  readonly #expectedClientSecrets: ReadonlyMap<string, string>;
  readonly #refreshTokens = new Map<string, string>();
  readonly #storage: FakeCloudStorage;

  get authorizationCodeExchanges(): number {
    return this.#authorizationCodeExchanges;
  }

  get failedRefreshes(): number {
    return this.#failedRefreshes;
  }

  get refreshExchanges(): number {
    return this.#refreshExchanges;
  }

  /** Builds provider-neutral book artifacts through the real replication path, then serves them
   * through the fake Drive API. */
  static async fromBookFixtures(
    page: Page,
    fixtures: readonly LibraryBookFixture[],
    options?: FakeGoogleDriveOptions
  ): Promise<FakeGoogleDrive> {
    await syncBookFixturesToSource(page, fixtures);
    return new FakeGoogleDrive(await snapshotSyncRoot(page), options);
  }

  constructor(snapshot: readonly SyncRootSnapshotEntry[], options: FakeGoogleDriveOptions = {}) {
    this.#expectedClientSecrets = new Map(Object.entries(options.expectedClientSecrets ?? {}));
    this.#storage = new FakeCloudStorage(snapshot, 'fake-drive-root');
    this.#rootPresent = snapshot.length > 0;
  }

  hasBook(title: string): boolean {
    return this.#rootPresent && this.#storage.findFolder(this.#storage.rootId, title) !== undefined;
  }

  hasBookData(title: string): boolean {
    return this.bookFileNames(title).some((filename) => filename.startsWith('bookdata_'));
  }

  bookTitles(): string[] {
    if (!this.#rootPresent) return [];
    return this.#storage
      .listChildren(this.#storage.rootId)
      .filter((item) => item.kind === 'folder')
      .map((folder) => folder.name)
      .sort((a, b) => a.localeCompare(b));
  }

  bookFileNames(title: string): string[] {
    if (!this.#rootPresent) return [];
    return this.#storage.fileNamesInFolder(title);
  }

  rootFileNames(): string[] {
    if (!this.#rootPresent) return [];
    return this.#storage
      .listChildren(this.#storage.rootId)
      .filter((item) => item.kind === 'file')
      .map((file) => file.name)
      .sort((a, b) => a.localeCompare(b));
  }

  readingGoalStartDates(): string[] {
    if (!this.#rootPresent) return [];

    const startDates: string[] = [];
    for (const item of this.#storage.listChildren(this.#storage.rootId)) {
      if (item.kind !== 'file' || !item.name.startsWith('miwake-user-goals_')) continue;

      let goals: unknown;
      try {
        goals = JSON.parse(new TextDecoder().decode(item.data));
      } catch {
        throw new Error(
          `Fake Google Drive reading-goals file ${JSON.stringify(item.name)} contains malformed JSON`
        );
      }
      if (!Array.isArray(goals)) {
        throw new Error(
          `Fake Google Drive reading-goals file ${JSON.stringify(item.name)} must contain an array`
        );
      }

      for (const goal of goals) {
        if (!isRecord(goal) || typeof goal.goalStartDate !== 'string') {
          throw new Error(
            `Fake Google Drive reading-goals file ${JSON.stringify(item.name)} contains a malformed goal`
          );
        }
        startDates.push(goal.goalStartDate);
      }
    }

    return startDates.sort((a, b) => a.localeCompare(b));
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route(AUTH_URL, (route) => this.#authorize(route));
    await context.route(TOKEN_URL, (route) => this.#exchangeToken(route));
    await context.route(DRIVE_FILES_URL, (route) => this.#handleDriveRequest(route));
    await context.route(DRIVE_UPLOADS_URL, (route) => this.#handleDriveRequest(route));
  }

  expireRefreshToken(): void {
    this.#refreshTokens.clear();
    this.#rejectRefreshTokens = true;
  }

  async #authorize(route: Route): Promise<void> {
    if (route.request().method() !== 'GET') {
      await this.#failOAuth(route, 'invalid_request', 'Google authorization requests must use GET');
      return;
    }

    let authorization: GoogleAuthorization;
    try {
      authorization = parseGoogleAuthorization(new URL(route.request().url()));
    } catch (error) {
      await this.#failOAuth(route, 'invalid_request', errorMessage(error));
      return;
    }

    const code = `fake-authorization-code-${++this.#authorizationSequence}`;
    this.#authorizationCodes.set(code, authorization);
    const redirectURL = new URL(authorization.redirectURI);
    redirectURL.searchParams.set('code', code);
    await route.fulfill({
      status: 302,
      headers: { location: redirectURL.href }
    });
  }

  async #exchangeToken(route: Route): Promise<void> {
    const request = route.request();
    if (
      request.method() !== 'POST' ||
      !request.headers()['content-type']?.startsWith('application/x-www-form-urlencoded')
    ) {
      await this.#failOAuth(
        route,
        'invalid_request',
        'Google token exchanges must use a form-encoded POST'
      );
      return;
    }

    const params = new URLSearchParams(request.postData() ?? '');
    const grantType = params.get('grant_type');
    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      await this.#failOAuth(route, 'unsupported_grant_type', 'Unsupported Google OAuth grant');
      return;
    }

    if (grantType === 'authorization_code') {
      const code = params.get('code') ?? '';
      const authorization = this.#authorizationCodes.get(code);
      if (!authorization) {
        await this.#failOAuth(route, 'invalid_grant', 'Unknown or already-used authorization code');
        return;
      }
      this.#authorizationCodes.delete(code);

      if (
        params.get('client_id') !== authorization.clientId ||
        params.get('redirect_uri') !== authorization.redirectURI
      ) {
        await this.#failOAuth(
          route,
          'invalid_grant',
          'Authorization-code client or redirect URI does not match'
        );
        return;
      }
      if (!this.#hasExpectedClientSecret(params, authorization.clientId)) {
        await this.#failOAuth(route, 'invalid_client', 'Unexpected Google client secret');
        return;
      }

      const codeVerifier = params.get('code_verifier') ?? '';
      if (!codeVerifier || (await pkceChallengeFor(codeVerifier)) !== authorization.codeChallenge) {
        await this.#failOAuth(route, 'invalid_grant', 'PKCE code verifier does not match');
        return;
      }

      this.#authorizationCodeExchanges += 1;
      this.#rejectRefreshTokens = false;
    } else {
      const refreshToken = params.get('refresh_token') ?? '';
      if (this.#rejectRefreshTokens) {
        this.#failedRefreshes += 1;
        await this.#failOAuth(route, 'invalid_grant', 'The fake refresh token has expired.');
        return;
      }

      const expectedClientId = this.#refreshTokens.get(refreshToken);
      if (!expectedClientId) {
        await this.#failOAuth(route, 'invalid_grant', 'Unknown fake refresh token');
        return;
      }
      if (params.get('client_id') !== expectedClientId) {
        await this.#failOAuth(route, 'invalid_client', 'Refresh token belongs to another client');
        return;
      }
      if (!this.#hasExpectedClientSecret(params, expectedClientId)) {
        await this.#failOAuth(route, 'invalid_client', 'Unexpected Google client secret');
        return;
      }
      this.#refreshExchanges += 1;
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
      this.#refreshTokens.set(refreshToken, params.get('client_id')!);
      response.refresh_token = refreshToken;
    }
    await fulfillJSON(route, response);
  }

  #hasExpectedClientSecret(params: URLSearchParams, clientId: string): boolean {
    const expectedSecret = this.#expectedClientSecrets.get(clientId);
    const suppliedSecrets = params.getAll('client_secret');
    if (expectedSecret === undefined) {
      return suppliedSecrets.length === 0;
    }
    return suppliedSecrets.length === 1 && suppliedSecrets[0] === expectedSecret;
  }

  async #handleDriveRequest(route: Route): Promise<void> {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    if (!this.#accessTokens.has(bearerToken(route))) {
      await this.#fail(route, 'Missing or invalid fake access token', 401);
      return;
    }

    const requestURL = new URL(request.url());
    if (requestURL.pathname.startsWith('/upload/drive/v3/files')) {
      await this.#handleUploadRequest(route, requestURL);
      return;
    }

    if (requestURL.pathname.startsWith('/drive/v3/files')) {
      await this.#handleMetadataRequest(route, requestURL);
      return;
    }

    await this.#fail(route, `Unsupported fake Drive URL ${requestURL.pathname}`);
  }

  async #handleMetadataRequest(route: Route, requestURL: URL): Promise<void> {
    const request = route.request();
    const itemMatch = /^\/drive\/v3\/files\/(?<id>[^/]+)$/.exec(requestURL.pathname);
    const itemId = itemMatch?.groups?.id ? decodeURIComponent(itemMatch.groups.id) : undefined;

    if (requestURL.pathname === '/drive/v3/files') {
      if (request.method() === 'GET') {
        const query = requestURL.searchParams.get('q');
        if (!query || !isValidDriveListRequest(requestURL.searchParams)) {
          await this.#fail(route, 'Invalid fake Drive list query parameters');
          return;
        }

        try {
          await fulfillJSON(route, { files: this.#listFiles(query) });
        } catch (error) {
          await this.#fail(route, errorMessage(error));
        }
        return;
      }

      if (request.method() === 'POST') {
        await this.#createFolder(route);
        return;
      }

      await this.#fail(route, `Unsupported ${request.method()} on the fake Drive files collection`);
      return;
    }

    if (!itemId) {
      await this.#fail(route, `Malformed fake Drive item URL ${requestURL.pathname}`);
      return;
    }

    if (
      request.method() === 'GET' &&
      hasOnlyUniqueQueryParameters(requestURL.searchParams, ['alt']) &&
      requestURL.searchParams.get('alt') === 'media'
    ) {
      await this.#downloadFile(route, itemId);
      return;
    }

    if (request.method() === 'DELETE') {
      await this.#deleteItem(route, itemId);
      return;
    }

    await this.#fail(
      route,
      `Unsupported ${request.method()} for fake Drive item ${JSON.stringify(itemId)}`
    );
  }

  async #createFolder(route: Route): Promise<void> {
    const requestBody = route.request().postData();
    if (!requestBody) {
      await this.#fail(route, 'Fake Drive folder creation requires a JSON body');
      return;
    }

    let metadata: unknown;
    try {
      metadata = JSON.parse(requestBody);
    } catch {
      await this.#fail(route, 'Fake Drive folder creation received malformed JSON');
      return;
    }

    if (!isRecord(metadata)) {
      await this.#fail(route, 'Fake Drive folder metadata must be an object');
      return;
    }
    const { mimeType, name, parents } = metadata;
    if (
      mimeType !== DRIVE_FOLDER_MIME_TYPE ||
      typeof name !== 'string' ||
      name.length === 0 ||
      !isStringArray(parents) ||
      parents.length !== 1
    ) {
      await this.#fail(route, 'Malformed fake Drive folder metadata');
      return;
    }

    const parentId = parents[0];
    if (parentId === 'root') {
      if (name !== ROOT_NAME) {
        await this.#fail(route, `Unexpected fake Drive root folder ${JSON.stringify(name)}`);
        return;
      }
      if (this.#rootPresent) {
        await this.#fail(route, 'The fake Drive app root already exists', 409);
        return;
      }
      this.#rootPresent = true;
      await fulfillJSON(route, {
        id: this.#storage.rootId,
        name: ROOT_NAME,
        mimeType: DRIVE_FOLDER_MIME_TYPE,
        parents: ['root']
      });
      return;
    }

    if (!this.#rootPresent) {
      await this.#fail(route, 'Cannot create a fake Drive folder before the app root exists');
      return;
    }

    try {
      const folder = this.#storage.createFolder(parentId, name);
      await fulfillJSON(route, this.#driveItem(folder));
    } catch (error) {
      await this.#fail(route, errorMessage(error), 409);
    }
  }

  async #handleUploadRequest(route: Route, requestURL: URL): Promise<void> {
    const request = route.request();
    const itemMatch = /^\/upload\/drive\/v3\/files\/(?<id>[^/]+)$/.exec(requestURL.pathname);
    const itemId = itemMatch?.groups?.id ? decodeURIComponent(itemMatch.groups.id) : undefined;

    if (requestURL.searchParams.get('uploadType') !== 'multipart') {
      await this.#fail(route, 'Fake Drive supports only multipart uploads');
      return;
    }
    if (!this.#rootPresent) {
      await this.#fail(route, 'Cannot upload a fake Drive file before the app root exists');
      return;
    }
    if (
      (request.method() !== 'POST' || requestURL.pathname !== '/upload/drive/v3/files') &&
      (request.method() !== 'PATCH' || !itemId)
    ) {
      await this.#fail(route, `Unsupported ${request.method()} fake Drive upload`);
      return;
    }

    let upload: MultipartUpload;
    try {
      upload = await parseMultipartUpload(route);
    } catch (error) {
      await this.#fail(route, errorMessage(error));
      return;
    }

    if (request.method() === 'POST') {
      if (!upload.parentId) {
        await this.#fail(route, 'New fake Drive uploads require exactly one parent');
        return;
      }
      try {
        const file = this.#storage.putFile(upload.parentId, upload.name, upload.data);
        await fulfillJSON(route, this.#driveItem(file));
      } catch (error) {
        await this.#fail(route, errorMessage(error), 409);
      }
      return;
    }

    const existing = this.#storage.get(itemId!);
    if (!existing || existing.kind !== 'file') {
      await this.#fail(
        route,
        `Cannot update missing fake Drive file ${JSON.stringify(itemId)}`,
        404
      );
      return;
    }
    if (upload.parentId && upload.parentId !== existing.parentId) {
      await this.#fail(route, 'Fake Drive upload PATCH cannot move a file');
      return;
    }

    try {
      const file = this.#storage.putFile(existing.parentId, upload.name, upload.data, existing.id);
      await fulfillJSON(route, this.#driveItem(file));
    } catch (error) {
      await this.#fail(route, errorMessage(error));
    }
  }

  async #downloadFile(route: Route, itemId: string): Promise<void> {
    const item = this.#storage.get(itemId);
    if (!item || item.kind !== 'file') {
      await this.#fail(route, `Fake Drive file ${JSON.stringify(itemId)} was not found`, 404);
      return;
    }

    await fulfillBytes(route, item.data, contentTypeFor(item.name));
  }

  async #deleteItem(route: Route, itemId: string): Promise<void> {
    if (itemId === this.#storage.rootId) {
      if (!this.#rootPresent) {
        await this.#fail(route, 'The fake Drive app root was not found', 404);
        return;
      }
      for (const child of this.#storage.listChildren(this.#storage.rootId)) {
        this.#storage.delete(child.id);
      }
      this.#rootPresent = false;
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    if (!this.#storage.delete(itemId)) {
      await this.#fail(route, `Fake Drive item ${JSON.stringify(itemId)} was not found`, 404);
      return;
    }

    await route.fulfill({ status: 204, headers: corsHeaders() });
  }

  #listFiles(query: string): object[] {
    if (!query.includes('trashed=false')) {
      throw new Error(`Unsupported fake Drive query ${JSON.stringify(query)}`);
    }

    const parentIds = [...query.matchAll(/'(?<id>[^']+)' in parents/g)]
      .map((match) => match.groups?.id)
      .filter((id): id is string => id !== undefined);
    if (parentIds.length === 0) {
      throw new Error(`Fake Drive query has no parent predicate: ${JSON.stringify(query)}`);
    }

    const wantsFolders = new RegExp(
      `mimeType\\s*=\\s*'${escapeRegExp(DRIVE_FOLDER_MIME_TYPE)}'`
    ).test(query);
    const wantsFiles = new RegExp(
      `mimeType\\s*!=\\s*'${escapeRegExp(DRIVE_FOLDER_MIME_TYPE)}'`
    ).test(query);
    if (wantsFolders && wantsFiles) {
      throw new Error(`Conflicting fake Drive MIME predicates: ${JSON.stringify(query)}`);
    }

    const requestedName = /name\s*=\s*"(?<name>[^"]+)"/.exec(query)?.groups?.name;
    if (parentIds.includes('root')) {
      if (parentIds.length !== 1 || !wantsFolders || requestedName === undefined) {
        throw new Error(`Malformed fake Drive app-root query: ${JSON.stringify(query)}`);
      }
      if (!this.#rootPresent || requestedName !== ROOT_NAME) return [];
      return [
        {
          id: this.#storage.rootId,
          name: ROOT_NAME,
          mimeType: DRIVE_FOLDER_MIME_TYPE,
          parents: ['root']
        }
      ];
    }

    if (!this.#rootPresent) return [];

    const items = new Map<string, FakeCloudItem>();
    for (const parentId of parentIds) {
      for (const item of this.#storage.listChildren(parentId)) items.set(item.id, item);
    }

    return [...items.values()]
      .filter((item) => !wantsFolders || item.kind === 'folder')
      .filter((item) => !wantsFiles || item.kind === 'file')
      .filter((item) => requestedName === undefined || item.name === requestedName)
      .map((item) => this.#driveItem(item));
  }

  #driveItem(item: FakeCloudItem): object {
    return {
      id: item.id,
      name: item.name,
      ...(item.kind === 'folder' ? { mimeType: DRIVE_FOLDER_MIME_TYPE } : {}),
      parents: [item.parentId]
    };
  }

  async #failOAuth(route: Route, error: string, description: string): Promise<void> {
    await fulfillJSON(
      route,
      { error, error_description: `Fake Google OAuth: ${description}` },
      400
    );
  }

  async #fail(route: Route, message: string, status = 400): Promise<void> {
    await fulfillJSON(route, { error: { message: `Fake Google Drive: ${message}` } }, status);
  }
}

interface GoogleAuthorization {
  clientId: string;
  codeChallenge: string;
  redirectURI: string;
}

function parseGoogleAuthorization(requestURL: URL): GoogleAuthorization {
  const clientId = requestURL.searchParams.get('client_id') ?? '';
  if (!clientId) throw new Error('Google authorization requires client_id');

  const redirectURI = requestURL.searchParams.get('redirect_uri') ?? '';
  try {
    new URL(redirectURI);
  } catch {
    throw new Error('Google authorization requires a valid redirect_uri');
  }

  if (requestURL.searchParams.get('scope') !== DRIVE_SCOPE) {
    throw new Error('Google authorization requires the Drive file scope');
  }
  if (requestURL.searchParams.get('response_type') !== 'code') {
    throw new Error('Google authorization requires response_type=code');
  }
  if (requestURL.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error('Google authorization requires PKCE S256');
  }

  const codeChallenge = requestURL.searchParams.get('code_challenge') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    throw new Error('Google authorization requires a valid PKCE code challenge');
  }
  if (requestURL.searchParams.get('access_type') !== 'offline') {
    throw new Error('Google authorization requires access_type=offline');
  }
  if (requestURL.searchParams.get('prompt') !== 'consent') {
    throw new Error('Google authorization requires prompt=consent');
  }

  return { clientId, codeChallenge, redirectURI };
}

async function pkceChallengeFor(codeVerifier: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  );
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface MultipartUpload {
  data: Uint8Array<ArrayBuffer>;
  name: string;
  parentId: string | undefined;
}

async function parseMultipartUpload(route: Route): Promise<MultipartUpload> {
  const request = route.request();
  const contentType = request.headers()['content-type'];
  const body = request.postDataBuffer();
  if (!contentType?.startsWith('multipart/form-data;') || !body) {
    throw new Error('Multipart upload requires a multipart/form-data body');
  }

  const formData = await new Response(Uint8Array.from(body), {
    headers: { 'content-type': contentType }
  }).formData();
  const resourcePart = formData.get('resource');
  const filePart = formData.get('file');
  if (resourcePart === null || filePart === null) {
    throw new Error('Multipart upload requires resource and file parts');
  }

  const resourceText = typeof resourcePart === 'string' ? resourcePart : await resourcePart.text();
  let metadata: unknown;
  try {
    metadata = JSON.parse(resourceText);
  } catch {
    throw new Error('Multipart upload resource contains malformed JSON');
  }
  if (!isRecord(metadata) || typeof metadata.name !== 'string' || metadata.name.length === 0) {
    throw new Error('Multipart upload resource requires a file name');
  }
  if (metadata.parents !== undefined && !isStringArray(metadata.parents)) {
    throw new Error('Multipart upload parents must be an array of strings');
  }
  if (Array.isArray(metadata.parents) && metadata.parents.length !== 1) {
    throw new Error('Multipart upload requires exactly one parent when parents are present');
  }

  const data =
    typeof filePart === 'string'
      ? new TextEncoder().encode(filePart)
      : new Uint8Array(await filePart.arrayBuffer());

  return {
    data,
    name: metadata.name,
    parentId: Array.isArray(metadata.parents) ? metadata.parents[0] : undefined
  };
}

function isValidDriveListRequest(searchParams: URLSearchParams): boolean {
  if (
    !hasOnlyUniqueQueryParameters(searchParams, [
      'corpora',
      'spaces',
      'fields',
      'q',
      'pageToken'
    ]) ||
    searchParams.get('corpora') !== 'user' ||
    searchParams.get('spaces') !== 'drive'
  ) {
    return false;
  }

  const fields = searchParams.get('fields');
  const query = searchParams.get('q');
  const expectedFields = query ? expectedDriveListFields(query) : undefined;
  if (expectedFields === undefined || fields !== expectedFields) {
    return false;
  }

  const pageToken = searchParams.get('pageToken');
  return pageToken === null || (pageToken.length > 0 && fields.endsWith(',nextPageToken'));
}

function expectedDriveListFields(query: string): string | undefined {
  const mimeType = escapeRegExp(DRIVE_FOLDER_MIME_TYPE);
  const parentPredicate = "'[^']+' in parents";

  if (
    new RegExp(
      `^trashed=false and ${parentPredicate} and mimeType = '${mimeType}' and name = "[^"]+"$`
    ).test(query)
  ) {
    return 'files(id)';
  }
  if (new RegExp(`^trashed=false and mimeType='${mimeType}' and ${parentPredicate}$`).test(query)) {
    return 'files(id,name),nextPageToken';
  }
  if (
    new RegExp(`^trashed=false and mimeType!='${mimeType}' and ${parentPredicate}$`).test(query)
  ) {
    return 'files(id,name)';
  }
  if (
    new RegExp(`^trashed=false and \\(${parentPredicate}(?: or ${parentPredicate})*\\)$`).test(
      query
    )
  ) {
    return 'files(id,name,thumbnailLink,parents),nextPageToken';
  }
  if (new RegExp(`^trashed=false and ${parentPredicate}$`).test(query)) {
    return 'files(id,name,thumbnailLink,parents)';
  }
  return undefined;
}

function hasOnlyUniqueQueryParameters(
  searchParams: URLSearchParams,
  allowedNames: readonly string[]
): boolean {
  const names = [...searchParams.keys()];
  const allowed = new Set(allowedNames);
  return names.length === new Set(names).size && names.every((name) => allowed.has(name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
