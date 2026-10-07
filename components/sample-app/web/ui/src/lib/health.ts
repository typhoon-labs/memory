// What is unavailable right now ("Search", "Registration"), reported by the
// requests that found out. The banner is red for as long as anything is down,
// and green for a few seconds when the last of them comes back.
import { useSyncExternalStore } from 'react';

export interface Health {
  /** What is down, and why. */
  down: ReadonlyMap<string, string>;
  recovered: { name: string; at: Date } | null;
}

// Long enough to be seen through the lag of a screen share.
const RECOVERED_MS = 10_000;

let health: Health = { down: new Map(), recovered: null };
const listeners = new Set<() => void>();
let clearRecovered: number | undefined;

function set(next: Health) {
  health = next;
  for (const listener of listeners) listener();
}

export function report(name: string, ok: boolean, detail = '') {
  const down = new Map(health.down);
  if (ok) {
    if (!down.delete(name)) return;
  } else {
    down.set(name, detail);
  }
  window.clearTimeout(clearRecovered);
  const recovered = ok && down.size === 0 ? { name, at: new Date() } : null;
  set({ down, recovered });
  if (recovered) clearRecovered = window.setTimeout(() => set({ ...health, recovered: null }), RECOVERED_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useHealth = () => useSyncExternalStore(subscribe, () => health);
