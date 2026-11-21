import { NextResponse } from "next/server";
import { ingestAndProcess } from "@/lib/pipeline";
import { scenarioPayload, scenarioDateHint, DEMO_SCENARIOS } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Live Demo Injector: fires a realistic Debrecen scenario through the full
 *  real-time AI pipeline — exactly what happens with real Gmail/Moodle data. */
export async function POST(req: Request) {
  try {
    const { scenario } = (await req.json()) as { scenario?: string };
    if (!scenario) return NextResponse.json({ error: "scenario id required" }, { status: 400 });

    const payload = scenarioPayload(scenario);
    if (!payload) {
      return NextResponse.json({
        error: `Unknown scenario. Available: ${DEMO_SCENARIOS.map((s) => s.id).join(", ")}`,
      }, { status: 400 });
    }

    const result = await ingestAndProcess({
      source: "demo",
      sourceId: `demo-${scenario}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      subject: payload.subject,
      body: payload.body,
    });

    return NextResponse.json({
      ok: true,
      scenario,
      dateHint: scenarioDateHint(scenario),
      ...result,
    });
  } catch (err) {
    console.error("[UniPulse Demo] simulate failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Simulation failed" }, { status: 500 });
  }
}
