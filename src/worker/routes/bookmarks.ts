import { jsonError, jsonResponse, emptyResponse } from "../responses";
import type {
  Bookmark,
  BookmarkInput,
  BookmarkPatch,
  BookmarkRow,
  Env,
  ListOptions
} from "../types";
import {
  parseBookmarkId,
  parseListOptions,
  readJsonBody,
  validateBookmarkInput,
  validateBookmarkPatch,
  ValidationError
} from "../validation";

export async function handleBookmarksRequest(
  request: Request,
  env: Env,
  pathParts: string[]
): Promise<Response> {
  try {
    if (pathParts.length === 0) {
      if (request.method === "GET") {
        return await listBookmarks(request, env);
      }

      if (request.method === "POST") {
        return await createBookmark(request, env);
      }

      return methodNotAllowed(request, env);
    }

    if (pathParts.length === 1) {
      const id = parseBookmarkId(pathParts[0]);

      if (request.method === "GET") {
        return await getBookmark(request, env, id);
      }

      if (request.method === "PATCH") {
        return await updateBookmark(request, env, id);
      }

      if (request.method === "DELETE") {
        return await deleteBookmark(request, env, id);
      }

      return methodNotAllowed(request, env);
    }

    return jsonError("NOT_FOUND", "The requested API route does not exist.", 404, request, env);
  } catch (error) {
    if (error instanceof ValidationError) {
      return jsonError(error.code, error.message, 400, request, env);
    }

    console.error("Unexpected bookmark API error", error);
    return jsonError(
      "INTERNAL_ERROR",
      "An unexpected error occurred.",
      500,
      request,
      env
    );
  }
}

async function listBookmarks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const options = parseListOptions(url.searchParams);
  const { sql, bindings } = buildListQuery(options);
  const result = await env.DB.prepare(sql).bind(...bindings).all<BookmarkRow>();

  return jsonResponse(
    {
      bookmarks: result.results.map(mapBookmark),
      pagination: {
        limit: options.limit,
        offset: options.offset,
        count: result.results.length
      }
    },
    request,
    env
  );
}

async function getBookmark(
  request: Request,
  env: Env,
  id: number
): Promise<Response> {
  const bookmark = await findBookmarkById(env, id);

  if (!bookmark) {
    return jsonError("NOT_FOUND", "The bookmark does not exist.", 404, request, env);
  }

  return jsonResponse({ bookmark: mapBookmark(bookmark) }, request, env);
}

async function createBookmark(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const input = validateBookmarkInput(body);
  const existingBookmark = await findBookmarkByNormalizedUrl(env, input.normalizedUrl);

  if (existingBookmark) {
    await updateBookmarkRow(env, existingBookmark.id, {
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      title: input.title,
      description: input.description,
      tags: input.tags
    });

    const bookmark = await findBookmarkById(env, existingBookmark.id);

    if (!bookmark) {
      throw new Error("Updated duplicate bookmark could not be loaded.");
    }

    return jsonResponse({ bookmark: mapBookmark(bookmark), created: false }, request, env);
  }

  const result = await env.DB.prepare(
    `INSERT INTO bookmarks
      (url, normalized_url, title, description, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(input.url, input.normalizedUrl, input.title, input.description, stringifyTags(input.tags))
    .run();

  const bookmark = await findBookmarkById(env, Number(result.meta.last_row_id));

  if (!bookmark) {
    throw new Error("Created bookmark could not be loaded.");
  }

  return jsonResponse(
    { bookmark: mapBookmark(bookmark), created: true },
    request,
    env,
    { status: 201 }
  );
}

async function updateBookmark(
  request: Request,
  env: Env,
  id: number
): Promise<Response> {
  const existingBookmark = await findBookmarkById(env, id);

  if (!existingBookmark) {
    return jsonError("NOT_FOUND", "The bookmark does not exist.", 404, request, env);
  }

  const body = await readJsonBody(request);
  const patch = validateBookmarkPatch(body);

  if (patch.normalizedUrl) {
    const duplicateBookmark = await findBookmarkByNormalizedUrl(env, patch.normalizedUrl);

    if (duplicateBookmark && duplicateBookmark.id !== id) {
      return jsonError(
        "DUPLICATE_URL",
        "A bookmark with this URL already exists.",
        409,
        request,
        env
      );
    }
  }

  await updateBookmarkRow(env, id, patch);

  const bookmark = await findBookmarkById(env, id);

  if (!bookmark) {
    throw new Error("Updated bookmark could not be loaded.");
  }

  return jsonResponse({ bookmark: mapBookmark(bookmark) }, request, env);
}

async function deleteBookmark(
  request: Request,
  env: Env,
  id: number
): Promise<Response> {
  const existingBookmark = await findBookmarkById(env, id);

  if (!existingBookmark) {
    return jsonError("NOT_FOUND", "The bookmark does not exist.", 404, request, env);
  }

  await env.DB.prepare("DELETE FROM bookmarks WHERE id = ?").bind(id).run();

  return emptyResponse(request, env, { status: 204 });
}

async function findBookmarkById(env: Env, id: number): Promise<BookmarkRow | null> {
  return env.DB.prepare("SELECT * FROM bookmarks WHERE id = ?")
    .bind(id)
    .first<BookmarkRow>();
}

async function findBookmarkByNormalizedUrl(
  env: Env,
  normalizedUrl: string
): Promise<BookmarkRow | null> {
  return env.DB.prepare("SELECT * FROM bookmarks WHERE normalized_url = ?")
    .bind(normalizedUrl)
    .first<BookmarkRow>();
}

async function updateBookmarkRow(
  env: Env,
  id: number,
  patch: BookmarkPatch | BookmarkInput
): Promise<void> {
  const existingBookmark = await findBookmarkById(env, id);

  if (!existingBookmark) {
    throw new Error("Bookmark to update could not be loaded.");
  }

  await env.DB.prepare(
    `UPDATE bookmarks
     SET url = ?,
         normalized_url = ?,
         title = ?,
         description = ?,
         tags = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      patch.url ?? existingBookmark.url,
      patch.normalizedUrl ?? existingBookmark.normalized_url,
      patch.title ?? existingBookmark.title,
      patch.description ?? existingBookmark.description,
      stringifyTags(patch.tags ?? parseTags(existingBookmark.tags)),
      id
    )
    .run();
}

function buildListQuery(options: ListOptions): { sql: string; bindings: unknown[] } {
  const whereClauses: string[] = [];
  const bindings: unknown[] = [];

  if (options.search) {
    const escapedSearch = `%${escapeLike(options.search)}%`;
    whereClauses.push(
      `(title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`
    );
    bindings.push(escapedSearch, escapedSearch, escapedSearch, escapedSearch);
  }

  if (options.tag) {
    whereClauses.push(
      "EXISTS (SELECT 1 FROM json_each(bookmarks.tags) WHERE lower(json_each.value) = lower(?))"
    );
    bindings.push(options.tag);
  }

  const whereSql =
    whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";

  bindings.push(options.limit, options.offset);

  return {
    sql: `SELECT * FROM bookmarks${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    bindings
  };
}

function mapBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    tags: parseTags(row.tags),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at)
  };
}

function parseTags(value: string): string[] {
  try {
    const tags = JSON.parse(value) as unknown;

    if (Array.isArray(tags) && tags.every((tag) => typeof tag === "string")) {
      return tags;
    }
  } catch {
    return [];
  }

  return [];
}

function stringifyTags(tags: string[]): string {
  return JSON.stringify(tags);
}

function toIsoTimestamp(value: string): string {
  if (value.includes("T")) {
    return value;
  }

  return `${value.replace(" ", "T")}.000Z`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function methodNotAllowed(request: Request, env: Env): Response {
  return jsonError(
    "METHOD_NOT_ALLOWED",
    "This method is not supported for the requested API route.",
    405,
    request,
    env
  );
}
