// ─── First-run seeding: a realistic sample week so the dashboard is alive ───
// Uses the deterministic heuristic pipeline (no AI latency) with stable
// seed-* sourceIds, so re-ingesting the same real events later never dups.

import { db } from "@/lib/db";
import { ingestAndProcess } from "@/lib/pipeline";
import { scenarioPayload } from "@/lib/demo";

export async function ensureSeeded(): Promise<void> {
  const config = await db.userConfig.findUnique({ where: { id: "singleton" } });
  if (config?.seededAt) return;

  const taskCount = await db.task.count();
  const rawCount = await db.rawFeedItem.count();
  if (taskCount > 0 || rawCount > 0) {
    await db.userConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", seededAt: new Date() },
      update: { seededAt: new Date() },
    });
    return;
  }

  const now = new Date();
  const seeds: Array<{ id: string; scenario: string; hoursAgo: number }> = [
    { id: "seed-immigration-4471", scenario: "immigration_appointment", hoursAgo: 2 },
    { id: "seed-neptun-mbinfo101", scenario: "neptun_exam", hoursAgo: 5 },
    { id: "seed-moodle-dsa-quiz", scenario: "moodle_quiz", hoursAgo: 1 },
    { id: "seed-prof-consult-kiraly", scenario: "professor_email", hoursAgo: 3 },
  ];

  for (const seed of seeds) {
    const payload = scenarioPayload(seed.scenario, now);
    if (!payload) continue;
    try {
      await ingestAndProcess({
        source: "seed",
        sourceId: seed.id,
        subject: payload.subject,
        body: payload.body,
        receivedAt: new Date(now.getTime() - seed.hoursAgo * 3600_000),
        forceHeuristic: true,
      });
    } catch (err) {
      console.error("[UniPulse Seed] failed for", seed.id, err);
    }
  }

  await db.userConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", seededAt: new Date() },
    update: { seededAt: new Date() },
  });
}
