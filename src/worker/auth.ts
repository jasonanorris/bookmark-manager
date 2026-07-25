import type { Env } from "./types";

export function isAuthenticated(request: Request, env: Env): boolean {
  const expectedToken = env.EXTENSION_API_TOKEN;

  if (!expectedToken) {
    return false;
  }

  const actualToken = parseBearerToken(request.headers.get("authorization"));

  if (!actualToken) {
    return false;
  }

  return constantTimeEqual(actualToken, expectedToken);
}

export function hasConfiguredToken(env: Env): boolean {
  return Boolean(env.EXTENSION_API_TOKEN);
}

function parseBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;
    difference |= leftCode ^ rightCode;
  }

  return difference === 0;
}

