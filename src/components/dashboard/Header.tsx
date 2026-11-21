"use client";

import { Activity, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

type PillState = "live" | "setup" | "error";

function StatusPill({ label, state, note }: { label: string; state: PillState; note?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        state === "live" && "border-[#FFC93C]/40 bg-[#FFC93C]/10 text-[#FFC93C]",
        state === "setup" && "border-white/15 bg-white/5 text-muted-foreground",
        state === "error" && "border-red-400/40 bg-red-400/10 text-red-300",
      )}
      title={note}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "live" && "bg-[#FFC93C] live-dot",
          state === "setup" && "bg-muted-foreground",
          state === "error" && "bg-red-400",
        )}
      />
      {label}
    </span>
  );
}

interface HeaderProps {
  data: DashboardData | null;
  syncing: boolean;
  now: Date;
  onSyncNow: () => void;
  onOpenSettings: () => void;
}

export function Header({ data, syncing, now, onSyncNow, onOpenSettings }: HeaderProps) {
  const gmailLive = Boolean(data?.config.googleConfigured && data?.config.gmailConnected);
  const moodleLive = Boolean(data?.config.moodleConnected);
  const lastSyncAgo = data?.config.lastSyncAt
    ? Math.max(0, Math.round((now.getTime() - new Date(data.config.lastSyncAt).getTime()) / 1000))
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1B1D21]/90 backdrop-blur supports-[backdrop-filter]:bg-[#1B1D21]/75">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#FFC93C] shadow-[0_0_18px_rgba(255,201,60,0.35)]">
            <Activity className="size-5 text-[#1E2024]" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight text-[#D9DADC]">
              UniPulse AI
            </p>
            <p className="text-[11px] text-muted-foreground">University of Debrecen Edition</p>
          </div>
        </div>

        {/* Live status pills */}
        <div className="flex flex-1 flex-wrap items-center gap-2" aria-label="Live connection status">
          <StatusPill
            label={gmailLive ? "Gmail Gate: Live" : "Gmail Gate: Setup"}
            state={gmailLive ? "live" : "setup"}
            note={gmailLive ? "Gmail inbox under autonomous surveillance" : "Add Google OAuth credentials to activate"}
          />
          <StatusPill
            label={moodleLive ? "Moodle .ics: Synced" : "Moodle .ics: Setup"}
            state={moodleLive ? "live" : "setup"}
            note={moodleLive ? data?.config.moodleIcsUrl ?? "Feed connected" : "Paste your elearning.unideb.hu calendar export URL"}
          />
          <StatusPill label="Z.ai GLM-5.3: Watching" state="live" note="Agent pipeline active" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {lastSyncAgo !== null && (
            <span className="hidden text-[11px] text-muted-foreground md:inline" aria-live="polite">
              {syncing ? "Syncing…" : `Synced ${lastSyncAgo}s ago`}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncNow}
            disabled={syncing}
            className="gap-1.5 border-white/15 bg-transparent hover:bg-white/5"
            aria-label="Sync now"
          >
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} aria-hidden />
            Sync Now
          </Button>
          <Button
            size="sm"
            onClick={onOpenSettings}
            className="gap-1.5 bg-[#FFC93C] text-[#1E2024] hover:bg-[#ffd45f]"
            aria-label="Connect accounts"
          >
            <Settings2 className="size-3.5" aria-hidden />
            Connect Accounts
          </Button>
        </div>
      </div>
    </header>
  );
}
