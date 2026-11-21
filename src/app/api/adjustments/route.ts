import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Acknowledges all pending "Schedule Auto-Adjusted" notices. */
export async function POST() {
  await db.scheduleAdjustment.updateMany({ where: { acknowledged: false }, data: { acknowledged: true } });
  return NextResponse.json({ ok: true });
}
