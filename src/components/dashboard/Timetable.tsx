"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Lock, Sparkles, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DAY_END_HOUR, DAY_START_HOUR, SOURCE_COLORS, type AgentSource, type DashboardBlock } from "@/lib/types";

interface BlockView extends DashboardBlock {
  source?: AgentSource;
}

const DAY_HOURS = DAY_END_HOUR - DAY_START_HOUR; // 14h: 08:00 → 22:00
const DAY_PX = 60;
const WEEK_PX = 34;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Interval-graph column layout so overlapping blocks sit side by side. */
function layoutColumns(blocks: BlockView[]) {
  const sorted = [...blocks].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const columnEnds: number[] = [];
  const colOf = new Map<string, number>();
  for (const b of sorted) {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    let col = columnEnds.findIndex((end) => end <= s);
    if (col === -1) {
      columnEnds.push(e);
      col = columnEnds.length - 1;
    } else {
      columnEnds[col] = e;
    }
    colOf.set(b.id, col);
  }
  return { colOf, total: Math.max(1, columnEnds.length) };
}

function BlockCard({
  block,
  compact,
  style,
}: {
  block: BlockView;
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  const isFixed = block.type === "fixed";
  const colors = block.source ? SOURCE_COLORS[block.source] : null;
  const start = new Date(block.start);
  const end = new Date(block.end);
  const time = `${start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      style={style}
      className={cn(
        "absolute overflow-hidden rounded-md px-2 py-1",
        isFixed
          ? "border border-solid border-white/30 bg-[#26282c]"
          : "border-2 border-dashed border-[#FFC93C]/60 bg-[#FFC93C]/[0.06]",
      )}
      title={`${block.title} · ${time}`}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", colors?.dot ?? (isFixed ? "bg-white/40" : "bg-[#FFC93C]"))}
      />
      <div className={cn("flex items-center gap-1", compact ? "text-[10px]" : "text-xs")}>
        {isFixed ? (
          <Lock className={cn("shrink-0", compact ? "size-2.5" : "size-3", "text-[#D9DADC]/70")} aria-label="Fixed commitment" />
        ) : (
          <Sparkles className={cn("shrink-0", compact ? "size-2.5" : "size-3", "text-[#FFC93C]")} aria-label="AI-scheduled prep block" />
        )}
        <span className={cn("truncate font-medium", isFixed ? "text-[#D9DADC]" : "text-[#FFC93C]")}>{block.title}</span>
      </div>
      <p className={cn("truncate text-[10px] text-muted-foreground", compact && "text-[9px]")}>{time}</p>
      {block.autoAdjusted && !compact && (
        <span className="mt-0.5 inline-block rounded border border-[#FFC93C]/40 bg-[#FFC93C]/10 px-1 text-[9px] text-[#FFC93C]">
          auto-adjusted
        </span>
      )}
    </motion.div>
  );
}

export function Timetable({
  blocks,
  sourceByTaskId,
  now,
  loading,
}: {
  blocks: DashboardBlock[];
  sourceByTaskId: Record<string, AgentSource>;
  now: Date;
  loading: boolean;
}) {
  const [view, setView] = useState<"day" | "week">("day");
  const [viewDate, setViewDate] = useState<Date>(() => new Date());

  const viewBlocks = useMemo<BlockView[]>(
    () =>
      blocks.map((b) => ({
        ...b,
        source: b.taskId ? sourceByTaskId[b.taskId] : undefined,
      })),
    [blocks, sourceByTaskId],
  );

  const dayBlocks = useMemo(
    () => viewBlocks.filter((b) => sameDay(new Date(b.start), viewDate)),
    [viewBlocks, viewDate],
  );

  const weekDays = useMemo(() => {
    const monday = startOfWeek(viewDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const shift = (dir: 1 | -1) => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + dir * (view === "day" ? 1 : 7));
    setViewDate(d);
  };

  const nowHour = now.getHours() + now.getMinutes() / 60;
  const showNowLine = sameDay(now, viewDate) && nowHour >= DAY_START_HOUR && nowHour <= DAY_END_HOUR;

  const dayLabel = viewDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  const weekLabel = `${weekDays[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <section aria-label="Autonomous smart timetable" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-[#D9DADC] uppercase">Autonomous Smart Timetable</h2>
          <p className="text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Lock className="inline size-3" aria-hidden /> Fixed commitments
            </span>
            {" · "}
            <span className="inline-flex items-center gap-1 text-[#FFC93C]">
              <Sparkles className="inline size-3" aria-hidden /> AI-scheduled prep blocks
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-white/15 p-0.5" role="tablist" aria-label="Timetable view">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  view === v ? "bg-[#FFC93C] text-[#1E2024]" : "text-muted-foreground hover:text-[#D9DADC]",
                )}
              >
                {v === "day" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7 border-white/15" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="min-w-[130px] text-center text-xs text-muted-foreground">
              {view === "day" ? dayLabel : weekLabel}
            </span>
            <Button variant="outline" size="icon" className="size-7 border-white/15" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            {!sameDay(now, viewDate) && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#FFC93C]" onClick={() => setViewDate(new Date())}>
                Today
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="scrollbar-slim rounded-lg border border-white/10 bg-card p-3">
        {loading ? (
          <div className="flex flex-col gap-2 py-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-white/5" />
            ))}
          </div>
        ) : view === "day" ? (
          /* ── Daily timeline 08:00 → 22:00 ── */
          <div className="flex">
            <div className="w-12 shrink-0 select-none" aria-hidden>
              {Array.from({ length: DAY_HOURS + 1 }).map((_, i) => (
                <div key={i} className="relative text-right text-[10px] text-muted-foreground" style={{ height: DAY_PX }}>
                  <span className="absolute -top-1.5 right-2">{String(DAY_START_HOUR + i).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            <div className="relative flex-1" style={{ height: DAY_HOURS * DAY_PX }}>
              {/* hour grid */}
              {Array.from({ length: DAY_HOURS + 1 }).map((_, i) => (
                <div key={i} className="absolute inset-x-0 border-t border-white/[0.06]" style={{ top: i * DAY_PX }} aria-hidden />
              ))}
              {/* now line */}
              {showNowLine && (
                <div className="absolute inset-x-0 z-20" style={{ top: (nowHour - DAY_START_HOUR) * DAY_PX }} aria-hidden>
                  <div className="relative border-t-2 border-red-400">
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(229,72,77,0.8)]" />
                  </div>
                </div>
              )}
              {/* blocks */}
              <AnimatePresence initial={false}>
                {(() => {
                  const laidOut = dayBlocks.map((b) => {
                    const start = new Date(b.start);
                    const end = new Date(b.end);
                    const top = Math.max(0, (start.getHours() + start.getMinutes() / 60 - DAY_START_HOUR) * DAY_PX);
                    const rawHeight = ((end.getTime() - start.getTime()) / 3_600_000) * DAY_PX; // hours × px-per-hour
                    return { block: b, top, height: Math.max(26, rawHeight) };
                  });
                  const { colOf, total } = layoutColumns(laidOut.map((l) => l.block));
                  return laidOut.map(({ block, top, height }) => {
                    const col = colOf.get(block.id) ?? 0;
                    const widthPct = 100 / total;
                    return (
                      <BlockCard
                        key={block.id}
                        block={block}
                        style={{
                          top,
                          height,
                          left: `calc(${col * widthPct}% + 4px)`,
                          width: `calc(${widthPct}% - 10px)`,
                        }}
                      />
                    );
                  });
                })()}
              </AnimatePresence>
              {dayBlocks.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
                  <Sunrise className="size-7 text-muted-foreground/60" aria-hidden />
                  <p className="text-xs text-muted-foreground">No commitments on this day</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Weekly grid Mon → Sun ── */
          <div className="flex">
            <div className="w-9 shrink-0 select-none" aria-hidden>
              {Array.from({ length: DAY_HOURS + 1 }).map((_, i) => (
                <div key={i} className="relative text-right text-[9px] text-muted-foreground" style={{ height: WEEK_PX }}>
                  <span className="absolute -top-1.5 right-1.5">{DAY_START_HOUR + i}</span>
                </div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-7 gap-1">
              {weekDays.map((day) => {
                const blocksForDay = viewBlocks.filter((b) => sameDay(new Date(b.start), day));
                const { colOf, total } = layoutColumns(blocksForDay);
                const isToday = sameDay(now, day);
                return (
                  <div key={day.toISOString()} className="flex flex-col">
                    <div className={cn("mb-1 text-center text-[10px] font-medium", isToday ? "text-[#FFC93C]" : "text-muted-foreground")}>
                      {day.toLocaleDateString("en-GB", { weekday: "short" })}
                      <span className={cn("ml-1", isToday ? "font-bold" : "text-muted-foreground/60")}>{day.getDate()}</span>
                    </div>
                    <div
                      className={cn(
                        "relative flex-1 rounded border",
                        isToday ? "border-[#FFC93C]/30 bg-[#FFC93C]/[0.03]" : "border-white/[0.07] bg-black/10",
                      )}
                      style={{ height: DAY_HOURS * WEEK_PX }}
                    >
                      {Array.from({ length: DAY_HOURS + 1 }).map((_, i) => (
                        <div key={i} className="absolute inset-x-0 border-t border-white/[0.05]" style={{ top: i * WEEK_PX }} aria-hidden />
                      ))}
                      <AnimatePresence initial={false}>
                        {blocksForDay.map((block) => {
                          const start = new Date(block.start);
                          const top = Math.max(0, (start.getHours() + start.getMinutes() / 60 - DAY_START_HOUR) * WEEK_PX);
                          const height = Math.max(20, ((new Date(block.end).getTime() - start.getTime()) / 3_600_000) * WEEK_PX);
                          const col = colOf.get(block.id) ?? 0;
                          const widthPct = 100 / total;
                          return (
                            <BlockCard
                              key={block.id}
                              block={block}
                              compact
                              style={{
                                top,
                                height,
                                left: `calc(${col * widthPct}% + 2px)`,
                                width: `calc(${widthPct}% - 6px)`,
                              }}
                            />
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
