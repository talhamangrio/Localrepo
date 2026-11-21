import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { googleOAuthConfigured } from "@/lib/gmail";
import type { DashboardData, DashboardBlock, DashboardTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();

    const config = await db.userConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });

    const [tasks, blocks, adjustments] = await Promise.all([
      db.task.findMany({
        where: { status: "pending" },
        orderBy: [{ urgencyScore: "desc" }, { eventDatetime: "asc" }, { createdAt: "desc" }],
        take: 50,
      }),
      db.scheduledBlock.findMany({
        where: { start: { gte: new Date(Date.now() - 86400_000) } },
        orderBy: { start: "asc" },
        take: 300,
      }),
      db.scheduleAdjustment.findMany({
        where: { acknowledged: false },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const payload: DashboardData = {
      config: {
        studentName: config.studentName,
        googleConfigured: googleOAuthConfigured(),
        gmailConnected: config.gmailConnected,
        moodleConnected: Boolean(config.moodleIcsUrl),
        moodleIcsUrl: config.moodleIcsUrl,
        lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
      },
      tasks: tasks.map(
        (t): DashboardTask => ({
          id: t.id,
          source: t.source as DashboardTask["source"],
          category: t.category as DashboardTask["category"],
          title: t.title,
          eventDatetime: t.eventDatetime?.toISOString() ?? null,
          isFixedEvent: t.isFixedEvent,
          urgencyScore: t.urgencyScore,
          requiresReply: t.requiresReply,
          suggestedReply: t.suggestedReply,
          prepHours: t.prepHours,
          rawSubject: t.rawSubject,
          status: t.status,
          aiProcessed: t.aiProcessed,
          createdAt: t.createdAt.toISOString(),
        }),
      ),
      blocks: blocks.map(
        (b): DashboardBlock => ({
          id: b.id,
          taskId: b.taskId,
          type: b.type as "fixed" | "prep",
          title: b.title,
          start: b.start.toISOString(),
          end: b.end.toISOString(),
          locked: b.locked,
          priority: b.priority,
          autoAdjusted: b.autoAdjusted,
        }),
      ),
      adjustments: adjustments.map((a) => ({
        id: a.id,
        summary: a.summary,
        detail: a.detail,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[UniPulse] /api/events failed:", err);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}
