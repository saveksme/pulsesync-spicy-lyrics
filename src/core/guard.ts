import type { Host } from "./host";

// PulseSync disables an add-on after a few uncaught errors, and player snapshots arrive
// four times a second, so callbacks driven by the host or the page never throw.
export function guarded<A extends unknown[]>(log: Host["log"], label: string, fn: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    try {
      fn(...args);
    } catch (error) {
      log.error(`[spicy-lyrics] ${label} failed`, error);
    }
  };
}
