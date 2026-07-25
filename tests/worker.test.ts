import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/worker";

function createTestEnv(): Env {
  return {
    DB: {} as D1Database,
    ASSETS: {
      fetch: async () => new Response("asset"),
      connect: (): Socket => {
        throw new Error("The asset test fetcher does not support sockets.");
      }
    },
    EXTENSION_API_TOKEN: "test-token"
  };
}

describe("worker scaffold", () => {
  it("returns health status as JSON", async () => {
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
});
