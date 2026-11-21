"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDashboard } from "@/hooks/useDashboard";
import { Header } from "@/components/dashboard/Header";
import { ActionQueue } from "@/components/dashboard/ActionQueue";
import { Timetable } from "@/components/dashboard/Timetable";
import { DemoDrawer } from "@/components/dashboard/DemoDrawer";
import { ConnectAccountsModal } from "@/components/dashboard/ConnectAccountsModal";
import type { AgentSource } from "@/lib/types";

export default function UniPulseDashboard() {
  const { data, loading, syncing, now, reload, runSync } = useDashboard();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sourceByTaskId = useMemo<Record<string, AgentSource>>(() => {
    const map: Record<string, AgentSource> = {};
    for (const t of data?.tasks ?? []) map[t.id] = t.source;
    return map;
  }, [data?.tasks]);

  const handleStatusChange = async (id: string, status: "done" | "dismissed" | "pending") => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(status === "done" ? "Task completed" : status === "dismissed" ? "Task dismissed" : "Task restored");
      await reload();
    } catch (err) {
      toast.error("Update failed", { description: String(err) });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#1E2024] text-[#D9DADC]">
      <Header
        data={data}
        syncing={syncing}
        now={now}
        onSyncNow={() => void runSync(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)] lg:px-6">
        <ActionQueue tasks={data?.tasks ?? []} loading={loading} onStatusChange={handleStatusChange} />
        <Timetable blocks={data?.blocks ?? []} sourceByTaskId={sourceByTaskId} now={now} loading={loading} />
      </main>

      <DemoDrawer onChanged={reload} />

      <ConnectAccountsModal open={settingsOpen} onOpenChange={setSettingsOpen} data={data} onChanged={reload} />
    </div>
  );
}
