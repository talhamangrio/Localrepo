import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchIcsFeed } from "@/lib/ics";

export const dynamic = "force-dynamic";

/** Saves the private Moodle .ics export URL and validates it live. */
export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || !/^https?:\/\//i.test(url.trim())) {
      return NextResponse.json({ error: "Please paste the full https:// calendar export URL" }, { status: 400 });
    }
    const clean = url.trim();
    let eventsFound = 0;
    try {
      const events = await fetchIcsFeed(clean);
      eventsFound = events.length;
    } catch (err) {
      return NextResponse.json(
        {
          error: `Saved, but the feed test failed: ${err instanceof Error ? err.message : "unreachable"}`,
          saved: true,
        },
        { status: 200 },
      );
    }
    await db.userConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", moodleIcsUrl: clean },
      update: { moodleIcsUrl: clean },
    });
    return NextResponse.json({ ok: true, saved: true, eventsFound });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

/** Disconnect the Moodle feed. */
export async function DELETE() {
  await db.userConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: { moodleIcsUrl: null } });
  return NextResponse.json({ ok: true });
}
