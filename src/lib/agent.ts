// ─── UniPulse AI — 3-step agentic pipeline powered by Z.ai GLM ──────────────
// Step 1: Triage & noise filter        (is_actionable)
// Step 2: Structured extraction & risk scoring
// Step 3: handled by lib/scheduler.ts  (autonomous timetable solving)

import ZAI from "z-ai-web-dev-sdk";
import { parseExtraction, type AgentExtraction } from "@/lib/types";

const AI_TIMEOUT_MS = 25_000;

function buildSystemPrompt(now: Date): string {
  return `You are UniPulse AI, the autonomous Chief of Staff for a student at the University of Debrecen (Hungary).
You triage inbound emails and calendar events coming from: Gmail (which receives Neptun university system notifications, Enter Hungary immigration messages, clinic/medical appointment notices, and professor emails) and Moodle e-learning calendar exports.

You must respond with STRICT JSON only — no markdown fences, no commentary — matching exactly this schema:
{"is_actionable": boolean, "title": string, "source": "Neptun"|"Moodle"|"Immigration"|"Medical"|"Professor", "category": "Exam"|"Quiz"|"Appointment"|"Admin"|"Reply Required", "event_datetime": ISO-8601 string or null, "is_fixed_event": boolean, "urgency_score": number 1-10, "requires_reply": boolean, "suggested_reply": string or null, "prep_hours": number, "reasoning": string}

Triage rules:
- Newsletters, promotions, spam, receipts, general announcements => is_actionable: false (everything else can stay null-ish).
- Actionable items: extract a clean concise action title.
- "Neptun" source covers exams, grades, registration deadlines forwarded from the university Neptun system.
- "Immigration" covers Enter Hungary / residence permit / alien policing matters => urgency 9-10.
- "Medical" covers clinic appointments, screenings, vaccinations => urgency 8-9.
- Exams (Neptun) and physical appointments (doctor, immigration office) are FIXED events: is_fixed_event=true.
- Quizzes and assignment deadlines are NOT fixed: is_fixed_event=false, set event_datetime to the deadline and prep_hours to realistic preparation hours (0.5-6).
- requires_reply=true when the sender explicitly expects a confirmation/response; then draft suggested_reply: a short, polite, ready-to-send email (max 120 words) confirming attendance or answering the request.
- urgency_score: judge by real-world consequence (missed immigration appointment or exam = 9-10; quiz deadline = 6-8; admin = 3-5).
- Resolve relative date phrases ("tomorrow 09:30", "next Sunday 10:00") into ISO-8601 with timezone offset using Europe/Budapest local time.
Current time: ${now.toISOString()} (Europe/Budapest).`;
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
}

/** Calls the Z.ai GLM agent with strict JSON output and a hard timeout. */
export async function extractWithAI(
  subject: string,
  body: string,
  sourceHint: string,
  now: Date = new Date(),
): Promise<AgentExtraction | null> {
  try {
    const zai = await ZAI.create();
    const userContent = [
      `SOURCE HINT: ${sourceHint}`,
      `EMAIL SUBJECT: ${subject}`,
      `EMAIL BODY:\n${body.slice(0, 3500)}`,
    ].join("\n\n");

    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: buildSystemPrompt(now) },
          { role: "user", content: userContent },
        ],
        thinking: { type: "disabled" },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), AI_TIMEOUT_MS)),
    ])) as Awaited<ReturnType<typeof zai.chat.completions.create>>;

    const content = completion.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(stripFences(content));
    return parseExtraction(parsed);
  } catch (err) {
    console.error("[UniPulse Agent] AI extraction failed, using heuristic fallback:", err);
    return null;
  }
}

/** Deterministic rule-based triage used when GLM is unreachable — keeps the
 *  autonomous pipeline alive under any circumstances. */
export function heuristicExtract(subject: string, body: string, now: Date = new Date()): AgentExtraction {
  const haystack = `${subject}\n${body}`.toLowerCase();

  // Date extraction: prefer the last explicit ISO datetime (emails typically
  // state the action deadline last: "Opens: X ... Closes: Y" → Y wins).
  let datetime: Date | null = null;
  const isoMatches = [...body.matchAll(/(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/g)];
  if (isoMatches.length > 0) {
    const last = isoMatches[isoMatches.length - 1];
    const d = new Date(`${last[1]}T${last[2]}:${last[3]}:00`);
    if (!Number.isNaN(d.getTime())) datetime = d;
  }
  if (!datetime) {
    const day = new Date(now);
    if (/\btomorrow\b/.test(haystack)) {
      day.setDate(day.getDate() + 1);
      const t = haystack.match(/(\d{2}):(\d{2})/);
      day.setHours(t ? +t[1] : 9, t ? +t[2] : 0, 0, 0);
      datetime = day;
    }
  }

  // Noise filter (Step 1)
  const noise =
    /newsletter|unsubscribe|promotion|discount|webinar invite|survey|no-reply@|noreply|digest|weekly roundup|marketing/.test(
      haystack,
    ) && !/exam|appointment|deadline|immigration|residence permit/.test(haystack);
  if (noise) {
    return {
      is_actionable: false,
      title: subject.slice(0, 140),
      source: "Professor",
      category: "Admin",
      event_datetime: null,
      is_fixed_event: false,
      urgency_score: 1,
      requires_reply: false,
      suggested_reply: null,
      prep_hours: 0,
      reasoning: "Heuristic noise filter: newsletter/promotional content detected.",
    };
  }

  const requiresReply = /confirm|reply|respond|rsvp|acknowledge|please answer|confirmation required/.test(haystack);
  const base: AgentExtraction = {
    is_actionable: true,
    title: subject.replace(/\[.*?\]/g, "").replace(/^(fw|fwd|re):\s*/i, "").trim().slice(0, 140) || subject.slice(0, 140),
    source: "Professor",
    category: "Admin",
    event_datetime: datetime ? datetime.toISOString() : null,
    is_fixed_event: false,
    urgency_score: 5,
    requires_reply: false,
    suggested_reply: null,
    prep_hours: 0,
    reasoning: "Heuristic fallback extraction (GLM unavailable).",
  };

  if (/immigration|enter hungary|residence permit|alien polic|idegenrend/.test(haystack)) {
    return {
      ...base,
      source: "Immigration",
      category: "Appointment",
      is_fixed_event: true,
      urgency_score: 10,
      requires_reply: requiresReply || /appointment/.test(haystack),
      suggested_reply: requiresReply
        ? "Dear Sir or Madam,\n\nThank you for your message. I hereby confirm my attendance at the scheduled appointment at the National Directorate-General for Aliens Policing in Debrecen. I will bring all requested documents.\n\nBest regards,\n[Student name]\nUniversity of Debrecen"
        : null,
    };
  }
  if (/klinika|clinic|medical|doctor|health|screening|vaccin/.test(haystack)) {
    return {
      ...base,
      source: "Medical",
      category: "Appointment",
      is_fixed_event: true,
      urgency_score: 9,
      requires_reply: requiresReply,
      suggested_reply: requiresReply
        ? "Dear Sir or Madam,\n\nThank you for your message. I confirm that I will attend the medical appointment at the scheduled time. Please let me know if any documents are required.\n\nBest regards,\n[Student name]"
        : null,
    };
  }
  if (/neptun/.test(haystack) && /exam|vizsga/.test(haystack)) {
    return {
      ...base,
      source: "Neptun",
      category: "Exam",
      is_fixed_event: true,
      urgency_score: 10,
      prep_hours: 5,
    };
  }
  if (/neptun/.test(haystack)) {
    return { ...base, source: "Neptun", category: "Admin", urgency_score: 7, is_fixed_event: false };
  }
  if (/moodle|quiz|assignment|homework|submission|deadline/.test(haystack)) {
    return {
      ...base,
      source: "Moodle",
      category: /quiz|test/.test(haystack) ? "Quiz" : "Admin",
      is_fixed_event: false,
      urgency_score: 7,
      prep_hours: /quiz/.test(haystack) ? 2.5 : 3,
    };
  }
  return {
    ...base,
    source: "Professor",
    category: requiresReply ? "Reply Required" : "Admin",
    urgency_score: requiresReply ? 6 : 5,
    is_fixed_event: requiresReply && datetime ? true : false,
    requires_reply: requiresReply,
    suggested_reply: requiresReply
      ? "Dear Professor,\n\nThank you for your message. I am writing to confirm the appointment as proposed. Please let me know if any preparation or documents are needed beforehand.\n\nBest regards,\n[Student name]"
      : null,
  };
}

/** Full Step 1+2 pipeline: AI first, heuristic as bulletproof fallback. */
export async function extractItem(
  subject: string,
  body: string,
  sourceHint: string,
  opts: { forceHeuristic?: boolean; now?: Date } = {},
): Promise<{ extraction: AgentExtraction; aiUsed: boolean }> {
  const now = opts.now ?? new Date();
  if (!opts.forceHeuristic) {
    const ai = await extractWithAI(subject, body, sourceHint, now);
    if (ai) return { extraction: ai, aiUsed: true };
  }
  return { extraction: heuristicExtract(subject, body, now), aiUsed: false };
}
