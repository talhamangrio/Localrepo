// ─── UniPulse AI — Step 3: Autonomous Timetable & Conflict Solver ───────────
// Locks fixed commitments, auto-slots prep blocks into free gaps (exams and
// quizzes alike), and shifts lower-priority blocks when urgent appointments
// collide with the schedule.

import type { AdjustmentNotice } from "@/lib/types";
import { DAY_START_HOUR, DAY_END_HOUR } from "@/lib/types";

export interface TaskLike {
  id?: string;
  title: string;
  category: string;
  eventDatetime: Date | null;
  isFixedEvent: boolean;
  urgencyScore: number;
  prepHours: number;
}

export interface BlockLike {
  id?: string;
  taskId?: string | null;
  type: "fixed" | "prep";
  title: string;
  start: Date;
  end: Date;
  locked: boolean;
  priority: number;
}

export interface BlockWithTask extends BlockLike {
  task?: TaskLike;
}

export interface BlockInput {
  taskId?: string | null;
  type: "fixed" | "prep";
  title: string;
  start: Date;
  end: Date;
  locked: boolean;
  priority: number;
}

const FIXED_DURATION_MIN: Record<string, number> = {
  Exam: 120,
  Appointment: 60,
  "Reply Required": 30,
  Admin: 30,
  Quiz: 60,
};

const FALLBACK_PREP_HOURS: Record<string, number> = {
  Exam: 5,
  Quiz: 2.5,
  Appointment: 0,
  Admin: 1,
  "Reply Required": 0.5,
};

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function atHour(day: Date, hour: number, minute = 0): Date {
  const x = startOfDay(day);
  x.setHours(hour, minute, 0, 0);
  return x;
}

function fmt(d: Date): string {
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Adds 22:00→08:00 overnight barriers so no AI block lands outside the
 *  student's daily study window (08:00-22:00). */
function withNightBarriers(
  pool: Array<{ start: Date; end: Date }>,
  windowStart: Date,
  windowEnd: Date,
): Array<{ start: Date; end: Date }> {
  const busy = [...pool];
  const firstNight = startOfDay(windowStart);
  const lastNight = startOfDay(windowEnd);
  for (let day = new Date(firstNight); day <= lastNight; day.setDate(day.getDate() + 1)) {
    busy.push({ start: atHour(day, DAY_END_HOUR), end: atHour(new Date(day.getTime() + 86400_000), DAY_START_HOUR) });
  }
  return busy;
}

/** Free gaps inside the 08:00-22:00 study window, chronologically ordered. */
export function findFreeGaps(
  busyInput: Array<{ start: Date; end: Date }>,
  windowStart: Date,
  windowEnd: Date,
  minGapMin = 30,
): Array<{ start: Date; end: Date }> {
  if (windowStart >= windowEnd) return [];
  const busy = withNightBarriers(busyInput, windowStart, windowEnd);
  const clipped = busy
    .filter((b) => b.end > windowStart && b.start < windowEnd)
    .map((b) => ({
      start: new Date(Math.max(b.start.getTime(), windowStart.getTime())),
      end: new Date(Math.min(b.end.getTime(), windowEnd.getTime())),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const gaps: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(windowStart);
  for (const b of clipped) {
    if (b.start.getTime() - cursor.getTime() >= minGapMin * 60_000) {
      gaps.push({ start: new Date(cursor), end: new Date(b.start) });
    }
    if (b.end > cursor) cursor = new Date(b.end);
  }
  if (windowEnd.getTime() - cursor.getTime() >= minGapMin * 60_000) {
    gaps.push({ start: new Date(cursor), end: new Date(windowEnd) });
  }
  return gaps;
}

function fillGap(
  gap: { start: Date; end: Date },
  remainingMin: number,
  maxSessionMin: number,
  minSessionMin: number,
): Array<{ start: Date; end: Date; minutes: number }> {
  const sessions: Array<{ start: Date; end: Date; minutes: number }> = [];
  let cursor = new Date(gap.start);
  while (remainingMin >= minSessionMin && gap.end.getTime() - cursor.getTime() >= minSessionMin * 60_000) {
    const available = Math.floor((gap.end.getTime() - cursor.getTime()) / 60_000);
    const minutes = Math.min(maxSessionMin, available, remainingMin);
    if (minutes < minSessionMin) break;
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + minutes * 60_000);
    sessions.push({ start, end, minutes });
    remainingMin -= minutes;
    cursor = end;
  }
  return sessions;
}

export interface PlanResult {
  create: BlockInput[];
  removeIds: string[];
  adjustments: AdjustmentNotice[];
}

/**
 * Plans one task against the current schedule.
 * - Fixed events: locked immediately; colliding prep blocks are auto-relocated.
 * - Fixed exams AND flexible deadlines: AI prep sessions slotted into
 *   conflict-free gaps before the event/deadline.
 */
export function planTask(
  task: TaskLike,
  existing: BlockWithTask[],
  now: Date = new Date(),
): PlanResult {
  const adjustments: AdjustmentNotice[] = [];
  const create: BlockInput[] = [];
  const removeIds: string[] = [];

  /** Slots AI prep sessions into conflict-free gaps before `deadline`. */
  const slotPrep = (deadline: Date, hours: number): void => {
    if (hours <= 0) return;
    let remaining = Math.round(hours * 60);
    const windowStart = new Date(Math.max(now.getTime() + 45 * 60_000, atHour(startOfDay(now), DAY_START_HOUR).getTime()));
    const windowEnd = new Date(Math.min(deadline.getTime(), atHour(startOfDay(deadline), DAY_END_HOUR).getTime()));
    if (windowStart >= windowEnd) {
      adjustments.push({
        summary: "No prep capacity found",
        detail: `Deadline ${fmt(deadline)} is too close to schedule the ${hours}h preparation for "${task.title}".`,
      });
      return;
    }
    const pool = existing
      .filter((b) => !removeIds.includes(b.id ?? "__none__"))
      .map((b) => ({ start: b.start, end: b.end }));
    for (const c of create) pool.push({ start: c.start, end: c.end });
    const gaps = findFreeGaps(pool, windowStart, windowEnd, 45);
    const maxSessionMin = 120;
    const minSessionMin = 45;
    let scheduled = 0;
    for (const gap of gaps) {
      if (remaining < minSessionMin) break;
      const filled = fillGap(gap, remaining, maxSessionMin, minSessionMin);
      for (const s of filled) {
        create.push({
          taskId: task.id ?? null,
          type: "prep",
          title: `AI Prep: ${task.title}`,
          start: s.start,
          end: s.end,
          locked: false,
          priority: task.urgencyScore,
        });
        remaining -= s.minutes;
        scheduled += s.minutes;
        if (create.length >= 8) break;
      }
      if (create.length >= 8) break;
    }
    if (scheduled === 0) {
      adjustments.push({
        summary: "No prep capacity found",
        detail: `No free study gap before ${fmt(deadline)} to schedule the ${hours}h preparation for "${task.title}".`,
      });
    } else if (remaining > 0) {
      adjustments.push({
        summary: "Partial prep coverage",
        detail: `${scheduled} of ${Math.round(hours * 60)} prep minutes scheduled for "${task.title}" before ${fmt(deadline)} — the board is at capacity.`,
      });
    }
  };

  if (task.isFixedEvent && task.eventDatetime) {
    const durationMin = FIXED_DURATION_MIN[task.category] ?? 60;
    const start = new Date(task.eventDatetime);
    const end = new Date(start.getTime() + durationMin * 60_000);
    const fixedBlock: BlockLike = { type: "fixed", title: task.title, start, end, locked: true, priority: task.urgencyScore };

    // Collision detection against the current schedule
    const collidingPrep = existing.filter((b) => b.type === "prep" && !b.locked && overlaps(fixedBlock, b));
    const collidingFixed = existing.filter((b) => b.type === "fixed" && overlaps(fixedBlock, b));

    if (collidingFixed.length > 0) {
      adjustments.push({
        summary: "Schedule conflict detected",
        detail: `${task.title} overlaps ${collidingFixed.map((b) => `"${b.title}"`).join(", ")}. Both remain locked — review manually.`,
      });
    }

    // Lock the fixed commitment
    create.push({ taskId: task.id ?? null, type: "fixed", title: task.title, start, end, locked: true, priority: task.urgencyScore });

    // Auto-shift lower-priority prep blocks out of the collision zone
    if (collidingPrep.length > 0) {
      const pool = existing.filter((b) => !collidingPrep.some((c) => c.id && c.id === b.id));
      for (const prep of collidingPrep) {
        if (prep.id) removeIds.push(prep.id);
        const minutes = Math.max(30, Math.round((prep.end.getTime() - prep.start.getTime()) / 60_000));
        const searchEnd = prep.task?.eventDatetime
          ? new Date(Math.min(prep.task.eventDatetime.getTime(), now.getTime() + 10 * 86400_000))
          : new Date(now.getTime() + 7 * 86400_000);
        const gaps = findFreeGaps(pool, new Date(now.getTime() + 30 * 60_000), searchEnd, minutes);
        if (gaps.length > 0) {
          const slot = gaps[0];
          const relocatedEnd = new Date(slot.start.getTime() + minutes * 60_000);
          const relocated: BlockWithTask = {
            type: "prep",
            title: prep.title,
            start: slot.start,
            end: relocatedEnd,
            locked: false,
            priority: prep.priority,
            taskId: prep.taskId ?? null,
          };
          pool.push(relocated);
          pool.sort((a, b) => a.start.getTime() - b.start.getTime());
          create.push({ taskId: prep.taskId ?? null, type: "prep", title: prep.title, start: slot.start, end: relocatedEnd, locked: false, priority: prep.priority });
          adjustments.push({
            summary: "Schedule Auto-Adjusted",
            detail: `Prep block "${prep.title}" was moved to ${fmt(slot.start)} to make room for the urgent commitment "${task.title}".`,
          });
        } else {
          adjustments.push({
            summary: "Schedule Auto-Adjusted",
            detail: `Removed prep block "${prep.title}" for the urgent commitment "${task.title}" — no free gap found to relocate it.`,
          });
        }
      }
    }

    // Exams are fixed commitments but still need AI-scheduled preparation
    const fixedPrepHours = task.prepHours > 0 ? task.prepHours : (FALLBACK_PREP_HOURS[task.category] ?? 0);
    if (fixedPrepHours > 0) slotPrep(start, fixedPrepHours);

    return { create, removeIds, adjustments };
  }

  // ── Flexible task: slot AI prep sessions before the deadline ──
  const hours = task.prepHours > 0 ? task.prepHours : (FALLBACK_PREP_HOURS[task.category] ?? 1);
  slotPrep(task.eventDatetime ?? new Date(now.getTime() + 5 * 86400_000), hours);
  return { create, removeIds, adjustments };
}
