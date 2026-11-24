"use client";

import { realtimeEnabled } from "@/lib/useLive";

export function LiveBadge({ stale }: { stale: boolean }) {
  if (stale)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
        <span className="h-2 w-2 rounded-full bg-rose-500" /> Connection lost, retrying…
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
      title={realtimeEnabled ? "Supabase Realtime + polling" : "Polling every 2s"}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live
    </span>
  );
}
