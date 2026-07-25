import { hasConfiguredToken, isAuthenticated } from "./auth";
import { emptyResponse, jsonError, jsonResponse } from "./responses";
import { handleBookmarksRequest } from "./routes/bookmarks";
import type { Env } from "./types";

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return jsonResponse({ ok: true }, request, env);
  }

  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    return emptyResponse(request, env, { status: 204 });
  }

  if (url.pathname === "/api/bookmarks" || url.pathname.startsWith("/api/bookmarks/")) {
    if (!hasConfiguredToken(env)) {
      return jsonError(
        "CONFIGURATION_ERROR",
        "API authentication is not configured.",
        500,
        request,
        env
      );
    }

    if (!isAuthenticated(request, env)) {
      return jsonError(
        "UNAUTHORIZED",
        "A valid API password is required.",
        401,
        request,
        env
      );
    }

    const pathParts = url.pathname
      .replace(/^\/api\/bookmarks\/?/, "")
      .split("/")
      .filter((part) => part.length > 0);

    return handleBookmarksRequest(request, env, pathParts);
  }

  if (url.pathname.startsWith("/api/")) {
    return jsonError("NOT_FOUND", "The requested API route does not exist.", 404, request, env);
  }

  return env.ASSETS.fetch(request);
}
