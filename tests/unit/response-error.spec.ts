import { describe, expect, it } from 'vitest';
import {
  errorFromResponse,
  errorFromResponseBody
} from '../../src/lib/functions/response-error.ts';

describe('errorFromResponse', () => {
  it('creates an Error from a failed JSON response', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 'quotaLimit', message: 'Storage quota exceeded' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );

    const error = await errorFromResponse(response);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Storage quota exceeded');
  });

  it('creates an Error from a failed text response', async () => {
    const error = await errorFromResponse(new Response('Gateway unavailable', { status: 502 }));

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Gateway unavailable');
  });
});

describe('errorFromResponseBody', () => {
  it('creates an Error from a provider message', () => {
    const error = errorFromResponseBody(
      { error: { code: 'quotaLimit', message: 'Storage quota exceeded' } },
      'Request failed'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Storage quota exceeded');
  });

  it('serializes structured error details instead of coercing them', () => {
    const error = errorFromResponseBody(
      { error: { code: 'unknownError', retryable: true } },
      'Request failed'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('{"code":"unknownError","retryable":true}');
  });

  it('serializes an object-valued provider message', () => {
    const error = errorFromResponseBody(
      { error: { message: { code: 'invalidRequest', detail: 'Filename rejected' } } },
      'Request failed'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('{"code":"invalidRequest","detail":"Filename rejected"}');
  });

  it('uses the fallback for an empty response', () => {
    const error = errorFromResponseBody({}, 'Received Status 500');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Received Status 500');
  });
});
