"use client";

import { useSyncExternalStore } from "react";

export const live = {
  p: 0,
  ps: 0,
  px: 0,
  py: 0,
  sx: 0,
  sy: 0,
  n: 1,
  top: 0.2,
  bottom: 0.7,
  modelTop: 1,
};

type State = { plate: number; pick: number | null };

let state: State = { plate: 0, pick: null };
const listeners = new Set<() => void>();

export const exhibit = {
  get: () => state,
  set(partial: Partial<State>) {
    const next = { ...state, ...partial };
    if (next.plate === state.plate && next.pick === state.pick) return;
    state = next;
    for (const l of listeners) l();
  },
  reset() {
    state = { plate: 0, pick: null };
    live.p = 0;
    live.ps = 0;
    for (const l of listeners) l();
  },
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export function useExhibit<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    exhibit.subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const ease = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const seg = (p: number, a: number, b: number) => ease((p - a) / (b - a));
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
