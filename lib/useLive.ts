"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

// ---- optional Supabase Realtime: any change in schema "tb" triggers an immediate refetch
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let sb: SupabaseClient | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function subscribeRealtime(fn: () => void): () => void {
  if (!SB_URL || !SB_KEY) return () => {};
  if (!sb) {
    sb = createClient(SB_URL, SB_KEY);
    sb.channel("tb-all")
      .on("postgres_changes", { event: "*", schema: "tb" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => listeners.forEach((f) => f()), 120);
      })
      .subscribe();
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const realtimeEnabled = Boolean(SB_URL && SB_KEY);

type LiveState<T> = { data?: T; now?: string; clockOffsetH?: number; error?: string; stale: boolean };

/** Polls a JSON endpoint (default every 2s), refetches on focus and on realtime events. */
export function useLive<T>(url: string | null, intervalMs = 2000) {
  const [state, setState] = useState<LiveState<T>>({ stale: false });
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!url || inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) setState((s) => ({ ...s, error: json.error ?? `HTTP ${res.status}`, stale: false }));
      else setState({ data: json.data as T, now: json.now, clockOffsetH: json.clockOffsetH, stale: false });
    } catch {
      setState((s) => ({ ...s, stale: true })); // network down: keep last data, show banner
    } finally {
      inflight.current = false;
    }
  }, [url]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, intervalMs);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const unsub = subscribeRealtime(refresh);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      unsub();
    };
  }, [refresh, intervalMs]);

  return { ...state, refresh };
}

/** A stable idempotency key per logical action; rotate() after a definitive result. */
export function useIdemKey() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return [key, () => setKey(crypto.randomUUID())] as const;
}
