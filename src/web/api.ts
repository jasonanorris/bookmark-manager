import type {
  BookmarkListOptions,
  BookmarkListResponse,
  BookmarkMutationResponse,
  BookmarkPatch,
  BookmarkPayload
} from "./types";

interface ApiErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function getBookmarks(
  token: string,
  options: BookmarkListOptions = {}
): Promise<BookmarkListResponse> {
  const searchParams = new URLSearchParams();

  if (options.search) {
    searchParams.set("search", options.search);
  }

  if (options.tag) {
    searchParams.set("tag", options.tag);
  }

  if (options.limit) {
    searchParams.set("limit", String(options.limit));
  }

  if (options.offset) {
    searchParams.set("offset", String(options.offset));
  }

  const query = searchParams.toString();
  return apiFetch<BookmarkListResponse>(
    `/api/bookmarks${query ? `?${query}` : ""}`,
    token,
    { signal: options.signal }
  );
}

export async function createBookmark(
  token: string,
  payload: BookmarkPayload
): Promise<BookmarkMutationResponse> {
  return apiFetch<BookmarkMutationResponse>("/api/bookmarks", token, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateBookmark(
  token: string,
  id: number,
  patch: BookmarkPatch
): Promise<BookmarkMutationResponse> {
  return apiFetch<BookmarkMutationResponse>(`/api/bookmarks/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export async function deleteBookmark(token: string, id: number): Promise<void> {
  await apiFetch<void>(`/api/bookmarks/${id}`, token, {
    method: "DELETE"
  });
}

async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await parseJson(response);

  if (!response.ok) {
    throw createApiError(response, body);
  }

  return body as T;
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (response.ok) {
      return undefined;
    }

    throw new ApiError(
      response.status,
      "NON_JSON_RESPONSE",
      "The server returned an unexpected response."
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_JSON_RESPONSE",
      "The server returned invalid JSON."
    );
  }
}

function createApiError(response: Response, body: unknown): ApiError {
  const errorBody = body as ApiErrorBody;
  const code =
    typeof errorBody.error?.code === "string"
      ? errorBody.error.code
      : "REQUEST_FAILED";
  const message =
    typeof errorBody.error?.message === "string"
      ? errorBody.error.message
      : "The request failed.";

  return new ApiError(response.status, code, message);
}

