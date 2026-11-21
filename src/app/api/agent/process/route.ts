import { NextResponse } from "next/server";
import { ingestAndProcess } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Manual agent entrypoint: push any subject/body through the GLM pipeline. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      subject?: string;
      body?: string;
      source?: string;
      sourceId?: string;
    };
    if (!body.subject || !body.body) {
      return NextResponse.json({ error: "subject and body are required" }, { status: 400 });
    }
    const result = await ingestAndProcess({
      source: body.source ?? "manual",
      sourceId: body.sourceId ?? `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      subject: body.subject,
      body: body.body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[UniPulse] /api/agent/process failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent processing failed" }, { status: 500 });
  }
}
