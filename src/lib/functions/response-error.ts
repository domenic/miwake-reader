type ErrorResponseBody = {
  error?: unknown;
  error_description?: unknown;
  message?: unknown;
};

/** Convert a failed HTTP response into the `Error` rejected at the request boundary. */
export async function errorFromResponse(response: Response | XMLHttpRequest): Promise<Error> {
  const isXHR = 'getResponseHeader' in response;
  const fallbackMessage = `Received Status ${response.status}`;

  try {
    const contentType = isXHR
      ? response.getResponseHeader('Content-Type')
      : response.headers.get('Content-Type');

    if (contentType?.includes('application/json')) {
      const body = isXHR ? response.response : await response.json();
      return errorFromResponseBody(body, fallbackMessage);
    }

    const responseText = isXHR ? response.responseText : await response.text();
    if (responseText) {
      return new Error(responseText);
    }
  } catch {
    // The status is still more useful than replacing this failure with a body-parsing error.
  }

  return new Error(fallbackMessage);
}

/** Convert a parsed provider response into the `Error` thrown at the HTTP boundary. */
export function errorFromResponseBody(body: unknown, fallbackMessage: string): Error {
  const responseBody = isObject(body) ? (body as ErrorResponseBody) : undefined;
  const nestedError = isObject(responseBody?.error)
    ? (responseBody.error as ErrorResponseBody)
    : undefined;
  const detail =
    responseBody?.error_description ??
    nestedError?.message ??
    responseBody?.error ??
    responseBody?.message ??
    body;

  return new Error(formatResponseDetail(detail, fallbackMessage));
}

function formatResponseDetail(detail: unknown, fallbackMessage: string): string {
  if (typeof detail === 'string') {
    return detail || fallbackMessage;
  }

  if (detail === null || detail === undefined) {
    return fallbackMessage;
  }

  if (typeof detail !== 'object') {
    return String(detail);
  }

  try {
    const serialized = JSON.stringify(detail);
    return serialized && serialized !== '{}' ? serialized : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}
