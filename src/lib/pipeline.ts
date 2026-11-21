// ─── UniPulse AI — Ingestion Orchestrator ───────────────────────────────────
// raw item → GLM triage/extraction → Task (source_id dedup) → autonomous
// scheduling with conflict auto-adjustment logging.

import { db } from "@/lib/db";
import { extractItem } from "@/lib/agent";
import { planTask, type BlockWithTask } from "@/lib/scheduler";
import type { AgentExtraction, AdjustmentNotice } from "@/lib/types";

export interface IngestInput {
  source: string; // gmail | moodle | demo | seed
  sourceId: string;
  subject: string;
  body: string;
  receivedAt?: Date;
  forceHeuristic?: boolean;
}

export interface IngestResult {
  discarded: boolean;
  created: boolean;
  aiUsed: boolean;
  task: {
    id: string;
    title: string;
    source: string;
    category: string;
    urgencyScore: number;
    requiresReply: boolean;
    suggestedReply: string | null;
    eventDatetime: string | null;
    isFixedEvent: boolean;
  } | null;
  extraction: AgentExtraction;
  adjustments: AdjustmentNotice[];
}

async function loadBlocksWithTasks(): Promise<BlockWithTask[]> {
  const blocks = await db.scheduledBlock.findMany({
    where: { start: { gte: new Date(Date.now() - 2 * 86400_000) } },
    include: { task: true },
    orderBy: { start: "asc" },
  });
  return blocks.map((b) => ({
    id: b.id,
    taskId: b.taskId,
    type: b.type as "fixed" | "prep",
    title: b.title,
    start: b.start,
    end: b.end,
    locked: b.locked,
    priority: b.priority,
    task: b.task
      ? {
          id: b.task.id,
          title: b.task.title,
          category: b.task.category,
          eventDatetime: b.task.eventDatetime,
          isFixedEvent: b.task.isFixedEvent,
          urgencyScore: b.task.urgencyScore,
          prepHours: b.task.prepHours,
        }
      : undefined,
  }));
}

export async function ingestAndProcess(input: IngestInput): Promise<IngestResult> {
  const receivedAt = input.receivedAt ?? new Date();

  // ── Dedup gate: source_id unique => an email/event is never processed twice ──
  const existing = await db.rawFeedItem.findUnique({ where: { sourceId: input.sourceId } });
  if (existing?.processed) {
    const task = await db.task.findUnique({ where: { sourceId: input.sourceId } });
    return {
      discarded: existing.discarded,
      created: false,
      aiUsed: false,
      task: task
        ? {
            id: task.id,
            title: task.title,
            source: task.source,
            category: task.category,
            urgencyScore: task.urgencyScore,
            requiresReply: task.requiresReply,
            suggestedReply: task.suggestedReply,
            eventDatetime: task.eventDatetime?.toISOString() ?? null,
            isFixedEvent: task.isFixedEvent,
          }
        : null,
      extraction: { is_actionable: !existing.discarded, title: task?.title ?? existing.subject, source: "Professor", category: "Admin", event_datetime: null, is_fixed_event: false, urgency_score: task?.urgencyScore ?? 1, requires_reply: false, suggested_reply: null, prep_hours: 0, reasoning: "Already processed (dedup gate)." },
      adjustments: [],
    };
  }

  const raw = existing
    ? await db.rawFeedItem.update({ where: { id: existing.id }, data: { subject: input.subject, body: input.body, receivedAt } })
    : await db.rawFeedItem.create({
        data: { source: input.source, sourceId: input.sourceId, subject: input.subject, body: input.body, receivedAt },
      });

  // ── Steps 1+2: GLM triage & structured extraction (heuristic fallback) ──
  const { extraction, aiUsed } = await extractItem(input.subject, input.body, input.source, {
    forceHeuristic: input.forceHeuristic,
  });

  if (!extraction.is_actionable) {
    await db.rawFeedItem.update({ where: { id: raw.id }, data: { processed: true, discarded: true } });
    return {
      discarded: true,
      created: false,
      aiUsed,
      task: null,
      extraction,
      adjustments: [],
    };
  }

  // ── Task upsert (sourceId dedup) ──
  const taskData = {
    source: extraction.source,
    category: extraction.category,
    title: extraction.title,
    eventDatetime: extraction.event_datetime ? new Date(extraction.event_datetime) : null,
    isFixedEvent: extraction.is_fixed_event,
    urgencyScore: extraction.urgency_score,
    requiresReply: extraction.requires_reply,
    suggestedReply: extraction.suggested_reply,
    prepHours: extraction.prep_hours,
    rawSubject: input.subject,
    rawBody: input.body.slice(0, 4000),
    aiProcessed: aiUsed,
  };

  const task = await db.task.upsert({
    where: { sourceId: input.sourceId },
    create: { sourceId: input.sourceId, ...taskData, status: "pending" },
    update: { ...taskData, status: "pending" },
  });

  // ── Step 3: Autonomous timetable & conflict solver ──
  const blocks = await loadBlocksWithTasks();
  const plan = planTask(
    {
      id: task.id,
      title: task.title,
      category: task.category,
      eventDatetime: task.eventDatetime,
      isFixedEvent: task.isFixedEvent,
      urgencyScore: task.urgencyScore,
      prepHours: task.prepHours,
    },
    blocks,
  );

  // Remove auto-shifted (colliding) prep blocks, then write the new plan
  if (plan.removeIds.length > 0) {
    await db.scheduledBlock.deleteMany({ where: { id: { in: plan.removeIds } } });
  }
  for (const b of plan.create) {
    await db.scheduledBlock.create({
      data: { taskId: b.taskId ?? task.id, type: b.type, title: b.title, start: b.start, end: b.end, locked: b.locked, priority: b.priority },
    });
  }
  for (const adj of plan.adjustments) {
    await db.scheduleAdjustment.create({ data: { summary: adj.summary, detail: adj.detail } });
  }

  await db.rawFeedItem.update({ where: { id: raw.id }, data: { processed: true, discarded: false } });

  return {
    discarded: false,
    created: true,
    aiUsed,
    task: {
      id: task.id,
      title: task.title,
      source: task.source,
      category: task.category,
      urgencyScore: task.urgencyScore,
      requiresReply: task.requiresReply,
      suggestedReply: task.suggestedReply,
      eventDatetime: task.eventDatetime?.toISOString() ?? null,
      isFixedEvent: task.isFixedEvent,
    },
    extraction,
    adjustments: plan.adjustments,
  };
}
