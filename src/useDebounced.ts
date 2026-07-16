import { useEffect, useState } from "react";

/** Trailing-debounced copy of `value`: updates `ms` after the last change, so per-keystroke
 *  consumers (preview render, outline parse) run once per typing pause instead of per key.
 *  A `resetKey` change (switching documents) bypasses the delay — the new doc must show
 *  instantly, never the previous one for `ms`. Render-phase reset per the React "adjusting
 *  state when a prop changes" pattern. */
export function useDebouncedValue<T>(value: T, ms: number, resetKey?: unknown): T {
  const [current, setCurrent] = useState({ value, resetKey });
  if (current.resetKey !== resetKey) setCurrent({ value, resetKey });
  useEffect(() => {
    if (Object.is(current.value, value)) return;
    const t = setTimeout(() => setCurrent({ value, resetKey }), ms);
    return () => clearTimeout(t);
  }, [value, ms, resetKey, current.value]);
  return current.resetKey === resetKey ? current.value : value;
}
