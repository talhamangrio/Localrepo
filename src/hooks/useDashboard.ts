"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DashboardData } from "@/lib/types";

const SYNC_INTERVAL_MS = 20_000;

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const seenAdjustments = useRef<Set<string>>(new Set());
  const greetedUrl = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as DashboardData;
      setData(payload);

      // Fire "Schedule Auto-Adjusted" toasts for unseen notices, then ack them.
      const fresh = payload.adjustments.filter((a) => !seenAdjustments.current.has(a.id));
      if (fresh.length > 0) {
        for (const adj of fresh.slice(0, 3)) {
          toast.warning(adj.summary, { description: adj.detail });
        }
        fresh.forEach((a) => seenAdjustments.current.add(a.id));
        void fetch("/api/adjustments", { method: "POST" });
      }
    } catch (err) {
      console.error("[UniPulse] events load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const runSync = useCallback(
    async (silent = false) => {
      if (syncing) return;
      setSyncing(true);
      try {
        const res = await fetch("/api/sync", { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = (await res.json()) as {
          gmail: { checked: boolean; newItems: number; error?: string; processed: string[]; discarded: string[] };
          moodle: { checked: boolean; newItems: number; error?: string; processed: string[]; discarded: string[] };
        };
        if (!silent) {
          const total = result.gmail.newItems + result.moodle.newItems;
          if (result.gmail.checked && result.gmail.newItems > 0) {
            toast.success(`Gmail Gate: ${result.gmail.newItems} new item(s) processed`, {
              description: result.gmail.processed.join(" · ") || undefined,
            });
          }
          if (result.moodle.checked && result.moodle.newItems > 0) {
            toast.success(`Moodle Sync: ${result.moodle.newItems} new event(s) captured`, {
              description: result.moodle.processed.join(" · ") || undefined,
            });
          }
          const discarded = [...result.gmail.discarded, ...result.moodle.discarded];
          if (discarded.length > 0) {
            toast.info(`Noise filter discarded ${discarded.length} non-actionable item(s)`);
          }
          const err = result.gmail.error ?? result.moodle.error;
          if (err) toast.error("Sync channel error", { description: err });
          if (total === 0 && !err && !result.gmail.checked && !result.moodle.checked && !silent) {
            toast("Sync complete — no connected channels yet", {
              description: "Connect Gmail + Moodle from the settings modal to go fully live.",
            });
          }
        }
        await load();
      } catch (err) {
        console.error("[UniPulse] sync failed:", err);
        if (!silent) toast.error("Background sync failed", { description: String(err) });
      } finally {
        setSyncing(false);
      }
    },
    [load, syncing],
  );

  // Initial load + 20s autonomous polling loop + 1s clock
  useEffect(() => {
    void load();
    const syncTimer = setInterval(() => void runSync(true), SYNC_INTERVAL_MS);
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(syncTimer);
      clearInterval(clockTimer);
    };
  }, []);

  // Greet OAuth return visits (?connected=gmail / ?google_error=...)
  useEffect(() => {
    if (greetedUrl.current || typeof window === "undefined") return;
    greetedUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "gmail") {
      toast.success("Gmail Gate connected", {
        description: "Your inbox is now under autonomous surveillance.",
      });
    } else if (params.get("google_error")) {
      toast.error("Google connection failed", {
        description: params.get("google_error") ?? "unknown error",
      });
    }
  }, []);

  return { data, loading, syncing, now, reload: load, runSync };
}
