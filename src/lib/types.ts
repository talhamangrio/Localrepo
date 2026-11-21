// ─── UniPulse AI — Shared Types ─────────────────────────────────────────────

export type AgentSource = "Neptun" | "Moodle" | "Immigration" | "Medical" | "Professor";

export type AgentCategory = "Exam" | "Quiz" | "Appointment" | "Admin" | "Reply Required";

/** Structured output produced by the 3-step Z.ai GLM agent pipeline. */
export interface AgentExtraction {
  is_actionable: boolean;
  title: string;
  source: AgentSource;
  category: AgentCategory;
  event_datetime: string | null;
  is_fixed_event: boolean;
  urgency_score: number; // 1..10
  requires_reply: boolean;
  suggested_reply: string | null;
  prep_hours: number;
  reasoning: string;
}

export interface AdjustmentNotice {
  summary: string;
  detail: string;
}

export interface SyncChannelResult {
  checked: boolean;
  newItems: number;
  processed: string[];
  discarded: string[];
  error?: string;
}

export interface DashboardTask {
  id: string;
  source: AgentSource;
  category: AgentCategory;
  title: string;
  eventDatetime: string | null;
  isFixedEvent: boolean;
  urgencyScore: number;
  requiresReply: boolean;
  suggestedReply: string | null;
  prepHours: number;
  rawSubject: string | null;
  status: string;
  aiProcessed: boolean;
  createdAt: string;
}

export interface DashboardBlock {
  id: string;
  taskId: string | null;
  type: "fixed" | "prep";
  title: string;
  start: string;
  end: string;
  locked: boolean;
  priority: number;
  autoAdjusted: boolean;
}

export interface DashboardAdjustment {
  id: string;
  summary: string;
  detail: string;
  createdAt: string;
}

export interface DashboardData {
  config: {
    studentName: string;
    googleConfigured: boolean;
    gmailConnected: boolean;
    moodleConnected: boolean;
    moodleIcsUrl: string | null;
    lastSyncAt: string | null;
  };
  tasks: DashboardTask[];
  blocks: DashboardBlock[];
  adjustments: DashboardAdjustment[];
}

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 22;
export const HOUR_PX = 60;

export const SOURCE_COLORS: Record<AgentSource, { text: string; border: string; bg: string; dot: string }> = {
  Neptun: { text: "text-amber-300", border: "border-amber-400/50", bg: "bg-amber-400/10", dot: "bg-amber-400" },
  Moodle: { text: "text-orange-300", border: "border-orange-400/50", bg: "bg-orange-400/10", dot: "bg-orange-400" },
  Immigration: { text: "text-red-300", border: "border-red-400/50", bg: "bg-red-400/10", dot: "bg-red-400" },
  Medical: { text: "text-emerald-300", border: "border-emerald-400/50", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  Professor: { text: "text-fuchsia-300", border: "border-fuchsia-400/50", bg: "bg-fuchsia-400/10", dot: "bg-fuchsia-400" },
};

export function clampUrgency(n: unknown): number {
  const v = typeof n === "number" ? n : parseInt(String(n ?? 5), 10);
  if (Number.isNaN(v)) return 5;
  return Math.min(10, Math.max(1, Math.round(v)));
}

export function parseExtraction(json: unknown): AgentExtraction | null {
  if (!json || typeof json !== "object") return null;
  const e = json as Record<string, unknown>;
  const sources: AgentSource[] = ["Neptun", "Moodle", "Immigration", "Medical", "Professor"];
  const categories: AgentCategory[] = ["Exam", "Quiz", "Appointment", "Admin", "Reply Required"];
  const source = sources.includes(e.source as AgentSource) ? (e.source as AgentSource) : null;
  const category = categories.includes(e.category as AgentCategory) ? (e.category as AgentCategory) : null;
  let datetime: string | null = null;
  if (typeof e.event_datetime === "string" && e.event_datetime.length > 0) {
    const d = new Date(e.event_datetime);
    if (!Number.isNaN(d.getTime())) datetime = d.toISOString();
  }
  return {
    is_actionable: Boolean(e.is_actionable),
    title: typeof e.title === "string" && e.title.trim() ? e.title.trim().slice(0, 140) : "Untitled item",
    source: (source ?? "Professor") as AgentSource,
    category: (category ?? "Admin") as AgentCategory,
    event_datetime: datetime,
    is_fixed_event: Boolean(e.is_fixed_event),
    urgency_score: clampUrgency(e.urgency_score),
    requires_reply: Boolean(e.requires_reply),
    suggested_reply: typeof e.suggested_reply === "string" && e.suggested_reply.trim() ? e.suggested_reply.trim() : null,
    prep_hours: typeof e.prep_hours === "number" && e.prep_hours > 0 ? Math.min(12, e.prep_hours) : 0,
    reasoning: typeof e.reasoning === "string" ? e.reasoning.slice(0, 500) : "",
  };
}
