import { Buffer } from 'node:buffer';
import type { Route } from '@playwright/test';

export async function fulfillJSON(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    body: JSON.stringify(data),
    headers: { ...corsHeaders(), 'content-type': 'application/json' }
  });
}

export async function fulfillBytes(
  route: Route,
  data: Uint8Array<ArrayBuffer>,
  contentType: string
): Promise<void> {
  await route.fulfill({
    body: Buffer.from(data),
    headers: {
      ...corsHeaders(),
      'content-length': String(data.byteLength),
      'content-type': contentType
    }
  });
}

export function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-headers': 'authorization, content-range, content-type',
    'access-control-allow-methods': 'DELETE, GET, OPTIONS, PATCH, POST, PUT',
    'access-control-allow-origin': '*'
  };
}

export function bearerToken(route: Route): string {
  const authorization = route.request().headers().authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
}

export function contentTypeFor(filename: string): string {
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
