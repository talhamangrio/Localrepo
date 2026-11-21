import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { googleOAuthConfigured } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await db.userConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  return NextResponse.json({
    studentName: config.studentName,
    googleConfigured: googleOAuthConfigured(),
    gmailConnected: config.gmailConnected,
    moodleConnected: Boolean(config.moodleIcsUrl),
    moodleIcsUrl: config.moodleIcsUrl,
    lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
  });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { studentName?: string; moodleIcsUrl?: string | null };
    const data: { studentName?: string; moodleIcsUrl?: string | null } = {};
    if (typeof body.studentName === "string" && body.studentName.trim()) data.studentName = body.studentName.trim().slice(0, 80);
    if (body.moodleIcsUrl !== undefined) {
      if (body.moodleIcsUrl === null || body.moodleIcsUrl === "") data.moodleIcsUrl = null;
      else if (/^https?:\/\//i.test(body.moodleIcsUrl)) data.moodleIcsUrl = body.moodleIcsUrl.trim();
      else return NextResponse.json({ error: "Moodle URL must start with http:// or https://" }, { status: 400 });
    }
    const config = await db.userConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
    return NextResponse.json({ ok: true, studentName: config.studentName, moodleIcsUrl: config.moodleIcsUrl });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
