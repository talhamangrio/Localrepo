# UniPulse AI — University of Debrecen Edition

Autonomous, real-time **Student Chief of Staff** for University of Debrecen students. Students never type a task manually: emails and calendar events are ingested automatically, triaged by a Z.ai GLM agent, and turned into a self-adjusting smart timetable.

![Stack](https://img.shields.io/badge/Next.js%2016-App%20Router-black) ![AI](https://img.shields.io/badge/Z.ai-GLM%20Agent-FFC93C) ![DB](https://img.shields.io/badge/Prisma-SQLite-2B2D31)

## How it works

```
Gmail (Neptun / Immigration / Clinics / Professors)  ─┐
                                                      ├─► Dedup Gate ─► Z.ai GLM Agent ─► Smart Timetable
Moodle elearning.unideb.hu (.ics export feed)        ─┘   (source_id)    • Triage & noise filter
                                                                          • Structured extraction & risk score
Live Demo Injector (hackathon mode)                  ─┘                   • Autonomous timetable & conflict solver
```

### The 3-step agentic pipeline
1. **Triage & noise filter** — newsletters, promos and spam are discarded automatically (`is_actionable`).
2. **Structured extraction & risk scoring** — clean title, source (`Neptun / Moodle / Immigration / Medical / Professor`), category, ISO datetime, fixed-vs-flexible, urgency 1–10, and a ready-to-send confirmation reply when the sender expects one.
3. **Autonomous timetable & conflict solver** — fixed exams/appointments are locked onto the board; exams *and* flexible deadlines get AI Prep blocks slotted into conflict-free gaps (08:00–22:00 study window, overnight barriers); urgent arrivals **auto-shift** colliding prep blocks and raise a yellow "Schedule Auto-Adjusted" notice.

## Features

- **Zero-click ingestion** — Gmail via OAuth 2.0 (`gmail.readonly`), Moodle via private `.ics` export URL, 20-second background sync loop with pulsing status pills.
- **Live Demo Injector** — five one-click scenarios (Neptun exam, immigration appointment requiring reply, Moodle quiz, professor email, newsletter spam) that run the *real* pipeline with dynamically generated dates. Works with zero credentials configured.
- **Executive dark dashboard** — Matte Charcoal `#1E2024` / Dark Slate `#2B2D31` / Crisp Silver `#D9DADC` / Signal Yellow `#FFC93C`; Daily + Weekly timeline (08:00–22:00) with locked commitments (solid border, lock icon) vs AI-Scheduled Prep (dashed yellow, sparkle icon), live now-line and collision columns.
- **source_id deduplication** — an email or calendar event is never processed twice.
- **Bulletproof fallback** — if GLM is unreachable, a deterministic rule engine keeps triage/scheduling alive.

## Tech stack

Next.js 16 (App Router, Route Handlers) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma + SQLite · Z.ai GLM (`z-ai-web-dev-sdk`) · Framer Motion · sonner

## Quick start

```bash
bun install
cp .env.example .env.local   # optional — demo mode works without keys
bun run db:push
bun run dev                  # http://localhost:3000
```

The dashboard seeds a realistic sample week on first load. Use the **Live Demo Injector** (footer bar) to fire live events through the GLM pipeline, and **Connect Accounts** to activate real Gmail/Moodle sync.

## Connecting real data (Testing mode, $0 cost)

1. **Gmail Gate** — see `.env.example`: enable the Gmail API in Google Cloud Console, create a Web-application OAuth client with redirect URI `<your-app-url>/api/auth/callback`, paste `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` into `.env.local`, restart, then click *Connect Accounts → Connect Google Account*.
2. **Moodle** — `elearning.unideb.hu` → Preferences → Calendar → Export calendar → *All events* → copy the generated private URL → paste it in *Connect Accounts → Moodle*.
3. **Z.ai** — bundled in the Z.ai runtime; self-hosters set `ZAI_API_KEY`.

## API surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/events` | GET | Dashboard payload (tasks, blocks, adjustments, config) + first-run seed |
| `/api/sync` | POST | Background sync loop: Gmail + Moodle → agent pipeline |
| `/api/agent/process` | POST | Push any subject/body through the GLM pipeline |
| `/api/demo/simulate` | POST | Live Demo Injector scenarios |
| `/api/demo/clear` | POST | Reset workspace (optional `reseed`) |
| `/api/connect/moodle` | POST/DELETE | Save/test/disconnect the `.ics` feed |
| `/api/auth/google` + `/api/auth/callback` | GET | OAuth 2.0 consent + token storage |
| `/api/config` | GET/PUT | Student config |
| `/api/tasks/[id]` | PATCH/DELETE | Done / dismiss / restore |
| `/api/adjustments` | POST | Acknowledge auto-adjust notices |

## Project layout

```
src/
├── app/                    # Dashboard page + /api route handlers
├── components/dashboard/   # Header, ActionQueue, Timetable, DemoDrawer, ConnectAccountsModal
├── hooks/useDashboard.ts   # Client state + 20s polling loop
└── lib/                    # agent.ts (GLM pipeline), scheduler.ts (conflict solver),
                             # ics.ts, gmail.ts, pipeline.ts, demo.ts, seed.ts, types.ts
prisma/schema.prisma        # UserConfig, RawFeedItem, Task, ScheduledBlock, ScheduleAdjustment
```

> Built for the University of Debrecen student community. Not affiliated with the University of Debrecen.
