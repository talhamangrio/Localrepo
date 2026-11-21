import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Marks a task done/dismissed (or restores it to pending) and cleans up
 *  its scheduled blocks. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { status } = (await req.json()) as { status?: string };
    const allowed = ["pending", "done", "dismissed"];
    if (!status || !allowed.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${allowed.join(", ")}` }, { status: 400 });
    }

    const task = await db.task.update({
      where: { id },
      data: { status },
    });

    if (status !== "pending") {
      await db.scheduledBlock.deleteMany({ where: { taskId: id } });
    }

    return NextResponse.json({ ok: true, task: { id: task.id, status: task.status } });
  } catch (err) {
    console.error("[UniPulse] task patch failed:", err);
    return NextResponse.json({ error: "Task not found or update failed" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}
