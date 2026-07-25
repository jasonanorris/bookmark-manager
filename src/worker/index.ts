export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EXTENSION_API_TOKEN: string;
  ALLOWED_ORIGINS?: string;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers
    }
  });
}

function jsonError(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonError("NOT_FOUND", "The requested API route does not exist.", 404);
    }

    return env.ASSETS.fetch(request);
  }
};

