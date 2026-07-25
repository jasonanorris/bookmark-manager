import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/worker";

interface StoredBookmark {
  id: number;
  url: string;
  normalized_url: string;
  title: string;
  description: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

interface ApiBookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ApiBookmarkResponse {
  bookmark: ApiBookmark;
}

interface ApiCreateBookmarkResponse extends ApiBookmarkResponse {
  created: boolean;
}

interface ApiBookmarkListResponse {
  bookmarks: ApiBookmark[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

class TestD1Database {
  private bookmarks: StoredBookmark[] = [];
  private nextId = 1;
  private timestampIndex = 0;

  prepare(sql: string): D1PreparedStatement {
    return new TestD1PreparedStatement(this, sql) as unknown as D1PreparedStatement;
  }

  first(sql: string, bindings: unknown[]): StoredBookmark | null {
    if (sql.includes("WHERE id = ?")) {
      const id = Number(bindings[0]);
      return this.bookmarks.find((bookmark) => bookmark.id === id) ?? null;
    }

    if (sql.includes("WHERE normalized_url = ?")) {
      const normalizedUrl = String(bindings[0]);
      return (
        this.bookmarks.find(
          (bookmark) => bookmark.normalized_url === normalizedUrl
        ) ?? null
      );
    }

    throw new Error(`Unsupported first query: ${sql}`);
  }

  all(sql: string, bindings: unknown[]): StoredBookmark[] {
    const limit = Number(bindings.at(-2));
    const offset = Number(bindings.at(-1));
    let results = [...this.bookmarks];
    let bindingIndex = 0;

    if (sql.includes("title LIKE")) {
      const search = cleanLikeBinding(String(bindings[bindingIndex]));
      bindingIndex += 4;
      results = results.filter((bookmark) =>
        [
          bookmark.title,
          bookmark.url,
          bookmark.description,
          bookmark.tags
        ].some((value) => value.toLowerCase().includes(search))
      );
    }

    if (sql.includes("json_each(bookmarks.tags)")) {
      const tag = String(bindings[bindingIndex]).toLocaleLowerCase();
      results = results.filter((bookmark) => {
        const tags = parseStoredTags(bookmark.tags);
        return tags.some((storedTag) => storedTag.toLocaleLowerCase() === tag);
      });
    }

    return results
      .sort((left, right) => {
        const dateComparison = right.created_at.localeCompare(left.created_at);
        return dateComparison === 0 ? right.id - left.id : dateComparison;
      })
      .slice(offset, offset + limit);
  }

  run(sql: string, bindings: unknown[]): D1Result {
    if (sql.startsWith("INSERT INTO bookmarks")) {
      const timestamp = this.nextTimestamp();
      const bookmark: StoredBookmark = {
        id: this.nextId,
        url: String(bindings[0]),
        normalized_url: String(bindings[1]),
        title: String(bindings[2]),
        description: String(bindings[3]),
        tags: String(bindings[4]),
        created_at: timestamp,
        updated_at: timestamp
      };

      this.bookmarks.push(bookmark);
      this.nextId += 1;

      return createD1Result(bookmark.id);
    }

    if (sql.startsWith("UPDATE bookmarks")) {
      const id = Number(bindings[5]);
      const bookmark = this.bookmarks.find((candidate) => candidate.id === id);

      if (bookmark) {
        bookmark.url = String(bindings[0]);
        bookmark.normalized_url = String(bindings[1]);
        bookmark.title = String(bindings[2]);
        bookmark.description = String(bindings[3]);
        bookmark.tags = String(bindings[4]);
        bookmark.updated_at = this.nextTimestamp();
      }

      return createD1Result(id);
    }

    if (sql.startsWith("DELETE FROM bookmarks")) {
      const id = Number(bindings[0]);
      this.bookmarks = this.bookmarks.filter((bookmark) => bookmark.id !== id);
      return createD1Result(id);
    }

    throw new Error(`Unsupported run query: ${sql}`);
  }

  private nextTimestamp(): string {
    this.timestampIndex += 1;
    return `2026-07-25 15:00:${String(this.timestampIndex).padStart(2, "0")}`;
  }
}

class TestD1PreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly db: TestD1Database,
    private readonly sql: string
  ) {}

  bind(...bindings: unknown[]): this {
    this.bindings = bindings;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.db.first(this.sql, this.bindings) as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      results: this.db.all(this.sql, this.bindings) as T[],
      success: true,
      meta: createD1Meta() as D1Meta & Record<string, unknown>
    };
  }

  async run(): Promise<D1Result> {
    return this.db.run(this.sql, this.bindings);
  }
}

function createTestEnv(): Env {
  return {
    DB: new TestD1Database() as unknown as D1Database,
    ASSETS: {
      fetch: async () => new Response("asset"),
      connect: (): Socket => {
        throw new Error("The asset test fetcher does not support sockets.");
      }
    },
    EXTENSION_API_TOKEN: "test-token",
    ALLOWED_ORIGINS: "https://bookmarks.example.com,http://localhost:5173"
  };
}

function createUnconfiguredAuthEnv(): Env {
  return {
    ...createTestEnv(),
    EXTENSION_API_TOKEN: ""
  };
}

function apiRequest(
  path: string,
  init: RequestInit = {},
  token = "test-token"
): Request {
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(`https://example.com${path}`, {
    ...init,
    headers
  });
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function cleanLikeBinding(value: string): string {
  return value.replace(/^%|%$/g, "").replace(/\\/g, "").toLowerCase();
}

function parseStoredTags(value: string): string[] {
  const parsedValue = JSON.parse(value) as unknown;

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue.filter((tag): tag is string => typeof tag === "string");
}

function createD1Result(lastRowId: number): D1Result {
  return {
    results: [],
    success: true,
    meta: {
      ...createD1Meta(),
      last_row_id: lastRowId
    }
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function createD1Meta(): D1Meta {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0
  };
}

describe("worker API", () => {
  it("returns health status as JSON without authentication", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/health"),
      createTestEnv()
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("returns JSON for unknown API routes", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/missing"),
      createTestEnv()
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested API route does not exist."
      }
    });
    expect(response.status).toBe(404);
  });

  it("rejects bookmark requests without authentication", async () => {
    const response = await worker.fetch(
      apiRequest("/api/bookmarks", {}, ""),
      createTestEnv()
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "A valid API password is required."
      }
    });
    expect(response.status).toBe(401);
  });

  it("rejects bookmark requests with the wrong password", async () => {
    const response = await worker.fetch(
      apiRequest("/api/bookmarks", {}, "wrong-token"),
      createTestEnv()
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "A valid API password is required."
      }
    });
    expect(response.status).toBe(401);
  });

  it("returns a configuration error when authentication is not configured", async () => {
    const response = await worker.fetch(
      apiRequest("/api/bookmarks"),
      createUnconfiguredAuthEnv()
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CONFIGURATION_ERROR",
        message: "API authentication is not configured."
      }
    });
    expect(response.status).toBe(500);
  });

  it("creates a valid bookmark from a bare domain", async () => {
    const env = createTestEnv();
    const response = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({
          url: "example.com/articles",
          title: "Example Article",
          description: "A useful reference.",
          tags: ["Reference", "reference", "Cloudflare"]
        })
      }),
      env
    );

    const body = await readJson<ApiCreateBookmarkResponse>(response);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      created: true,
      bookmark: {
        id: 1,
        url: "https://example.com/articles",
        title: "Example Article",
        description: "A useful reference.",
        tags: ["Reference", "Cloudflare"]
      }
    });
  });

  it("rejects invalid and unsupported URLs", async () => {
    const env = createTestEnv();

    const invalidUrlResponse = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "not a url" })
      }),
      env
    );
    const unsupportedUrlResponse = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "ftp://example.com/file" })
      }),
      env
    );

    expect(invalidUrlResponse.status).toBe(400);
    expect(unsupportedUrlResponse.status).toBe(400);
  });

  it("updates a duplicate normalized URL instead of creating another bookmark", async () => {
    const env = createTestEnv();

    const firstResponse = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({
          url: "https://Example.com/#section",
          title: "First"
        })
      }),
      env
    );
    const firstBody = await readJson<ApiCreateBookmarkResponse>(firstResponse);

    const secondResponse = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({
          url: "example.com",
          title: "Second",
          tags: ["updated"]
        })
      }),
      env
    );
    const secondBody = await readJson<ApiCreateBookmarkResponse>(secondResponse);

    expect(secondResponse.status).toBe(200);
    expect(secondBody).toMatchObject({
      created: false,
      bookmark: {
        id: firstBody.bookmark.id,
        title: "Second",
        tags: ["updated"]
      }
    });
    expect(secondBody.bookmark.createdAt).toBe(firstBody.bookmark.createdAt);
  });

  it("lists bookmarks in reverse chronological order", async () => {
    const env = createTestEnv();

    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com/first", title: "First" })
      }),
      env
    );
    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com/second", title: "Second" })
      }),
      env
    );

    const response = await worker.fetch(apiRequest("/api/bookmarks"), env);
    const body = await readJson<ApiBookmarkListResponse>(response);

    expect(response.status).toBe(200);
    expect(body.bookmarks.map((bookmark: { title: string }) => bookmark.title)).toEqual([
      "Second",
      "First"
    ]);
    expect(body.pagination).toEqual({ limit: 50, offset: 0, count: 2 });
  });

  it("searches bookmarks", async () => {
    const env = createTestEnv();

    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://workers.dev", title: "Cloudflare Workers" })
      }),
      env
    );
    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com", title: "Example" })
      }),
      env
    );

    const response = await worker.fetch(apiRequest("/api/bookmarks?search=worker"), env);
    const body = await readJson<ApiBookmarkListResponse>(response);

    expect(body.bookmarks).toHaveLength(1);
    expect(body.bookmarks[0].title).toBe("Cloudflare Workers");
  });

  it("filters bookmarks by tag", async () => {
    const env = createTestEnv();

    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({
          url: "https://developers.cloudflare.com",
          title: "Cloudflare Docs",
          tags: ["docs"]
        })
      }),
      env
    );
    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({
          url: "https://example.com/news",
          title: "News",
          tags: ["reading"]
        })
      }),
      env
    );

    const response = await worker.fetch(apiRequest("/api/bookmarks?tag=docs"), env);
    const body = await readJson<ApiBookmarkListResponse>(response);

    expect(body.bookmarks).toHaveLength(1);
    expect(body.bookmarks[0].title).toBe("Cloudflare Docs");
  });

  it("filters tags with an exact case-insensitive match", async () => {
    const env = createTestEnv();

    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({
          url: "https://example.com/dev",
          title: "Dev",
          tags: ["Dev"]
        })
      }),
      env
    );
    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({
          url: "https://example.com/development",
          title: "Development",
          tags: ["development"]
        })
      }),
      env
    );

    const response = await worker.fetch(apiRequest("/api/bookmarks?tag=dev"), env);
    const body = await readJson<ApiBookmarkListResponse>(response);

    expect(body.bookmarks.map((bookmark) => bookmark.title)).toEqual(["Dev"]);
  });

  it("applies limit and offset pagination", async () => {
    const env = createTestEnv();

    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com/first", title: "First" })
      }),
      env
    );
    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com/second", title: "Second" })
      }),
      env
    );
    await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com/third", title: "Third" })
      }),
      env
    );

    const response = await worker.fetch(
      apiRequest("/api/bookmarks?limit=1&offset=1"),
      env
    );
    const body = await readJson<ApiBookmarkListResponse>(response);

    expect(body.bookmarks.map((bookmark) => bookmark.title)).toEqual(["Second"]);
    expect(body.pagination).toEqual({ limit: 1, offset: 1, count: 1 });
  });

  it("rejects out-of-range pagination parameters", async () => {
    const response = await worker.fetch(
      apiRequest("/api/bookmarks?limit=101"),
      createTestEnv()
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_QUERY",
        message: "The limit parameter is out of range."
      }
    });
    expect(response.status).toBe(400);
  });

  it("updates a bookmark", async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com", title: "Original" })
      }),
      env
    );
    const createBody = await readJson<ApiCreateBookmarkResponse>(createResponse);

    const response = await worker.fetch(
      apiRequest(`/api/bookmarks/${createBody.bookmark.id}`, {
        method: "PATCH",
        body: jsonBody({ title: "Updated", tags: ["edited"] })
      }),
      env
    );
    const body = await readJson<ApiBookmarkResponse>(response);

    expect(response.status).toBe(200);
    expect(body.bookmark.title).toBe("Updated");
    expect(body.bookmark.tags).toEqual(["edited"]);
  });

  it("deletes a bookmark", async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: jsonBody({ url: "https://example.com", title: "Delete Me" })
      }),
      env
    );
    const createBody = await readJson<ApiCreateBookmarkResponse>(createResponse);

    const deleteResponse = await worker.fetch(
      apiRequest(`/api/bookmarks/${createBody.bookmark.id}`, { method: "DELETE" }),
      env
    );
    const getResponse = await worker.fetch(
      apiRequest(`/api/bookmarks/${createBody.bookmark.id}`),
      env
    );

    expect(deleteResponse.status).toBe(204);
    expect(getResponse.status).toBe(404);
  });

  it("returns 404 for missing bookmarks", async () => {
    const response = await worker.fetch(apiRequest("/api/bookmarks/999"), createTestEnv());

    expect(response.status).toBe(404);
  });

  it("handles malformed JSON", async () => {
    const response = await worker.fetch(
      apiRequest("/api/bookmarks", {
        method: "POST",
        body: "{"
      }),
      createTestEnv()
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "MALFORMED_JSON",
        message: "The request body must be valid JSON."
      }
    });
    expect(response.status).toBe(400);
  });

  it("rejects invalid bookmark IDs", async () => {
    const response = await worker.fetch(
      apiRequest("/api/bookmarks/not-a-number"),
      createTestEnv()
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_ID",
        message: "A valid bookmark ID is required."
      }
    });
    expect(response.status).toBe(400);
  });

  it("responds to CORS preflight requests from allowed origins", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/bookmarks", {
        method: "OPTIONS",
        headers: {
          origin: "https://bookmarks.example.com"
        }
      }),
      createTestEnv()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://bookmarks.example.com"
    );
  });

  it("allows Firefox extension origins for CORS", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/bookmarks", {
        method: "OPTIONS",
        headers: {
          origin: "moz-extension://example-extension-id"
        }
      }),
      createTestEnv()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "moz-extension://example-extension-id"
    );
  });

  it("does not add CORS headers for unlisted web origins", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/bookmarks", {
        method: "OPTIONS",
        headers: {
          origin: "https://not-bookmarks.example.com"
        }
      }),
      createTestEnv()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
