// ─── Live Demo Injector — realistic University of Debrecen scenarios ────────
// Dates are computed dynamically so every demo works on stage, any day.

export interface DemoScenario {
  id: string;
  label: string;
  description: string;
  subject: string;
  body: (now: Date) => string;
}

function nextSunday(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

function tomorrowAt(now: Date, h: number, m: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}

function inDaysAt(now: Date, days: number, h: number, m: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d;
}

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(d: Date): string {
  return d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "neptun_exam",
    label: "Simulate Neptun Sunday Exam Email",
    description: "Fixed exam commitment + autonomous prep scheduling",
    subject: "[Neptun] Exam registration confirmed - MBINFO101 Discrete Mathematics",
    body: (now) => {
      const exam = nextSunday(now);
      return `Dear Student,

Your registration for the following exam has been confirmed in the Neptun system:

Course: MBINFO101 Discrete Mathematics
Exam type: Written exam
Date: ${iso(exam)}
Location: Main Building K, Room K215, Debrecen
Seating: Row 3, Seat 12

Please arrive 15 minutes before the start time with your student card. Late arrival after 10 minutes will result in exclusion from the exam.

Grading results will be published in Neptun within 10 working days.

University of Debrecen - Faculty of Informatics
Neptun Education System`;
    },
  },
  {
    id: "immigration_appointment",
    label: "Simulate Urgent Immigration Appointment Requiring Reply",
    description: "Highest-risk category + AI-drafted confirmation reply",
    subject: "Enter Hungary - Residence Permit Appointment - Confirmation Required",
    body: (now) => {
      const appt = tomorrowAt(now, 9, 30);
      return `Dear Third-Country National Student,

This is a reminder that your residence permit appointment has been scheduled at the National Directorate-General for Aliens Policing, Debrecen Regional Directorate.

Date: ${iso(appt)}
Address: 1 Sándor Brigád utca, Debrecen, 4025
Case number: ENH-2026/4471

REPLY REQUIRED: Please confirm your attendance by replying to this email within 24 hours. Failure to confirm may result in cancellation of your appointment and status complications.

Documents to bring: passport, student card, accommodation certificate, TAJ card, proof of tuition payment.

National Directorate-General for Aliens Policing
Customer Service Portal - Enter Hungary`;
    },
  },
  {
    id: "moodle_quiz",
    label: "Simulate New Moodle Quiz",
    description: "Flexible deadline + AI study block slotting",
    subject: "Moodle: New quiz available - Data Structures Mid-Semester Quiz",
    body: (now) => {
      const deadline = inDaysAt(now, 3, 23, 59);
      return `A new quiz has been added to the course "Data Structures and Algorithms (IIITM104)".

Quiz: Mid-Semester Quiz - Linked Lists, Trees, Hashing
Opens: ${iso(new Date(now.getTime() + 3600_000))}
Closes: ${iso(deadline)}
Time limit: 40 minutes
Attempts allowed: 1
Grade weight: 15% of course total

You can access the quiz on the e-learning portal: elearning.unideb.hu

Do not leave the quiz until the last minute - the server is busy on deadline evenings.

Course instructor: Dr. Peter Kovacs`;
    },
  },
  {
    id: "professor_email",
    label: "Simulate Professor Reply-Required Email",
    description: "Thesis consultation needing a confirmation reply",
    subject: "Thesis consultation - Thursday 14:00 - Dr. Aron Kiraly",
    body: (now) => {
      const consult = inDaysAt(now, 2, 14, 0);
      return `Dear Student,

Following your request, I have reserved a consultation slot for your thesis progress review.

Date: ${iso(consult)}
Location: Faculty of Informatics, Room 212

Please confirm by replying to this email, and bring an outline of Chapter 2 so we can discuss your methodology section.

Kind regards,
Dr. Aron Kiraly
Associate Professor
University of Debrecen, Department of Computer Science`;
    },
  },
  {
    id: "noise_newsletter",
    label: "Simulate Newsletter Spam (auto-discarded)",
    description: "Shows the GLM noise filter discarding irrelevant mail",
    subject: "University Library Newsletter - October Issue: Events, Discounts and More",
    body: () => `Dear Reader,

Welcome to the October issue of the University Library Newsletter!

In this issue:
- 20% discount on all printing services this month
- Autumn book fair: 300+ titles in the main hall
- Workshop: Introduction to academic databases
- Coffee morning with the library staff

You are receiving this newsletter because you are a member of the University of Debrecen community. You can unsubscribe at any time.

University and National Library of Debrecen (DEENK)`,
  },
];

export function scenarioPayload(id: string, now: Date = new Date()): { subject: string; body: string } | null {
  const scenario = DEMO_SCENARIOS.find((s) => s.id === id);
  if (!scenario) return null;
  return { subject: scenario.subject, body: scenario.body(now) };
}

/** Human-readable datetime embedded in seed data for the UI header. */
export function scenarioDateHint(id: string, now: Date = new Date()): string | null {
  switch (id) {
    case "neptun_exam":
      return fmt(nextSunday(now));
    case "immigration_appointment":
      return fmt(tomorrowAt(now, 9, 30));
    case "moodle_quiz":
      return fmt(inDaysAt(now, 3, 23, 59));
    case "professor_email":
      return fmt(inDaysAt(now, 2, 14, 0));
    default:
      return null;
  }
}
