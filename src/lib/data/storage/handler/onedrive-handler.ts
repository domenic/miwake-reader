import type { BookCardProps } from '$lib/components/book-card/book-card-props';
import { oneDriveTokenEndpoint } from '$lib/data/env';
import { ApiStorageHandler, type UploadOptions } from '$lib/data/storage/handler/api-handler';
import { BaseStorageHandler, type ExternalFile } from '$lib/data/storage/handler/base-handler';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import pLimit from 'p-limit';

interface OneDriveFile extends ExternalFile {
  thumbnails?: ExternalThumbnail[];
  file: Record<string, string>;
  folder: Record<string, string>;
}

interface BatchRequest {
  id: string;
  method: string;
  url: string;
  body?: string;
  headers?: string;
}

interface BatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body: BatchResponseBody;
}

interface BatchResponseBody {
  value: OneDriveFile[];
}

interface ExternalThumbnail {
  id: string;
  large?: ExternalThumbnailData;
  medium?: ExternalThumbnailData;
  small?: ExternalThumbnailData;
}

interface ExternalThumbnailData {
  height: number;
  width: number;
  url: string;
}

export class OneDriveStorageHandler extends ApiStorageHandler {
  private baseEndpoint = 'https://graph.microsoft.com/v1.0/me/drive/items';

  private appRootEndpoint = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';

  constructor(window: Window) {
    super(SyncEndpointType.ONEDRIVE, window, oneDriveTokenEndpoint);
  }

  setInternalSettings(storageSourceName: string) {
    if (storageSourceName !== this.storageSourceName) {
      this.clearData();
    }
    this.storageSourceName = storageSourceName;
  }

  async listSyncTitles({ refresh = false } = {}) {
    if (refresh) this.clearData();
    if (!this.dataListFetched) {
      try {
        await this.ensureTitle();

        const remoteFolders = await this.list(this.rootId);
        const batchRequests: BatchRequest[][] = [];
        const batchIdToTitle = new Map<string, string>();
        const titleIdToName = new Map<string, string>();
        const listParams = new URLSearchParams();

        listParams.append('select', `id,name`);
        listParams.append('expand', `thumbnails(select=large)`);

        for (let index = 0, { length } = remoteFolders; index < length; index += 20) {
          const iteration = remoteFolders.slice(index, index + 20);
          const requests: BatchRequest[] = [];

          for (let index2 = 0, { length: length2 } = iteration; index2 < length2; index2 += 1) {
            const remoteFolder = iteration[index2];
            const title = BaseStorageHandler.desanitizeFilename(remoteFolder.name);
            const id = `${batchRequests.length}_${requests.length}`;

            this.titleToId.set(title, remoteFolder.id);
            titleIdToName.set(remoteFolder.id, title);
            batchIdToTitle.set(id, remoteFolder.id);

            requests.push({
              id,
              method: 'GET',
              url: `/me/drive/items/${remoteFolder.id}/children?${listParams.toString()}`
            });
          }

          if (requests.length) {
            batchRequests.push(requests);
          }
        }

        if (batchRequests.length) {
          const listLimiter = pLimit(1);
          const listTasks: Promise<void>[] = [];

          batchRequests.forEach((requests: BatchRequest[]) =>
            listTasks.push(
              listLimiter(async () => {
                const { responses } = await this.request(
                  'https://graph.microsoft.com/v1.0/$batch',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      requests
                    })
                  }
                );

                const responseWithError = responses.find(
                  (response: BatchResponse) => response.status < 200 || response.status > 299
                );

                if (responseWithError) {
                  const { body } = responseWithError;

                  throw new Error(
                    body.error_description ||
                      body.error?.message ||
                      body.error ||
                      'Received error on data retrival'
                  );
                }

                for (let index = 0, { length } = responses; index < length; index += 1) {
                  const response = responses[index];
                  const remoteFiles = response.body?.value || [];
                  const externalId = batchIdToTitle.get(response.id) || '';
                  const title = titleIdToName.get(externalId);

                  if (title && externalId) {
                    this.setTitleData(title, remoteFiles);
                  }
                }
              })
            )
          );

          await Promise.all(listTasks).catch((error) => {
            listLimiter.clearQueue();
            throw error;
          });
        }

        this.dataListFetched = true;
      } catch (error) {
        this.clearData();
        throw error;
      }
    }

    return [...this.titleToBookCard.values()].map((card) => ({
      title: card.title,
      characters: card.characters,
      lastBookModified: card.lastBookModified,
      lastBookOpen: card.lastBookOpen,
      coverImage: card.imagePath || undefined,
      progress: card.progress,
      lastBookmarkModified: card.lastBookmarkModified,
      completed: card.completed
    }));
  }

  async ensureTitle(name = BaseStorageHandler.rootName, _parent = 'root', readOnly = false) {
    if (name === BaseStorageHandler.rootName) {
      if (!this.rootId) {
        // AppFolder is auto-created by Microsoft on first access
        const response = await this.request(`${this.appRootEndpoint}?$select=id`);
        this.rootId = response.id;
      }
      return this.rootId;
    }

    const externalId = this.titleToId.get(name);

    if (externalId) {
      return externalId;
    }

    if (!this.rootId) {
      throw new Error('RootId required for search');
    }

    // OneDrive bug: non-latin characters return no filter results, so refetch all folders
    const remoteFolders = await this.list(this.rootId);
    let titleId = '';

    for (let index = 0, { length } = remoteFolders; index < length; index += 1) {
      const remoteFolder = remoteFolders[index];
      const title = BaseStorageHandler.desanitizeFilename(remoteFolder.name);

      this.titleToId.set(title, remoteFolder.id);

      if (title === name) {
        titleId = remoteFolder.id;
      }
    }

    if (!titleId && !readOnly) {
      const sanitizedName = BaseStorageHandler.sanitizeForFilename(name);
      const params = new URLSearchParams();
      params.append('select', 'id,name');

      const response = await this.request(
        `${this.baseEndpoint}/${this.rootId}/children?${params.toString()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: sanitizedName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail'
          })
        }
      );

      titleId = response.id;
    }

    if (titleId) {
      this.titleToId.set(name, titleId);
    }

    return titleId;
  }

  async getExternalFiles(remoteTitleId: string, title: string) {
    if ((!this.cacheStorageData || !this.dataListFetched) && !this.titleToFiles.has(title)) {
      const externalFiles = await this.list(remoteTitleId, true, true);

      if (externalFiles.length) {
        this.setTitleData(title, externalFiles);
      }
    }

    return this.titleToFiles.get(title) || [];
  }

  async setRootFiles() {
    if ((!this.cacheStorageData || !this.rootFileListFetched) && !this.rootFiles.size) {
      const rootFiles = await this.list(this.rootId, false, true);

      for (let index = 0, { length } = rootFiles; index < length; index += 1) {
        const rootFile = rootFiles[index];

        this.setRootFile(rootFile.name, rootFile);
      }

      this.rootFileListFetched = true;
    }
  }

  async retrieve(
    file: OneDriveFile,
    typeToRetrieve: XMLHttpRequestResponseType,
    progressBase = 1,
    cancelSignal?: AbortSignal
  ) {
    return this.request(
      `${this.baseEndpoint}/${file.id}/content`,
      { trackDownload: true },
      typeToRetrieve,
      progressBase,
      cancelSignal
    );
  }

  async upload(opts: UploadOptions) {
    const {
      folderId,
      name,
      files,
      externalFile: remoteFile,
      data: body,
      title,
      rootFilePrefix,
      progressBase = 0.8,
      cancelSignal
    } = opts;
    const params = new URLSearchParams();
    params.append('select', `id,name`);

    if (body) {
      const { uploadUrl: uploadUrlResponse } = await this.request(
        `${this.baseEndpoint}/${
          remoteFile ? `${remoteFile.id}` : `${folderId}:/${encodeURIComponent(name)}:`
        }/createUploadSession`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: {
              name: remoteFile?.name || name
            }
          })
        },
        'json',
        1,
        cancelSignal
      );

      const url = new URL(uploadUrlResponse);
      const searchParams = [...url.searchParams];
      const uploadUrl = `${url.origin}${url.pathname}`;

      params.delete('select');

      for (let index = 0, { length } = searchParams; index < length; index += 1) {
        const [paramName, paramValue] = searchParams[index];

        params.append(paramName, paramValue);
      }

      params.append('select', `id,name`);

      if (!uploadUrl) {
        throw new Error('Upload url was not returned');
      }

      try {
        const byteSize = body instanceof Blob ? body.size : new Blob([body]).size;
        const response = await this.request(
          `${uploadUrl}?${params.toString()}`,
          {
            method: 'PUT',
            headers: { 'Content-Range': `bytes 0-${byteSize - 1}/${byteSize}` },
            body,
            trackUpload: true,
            skipAuth: true
          },
          'json',
          progressBase,
          cancelSignal
        );

        if (remoteFile && name !== remoteFile.name) {
          const renameResponse = await this.rename(
            name,
            files,
            remoteFile,
            params,
            rootFilePrefix,
            cancelSignal,
            title
          );

          return renameResponse;
        }

        this.updateAfterUpload(
          title,
          response.id,
          response.name,
          files,
          remoteFile,
          {
            thumbnails: response.thumbnails
          },
          rootFilePrefix
        );

        return response;
      } catch (error) {
        await this.request(uploadUrl, { method: 'DELETE' }, 'json', 1, cancelSignal).catch(() => {
          // no-op
        });
        throw error;
      }
    }

    if (!remoteFile) {
      throw new Error('Renaming requires a remote id');
    }

    const renameResponse = await this.rename(
      name,
      files,
      remoteFile,
      params,
      rootFilePrefix,
      cancelSignal,
      title
    );

    return renameResponse;
  }

  protected executeDelete(id: string, cancelSignal?: AbortSignal) {
    return this.request(
      `${this.baseEndpoint}/${id}`,
      { method: 'DELETE' },
      'json',
      1,
      cancelSignal
    );
  }

  private async list(
    parent = 'root',
    withThumbnail = false,
    listFiles = false,
    files: OneDriveFile[] = [],
    nextLink = ''
  ) {
    let response;

    if (nextLink) {
      response = await this.request(nextLink);
    } else {
      const params = new URLSearchParams();

      params.append('select', `id,name,file,folder`);

      if (!listFiles) {
        params.append('filter', 'folder ne null');
      }

      if (withThumbnail) {
        params.append('expand', `thumbnails`);
      }

      response = await this.request(`${this.baseEndpoint}/${parent}/children?${params.toString()}`);
    }

    if (response) {
      files.push(
        ...(response.value || []).filter(
          (item: OneDriveFile) => (listFiles && !!item.file) || (!listFiles && !!item.folder)
        )
      );

      if (response['@odata.nextLink']) {
        await this.list(parent, withThumbnail, listFiles, files, response?.['@odata.nextLink']);
      }
    }

    return files;
  }

  private async setTitleData(title: string, files: OneDriveFile[]) {
    if (!files.length) {
      return;
    }

    const bookCard: BookCardProps = {
      id: BaseStorageHandler.getDummyId(),
      title,
      imagePath: '',
      characters: 0,
      lastBookModified: 0,
      lastBookOpen: 0,
      progress: 0,
      completed: false,
      lastBookmarkModified: 0,
      isPlaceholder: false
    };

    for (let index = 0, { length } = files; index < length; index += 1) {
      const file = files[index];

      if (file.name.startsWith('bookdata_')) {
        const { characters, lastBookModified, lastBookOpen } = BaseStorageHandler.getBookMetadata(
          file.name
        );

        bookCard.characters = characters;
        bookCard.lastBookModified = lastBookModified;
        bookCard.lastBookOpen = lastBookOpen;
      } else if (file.name.startsWith('progress_')) {
        const { progress, lastBookmarkModified, completed } =
          BaseStorageHandler.getProgressMetadata(file.name);

        bookCard.progress = progress;
        bookCard.lastBookmarkModified = lastBookmarkModified;
        bookCard.completed = completed;
      } else if (file.name.startsWith('cover_') && file.thumbnails?.[0].large?.url) {
        bookCard.imagePath = file.thumbnails?.[0].large?.url;
      }
    }

    this.titleToFiles.set(title, files);
    this.titleToBookCard.set(title, bookCard);
  }

  private async rename(
    name: string,
    files: ExternalFile[],
    remoteFile: ExternalFile,
    params: URLSearchParams,
    rootFilePrefix: string | undefined,
    cancelSignal: AbortSignal | undefined,
    title: string
  ) {
    const renameResponse = await this.request(
      `${this.baseEndpoint}/${remoteFile.id}?${params.toString()}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      },
      'json',
      1,
      cancelSignal
    );

    this.updateAfterUpload(
      title,
      renameResponse.id,
      renameResponse.name,
      files,
      remoteFile,
      {
        thumbnails: renameResponse?.thumbnails || []
      },
      rootFilePrefix
    );

    return renameResponse;
  }
}
