import type { HostFetchInit } from "../core/host";

// Yandex Music's page (and so every add-on world in it) sends Origin: music-application://desktop
// with cross-origin requests, an origin Spicy Lyrics cannot allowlist. A Web Worker started from a
// data: URL has an opaque origin, so its requests carry Origin: null, which can be allowlisted.
// The worker only runs this fixed code: it cannot reach the page, Yandex Music's data or cookies,
// and its requests still go through PulseSync's network allowlist.

export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message" | "error", listener: (event: { data?: unknown }) => void): void;
  terminate(): void;
}

export interface OpaqueFetcher {
  fetch(url: string, init?: HostFetchInit): Promise<Response>;
  dispose(): void;
}

export const OPAQUE_FETCH_WORKER = `"use strict";
self.addEventListener("message", async (event) => {
  const { id, url, headers } = event.data || {};
  try {
    const response = await fetch(url, { headers, credentials: "omit", cache: "no-store" });
    const body = await response.text();
    self.postMessage({ id, status: response.status, retryAfter: response.headers.get("Retry-After"), body });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
});`;

const DEFAULT_TIMEOUT_MS = 10_000;
const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

interface Reply {
  id?: unknown;
  status?: unknown;
  retryAfter?: unknown;
  body?: unknown;
  error?: unknown;
}

interface Pending {
  resolve(response: Response): void;
  reject(error: unknown): void;
  cleanup(): void;
}

export function createOpaqueFetcher(createWorker: (source: string) => WorkerLike): OpaqueFetcher | null {
  let worker: WorkerLike;
  try {
    worker = createWorker(OPAQUE_FETCH_WORKER);
  } catch {
    return null;
  }
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const settle = (id: number) => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    pending.delete(id);
    entry.cleanup();
    return entry;
  };
  const failAll = (error: Error) => {
    for (const id of [...pending.keys()]) settle(id)?.reject(error);
  };

  worker.addEventListener("message", (event) => {
    const reply = (event.data ?? {}) as Reply;
    if (typeof reply.id !== "number") return;
    const entry = settle(reply.id);
    if (!entry) return;
    const status = reply.status;
    if (typeof status !== "number" || status < 200 || status > 599) {
      entry.reject(new Error(typeof reply.error === "string" ? reply.error : "Opaque fetch failed"));
      return;
    }
    const headers = typeof reply.retryAfter === "string" && reply.retryAfter ? { "Retry-After": reply.retryAfter } : undefined;
    const body = NULL_BODY_STATUS.has(status) ? null : typeof reply.body === "string" ? reply.body : "";
    entry.resolve(new Response(body, { status, headers }));
  });
  worker.addEventListener("error", () => failAll(new Error("Opaque fetch worker failed")));

  return {
    fetch(url, init = {}) {
      return new Promise<Response>((resolve, reject) => {
        const { signal } = init;
        if (signal?.aborted) {
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          return;
        }
        const id = nextId++;
        const onAbort = () => settle(id)?.reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        const timer = setTimeout(
          () => settle(id)?.reject(new DOMException("Request timed out", "TimeoutError")),
          init.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
        pending.set(id, {
          resolve,
          reject,
          cleanup: () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
          },
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        worker.postMessage({ id, url, headers: Object.fromEntries(new Headers(init.headers).entries()) });
      });
    },
    dispose() {
      failAll(new Error("Opaque fetch stopped"));
      worker.terminate();
    },
  };
}
