"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, ClipboardCopy, Clock, Lock, MailCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SOURCE_COLORS, type DashboardTask } from "@/lib/types";

function urgencyTone(score: number): string {
  if (score >= 9) return "border-red-400/50 bg-red-400/10 text-red-300";
  if (score >= 7) return "border-[#FFC93C]/50 bg-[#FFC93C]/10 text-[#FFC93C]";
  return "border-white/15 bg-white/5 text-muted-foreground";
}

function formatWhen(iso: string | null): string {
  if (!iso) return "No fixed date";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActionQueue({
  tasks,
  loading,
  onStatusChange,
}: {
  tasks: DashboardTask[];
  loading: boolean;
  onStatusChange: (id: string, status: "done" | "dismissed" | "pending") => Promise<void>;
}) {
  const [replyTask, setReplyTask] = useState<DashboardTask | null>(null);
  const [copied, setCopied] = useState(false);

  const copyReply = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("AI-drafted reply copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard unavailable — select the text manually");
    }
  };

  return (
    <section aria-label="Critical action and reply queue" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-[#D9DADC] uppercase">Critical Action &amp; Reply Queue</h2>
          <p className="text-xs text-muted-foreground">Zero manual entry — sorted by urgency score</p>
        </div>
        <Badge variant="outline" className="border-[#FFC93C]/40 bg-[#FFC93C]/10 text-[#FFC93C]">
          {tasks.length} pending
        </Badge>
      </div>

      <div className="scrollbar-slim flex max-h-[calc(100vh-330px)] min-h-[280px] flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[calc(100vh-300px)]">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg bg-white/5" />)
        ) : tasks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-10 text-center">
            <MailCheck className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-muted-foreground">Queue clear — the agent is watching</p>
            <p className="text-xs text-muted-foreground/70">New Gmail + Moodle items will appear here automatically</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {tasks.map((task) => {
              const colors = SOURCE_COLORS[task.source] ?? SOURCE_COLORS.Professor;
              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: -14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 40, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                >
                  <Card className="border-white/10 bg-card shadow-none">
                    <CardContent className="flex flex-col gap-2 p-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("font-semibold tracking-wide", colors.text, colors.border, colors.bg)}>
                          [{task.source.toUpperCase()}]
                        </Badge>
                        <Badge variant="outline" className="border-white/15 bg-white/5 text-muted-foreground">
                          {task.category}
                        </Badge>
                        <Badge variant="outline" className={cn("font-semibold", urgencyTone(task.urgencyScore))}>
                          URGENCY {task.urgencyScore}/10
                        </Badge>
                        {task.aiProcessed && (
                          <Badge variant="outline" className="border-[#FFC93C]/40 bg-[#FFC93C]/5 text-[#FFC93C]">
                            <Sparkles className="size-3" aria-hidden /> GLM
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm font-medium leading-snug text-[#D9DADC]">{task.title}</p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" aria-hidden />
                          {formatWhen(task.eventDatetime)}
                        </span>
                        {task.isFixedEvent ? (
                          <span className="inline-flex items-center gap-1 text-[#D9DADC]/80">
                            <Lock className="size-3" aria-hidden /> Fixed commitment
                          </span>
                        ) : task.prepHours > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[#FFC93C]">
                            <Sparkles className="size-3" aria-hidden /> AI Prep {task.prepHours}h scheduled
                          </span>
                        ) : null}
                      </div>

                      {task.requiresReply && task.suggestedReply && (
                        <Button
                          size="sm"
                          onClick={() => setReplyTask(task)}
                          className="mt-1 w-full gap-1.5 bg-[#FFC93C] text-[#1E2024] hover:bg-[#ffd45f]"
                        >
                          <MailCheck className="size-3.5" aria-hidden />
                          Review &amp; Copy Confirmation Reply
                        </Button>
                      )}

                      <div className="mt-1 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-emerald-300"
                          onClick={() => void onStatusChange(task.id, "done")}
                          aria-label={`Mark done: ${task.title}`}
                        >
                          <Check className="size-3.5" aria-hidden /> Done
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-red-300"
                          onClick={() => void onStatusChange(task.id, "dismissed")}
                          aria-label={`Dismiss: ${task.title}`}
                        >
                          <X className="size-3.5" aria-hidden /> Dismiss
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* AI-drafted reply dialog */}
      <Dialog open={replyTask !== null} onOpenChange={(open) => !open && setReplyTask(null)}>
        <DialogContent className="border-white/15 bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#D9DADC]">
              <MailCheck className="size-4 text-[#FFC93C]" aria-hidden />
              AI-Drafted Confirmation Reply
            </DialogTitle>
            <DialogDescription className="text-xs">
              {replyTask?.rawSubject ?? replyTask?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="scrollbar-slim max-h-64 overflow-y-auto rounded-md border border-white/10 bg-black/30 p-3">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#D9DADC]">
              {replyTask?.suggestedReply ?? ""}
            </pre>
          </div>
          <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden />
              Drafted by Z.ai GLM — edit freely before sending
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/15"
                onClick={() => void onStatusChange(replyTask!.id, "done")}
              >
                <Check className="size-3.5" aria-hidden /> Mark Done
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-[#FFC93C] text-[#1E2024] hover:bg-[#ffd45f]"
                onClick={() => replyTask?.suggestedReply && void copyReply(replyTask.suggestedReply)}
              >
                {copied ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy Reply"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
