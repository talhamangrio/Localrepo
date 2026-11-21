"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, FlaskConical, Loader2, RotateCcw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEMO_SCENARIOS } from "@/lib/demo";

export function DemoDrawer({ onChanged }: { onChanged: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const simulate = async (scenarioId: string) => {
    setBusyId(scenarioId);
    try {
      const res = await fetch("/api/demo/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioId }),
      });
      const result = (await res.json()) as {
        error?: string;
        discarded?: boolean;
        aiUsed?: boolean;
        task?: { title: string; source: string; category: string; urgencyScore: number; requiresReply: boolean } | null;
        adjustments?: Array<{ summary: string; detail: string }>;
      };
      if (result.error) {
        toast.error("Injection failed", { description: result.error });
      } else if (result.discarded) {
        toast.info("Noise filter activated", {
          description: "GLM triage marked this item non-actionable and discarded it.",
        });
      } else if (result.task) {
        toast.success(`${result.task.source.toUpperCase()} item captured`, {
          description: `"${result.task.title}" · urgency ${result.task.urgencyScore}/10 · ${
            result.aiUsed ? "GLM-processed" : "rule engine"
          }${result.task.requiresReply ? " · reply drafted" : ""}`,
        });
      }
      await onChanged();
    } catch (err) {
      toast.error("Injection failed", { description: String(err) });
    } finally {
      setBusyId(null);
    }
  };

  const resetAll = async () => {
    setResetting(true);
    try {
      await fetch("/api/demo/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reseed: true }),
      });
      toast.success("Dashboard reset", { description: "Sample week regenerated for the next run." });
      await onChanged();
    } catch (err) {
      toast.error("Reset failed", { description: String(err) });
    } finally {
      setResetting(false);
    }
  };

  return (
    <footer className="mt-auto border-t border-white/10 bg-[#1B1D21]">
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mx-auto w-full max-w-[1600px] px-4 pb-4 pt-4 lg:px-6">
              <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <FlaskConical className="size-3.5 text-[#FFC93C]" aria-hidden />
                Fire a realistic University of Debrecen event through the full real-time AI pipeline — no Google keys needed.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {DEMO_SCENARIOS.map((s) => (
                  <Button
                    key={s.id}
                    variant="outline"
                    disabled={busyId !== null}
                    onClick={() => void simulate(s.id)}
                    className={cn(
                      "h-auto flex-col items-start gap-0.5 border-white/15 bg-card px-3 py-2.5 text-left hover:border-[#FFC93C]/50 hover:bg-white/5",
                      s.id === "noise_newsletter" && "opacity-90",
                    )}
                  >
                    <span className="flex w-full items-center gap-2 text-xs font-medium text-[#D9DADC]">
                      {busyId === s.id ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin text-[#FFC93C]" aria-hidden />
                      ) : (
                        <Zap className="size-3.5 shrink-0 text-[#FFC93C]" aria-hidden />
                      )}
                      {s.label}
                    </span>
                    <span className="pl-5 text-[11px] font-normal text-muted-foreground">{s.description}</span>
                  </Button>
                ))}
                <Button
                  variant="outline"
                  disabled={resetting}
                  onClick={() => void resetAll()}
                  className="h-auto flex-col items-start gap-0.5 border-red-400/30 bg-card px-3 py-2.5 text-left hover:border-red-400/60 hover:bg-red-400/5"
                >
                  <span className="flex w-full items-center gap-2 text-xs font-medium text-red-300">
                    {resetting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />}
                    Reset Sample Week
                  </span>
                  <span className="pl-5 text-[11px] font-normal text-muted-foreground">
                    Wipe all tasks &amp; blocks, regenerate the demo dataset
                  </span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-[1600px] px-4 lg:px-6">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="demo-injector-panel"
          className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-[#FFC93C]">
            <span className="flex size-5 items-center justify-center rounded bg-[#FFC93C]/15">
              <Zap className="size-3 text-[#FFC93C]" aria-hidden />
            </span>
            Live Demo Injector — simulate incoming events without real credentials
          </span>
          <span className="flex items-center gap-3">
            <Trash2 className="size-3 text-muted-foreground/50" aria-hidden />
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
            )}
          </span>
        </button>
      </div>
    </footer>
  );
}
