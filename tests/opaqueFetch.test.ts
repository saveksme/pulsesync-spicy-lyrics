import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpaqueFetcher, type WorkerLike } from "../src/host/opaqueFetch";

class FakeWorker implements WorkerLike {
  posted: Array<{ id: number; url: string; headers: Record<string, string> }> = [];
  terminated = false;
  private listeners: Record<string, Array<(event: { data?: unknown; message?: string }) => void>> = {};
  constructor(readonly source: string) {}
  postMessage(message: unknown) {
    this.posted.push(message as { id: number; url: string; headers: Record<string, string> });
  }
  addEventListener(type: "message" | "error", listener: (event: { data?: unknown; message?: string }) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    for (const listener of this.listeners.message ?? []) listener({ data });
  }
  crash() {
    for (const listener of this.listeners.error ?? []) listener({ message: "boom" });
  }
}

function setup() {
  let worker!: FakeWorker;
  const fetcher = createOpaqueFetcher((source) => (worker = new FakeWorker(source)))!;
  return { fetcher, worker: () => worker };
}

describe("opaque-origin fetch (Web Worker from a data: URL)", () => {
  afterEach(() => vi.useRealTimers());

  it("relays the request to the worker and rebuilds the response", async () => {
    const { fetcher, worker } = setup();
    const pending = fetcher.fetch("https://api.example/x", { headers: { Authorization: "Bearer k" } });
    const sent = worker().posted[0];
    expect(sent.url).toBe("https://api.example/x");
    expect(sent.headers.authorization).toBe("Bearer k");
    worker().reply({ id: sent.id, status: 429, retryAfter: "7", body: '{"error":"rate_limited"}' });
    const response = await pending;
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("times out when the worker never answers", async () => {
    vi.useFakeTimers();
    const { fetcher } = setup();
    const pending = fetcher.fetch("https://api.example/x", { timeoutMs: 1000 });
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("rejects on abort and ignores a late answer", async () => {
    const { fetcher, worker } = setup();
    const controller = new AbortController();
    const pending = fetcher.fetch("https://api.example/x", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(() => worker().reply({ id: worker().posted[0].id, status: 200, body: "{}" })).not.toThrow();
  });

  it("fails pending requests when the worker crashes, and stops it on dispose", async () => {
    const { fetcher, worker } = setup();
    const pending = fetcher.fetch("https://api.example/x");
    worker().crash();
    await expect(pending).rejects.toThrow();
    fetcher.dispose();
    expect(worker().terminated).toBe(true);
  });

  it("is unavailable when the worker cannot start", () => {
    expect(
      createOpaqueFetcher(() => {
        throw new Error("blocked");
      }),
    ).toBeNull();
  });
});
