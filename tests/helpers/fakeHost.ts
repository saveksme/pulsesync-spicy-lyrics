import type { Host, HostStorage } from "../../src/core/host";
import { DEFAULT_SETTINGS } from "../../src/settings";

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

// Routes are URL prefixes; the longest matching prefix wins, anything else is a 404.
export function fakeFetch(routes: Record<string, Route>) {
  const prefixes = Object.keys(routes).sort((a, b) => b.length - a.length);
  return async (input: string, init?: RequestInit): Promise<Response> => {
    init?.signal?.throwIfAborted();
    const url = new URL(input);
    const prefix = prefixes.find((candidate) => url.href.startsWith(candidate));
    if (!prefix) return new Response("{}", { status: 404 });
    return routes[prefix](url, init);
  };
}

export function memoryStorage(): HostStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string) {
      return (data.has(key) ? structuredClone(data.get(key)) : undefined) as T | undefined;
    },
    async set(key: string, value: unknown) {
      data.set(key, structuredClone(value));
    },
    async remove(key: string) {
      data.delete(key);
    },
  };
}

export function fakeHost(overrides: Partial<Host> = {}): Host {
  const noop = () => {};
  return {
    fetch: fakeFetch({}),
    storage: memoryStorage(),
    getYandexLyrics: async () => null,
    onPlayer: () => noop,
    seek: noop,
    togglePlay: noop,
    next: noop,
    previous: noop,
    setVolume: noop,
    getSettings: () => DEFAULT_SETTINGS,
    onSettings: () => noop,
    notify: noop,
    log: { info: noop, warn: noop, error: noop },
    ...overrides,
  };
}
