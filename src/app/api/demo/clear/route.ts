import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** Clears all ingested tasks/blocks/raw items. With reseed:true the sample
 *  week is regenerated (handy between hackathon stage runs). */
export async function POST(req: Request) {
  try {
    const { reseed } = (await req.json().catch(() => ({}))) as { reseed?: boolean };

    await db.scheduledBlock.deleteMany({});
    await db.task.deleteMany({});
    await db.rawFeedItem.deleteMany({});
    await db.scheduleAdjustment.deleteMany({});

    if (reseed) {
      await db.userConfig.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", seededAt: null },
        update: { seededAt: null },
      });
      await ensureSeeded();
    } else {
      await db.userConfig.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", seededAt: new Date() },
        update: { seededAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true, reseeded: Boolean(reseed) });
  } catch (err) {
    console.error("[UniPulse Demo] clear failed:", err);
    return NextResponse.json({ error: "Clear failed" }, { status: 500 });
  }
}
