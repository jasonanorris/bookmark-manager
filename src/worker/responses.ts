import type { Env } from "./types";

export function jsonResponse(
  body: unknown,
  request: Request,
  env: Env,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
      ...init?.headers
    }
  });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  request: Request,
  env: Env
): Response {
  return jsonResponse({ error: { code, message } }, request, env, { status });
}

export function emptyResponse(
  request: Request,
  env: Env,
  init?: ResponseInit
): Response {
  return new Response(null, {
    ...init,
    headers: {
      ...corsHeaders(request, env),
      ...init?.headers
    }
  });
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("origin");

  if (!origin || !isAllowedOrigin(origin, env)) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function isAllowedOrigin(origin: string, env: Env): boolean {
  if (isExtensionOrigin(origin)) {
    return true;
  }

  const configuredOrigins = env.ALLOWED_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const allowedOrigins =
    configuredOrigins && configuredOrigins.length > 0
      ? configuredOrigins
      : ["http://localhost:5173", "http://127.0.0.1:5173"];

  return allowedOrigins.includes(origin);
}

function isExtensionOrigin(origin: string): boolean {
  return (
    origin.startsWith("moz-extension://") ||
    origin.startsWith("chrome-extension://")
  );
}
