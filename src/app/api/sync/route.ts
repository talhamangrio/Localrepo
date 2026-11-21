import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAccessToken, fetchUnreadEmails, googleOAuthConfigured } from "@/lib/gmail";
import { fetchIcsFeed } from "@/lib/ics";
import { ingestAndProcess } from "@/lib/pipeline";
import { heuristicExtract } from "@/lib/agent";
import type { SyncChannelResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Background sync: polls Gmail (when OAuth is live) and the Moodle .ics feed,
 *  pushes every new item through the GLM agent pipeline. Never throws. */
export async function POST() {
  const config = await db.userConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });

  const gmail: SyncChannelResult = { checked: false, newItems: 0, processed: [], discarded: [] };
  const moodle: SyncChannelResult = { checked: false, newItems: 0, processed: [], discarded: [] };

  // ── Gmail Gate ──
  if (googleOAuthConfigured() && config.gmailConnected) {
    gmail.checked = true;
    try {
      const { token, updated } = await ensureAccessToken(config);
      if (updated) {
        await db.userConfig.update({ where: { id: "singleton" }, data: updated });
      }
      const emails = await fetchUnreadEmails(token, 5);
      let handled = 0;
      for (const email of emails) {
        if (handled >= 3) break; // bound AI latency per cycle
        const sourceId = `gmail-${email.id}`;
        const existing = await db.rawFeedItem.findUnique({ where: { sourceId } });
        if (existing?.processed) continue;
        const result = await ingestAndProcess({
          source: "gmail",
          sourceId,
          subject: email.subject,
          body: `From: ${email.from}\n\n${email.body}`,
          receivedAt: email.date,
        });
        handled += 1;
        gmail.newItems += 1;
        if (result.discarded) gmail.discarded.push(email.subject);
        else gmail.processed.push(result.task?.title ?? email.subject);
      }
    } catch (err) {
      gmail.error = err instanceof Error ? err.message : "Gmail sync failed";
      console.error("[UniPulse Sync] gmail:", err);
    }
  }

  // ── Moodle .ics Live Sync ──
  if (config.moodleIcsUrl) {
    moodle.checked = true;
    try {
      const events = await fetchIcsFeed(config.moodleIcsUrl);
      let handled = 0;
      for (const ev of events) {
        if (!ev.start || ev.start.getTime() < Date.now() - 86400_000) continue;
        if (handled >= 3) break;
        const sourceId = `moodle-${ev.uid}`;
        const existing = await db.rawFeedItem.findUnique({ where: { sourceId } });
        if (existing?.processed) continue;
        // Fast-path: Moodle calendar events are structured; deterministic
        // extraction keeps the loop fast, GLM handles ambiguous items.
        const result = await ingestAndProcess({
          source: "moodle",
          sourceId,
          subject: ev.summary,
          body: `Moodle calendar event (elearning.unideb.hu)\nStart: ${ev.start.toISOString()}\nEnd: ${ev.end?.toISOString() ?? "n/a"}\n\n${ev.description}`,
          receivedAt: new Date(),
          forceHeuristic: true,
        });
        handled += 1;
        moodle.newItems += 1;
        if (result.discarded) moodle.discarded.push(ev.summary);
        else moodle.processed.push(result.task?.title ?? ev.summary);
      }
    } catch (err) {
      moodle.error = err instanceof Error ? err.message : "Moodle sync failed";
      console.error("[UniPulse Sync] moodle:", err);
    }
  }

  await db.userConfig.update({ where: { id: "singleton" }, data: { lastSyncAt: new Date() } });

  return NextResponse.json({ ok: true, gmail, moodle, syncedAt: new Date().toISOString() });
}

/** Lightweight heartbeat used by the status pills (no external IO). */
export async function GET() {
  const config = await db.userConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  const pending = await db.task.count({ where: { status: "pending" } });
  return NextResponse.json({
    ok: true,
    pending,
    gmailLive: googleOAuthConfigured() && config.gmailConnected,
    moodleLive: Boolean(config.moodleIcsUrl),
    agentActive: true,
    lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
  });
}
