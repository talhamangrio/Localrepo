// ─── Gmail REST client (Google OAuth 2.0 + gmail.readonly scope) ────────────
// Real integration path: activates automatically once GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET are present in .env.local and the student completes
// the OAuth consent flow via /api/auth/google.

import type { Prisma } from "@prisma/client";

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function appBaseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export function buildGoogleAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: HTTP ${res.status}`);
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: HTTP ${res.status}`);
  return (await res.json()) as TokenResponse;
}

/** Returns a valid access token, refreshing transparently when needed. */
export async function ensureAccessToken(config: {
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  googleTokenExpiry?: Date | null;
}): Promise<{ token: string; updated?: Prisma.UserConfigUpdateInput }> {
  if (!config.googleAccessToken) throw new Error("No Google access token stored");
  const expired =
    !config.googleTokenExpiry || config.googleTokenExpiry.getTime() < Date.now() + 60_000;
  if (!expired) return { token: config.googleAccessToken };
  if (!config.googleRefreshToken) throw new Error("Google access token expired and no refresh token stored");
  const refreshed = await refreshAccessToken(config.googleRefreshToken);
  return {
    token: refreshed.access_token,
    updated: {
      googleAccessToken: refreshed.access_token,
      googleTokenExpiry: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000),
      ...(refreshed.refresh_token ? { googleRefreshToken: refreshed.refresh_token } : {}),
    },
  };
}

interface GmailMessageRef {
  id: string;
  threadId: string;
}

interface GmailMessage {
  id: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { mimeType: string; body?: { data?: string }; parts?: unknown[] }[];
  };
}

export interface ParsedEmail {
  id: string;
  subject: string;
  from: string;
  date: Date;
  body: string;
}

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

function extractBody(msg: GmailMessage): string {
  const payload = msg.payload;
  if (!payload) return msg.snippet ?? "";
  const direct = payload.body?.data;
  if (direct) return decodeBase64Url(direct);
  const textPart = payload.parts?.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
  const htmlPart = payload.parts?.find((p) => p.mimeType === "text/html" && p.body?.data);
  if (htmlPart?.body?.data) {
    return decodeBase64Url(htmlPart.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return msg.snippet ?? "";
}

/** Fetch the newest unread inbox messages (last 7 days) as plain text. */
export async function fetchUnreadEmails(token: string, max = 8): Promise<ParsedEmail[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(
      "is:unread category:primary newer_than:7d",
    )}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: HTTP ${listRes.status}`);
  const list = (await listRes.json()) as { messages?: GmailMessageRef[] };
  const refs = list.messages ?? [];
  const out: ParsedEmail[] = [];
  for (const ref of refs) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as GmailMessage;
    const headers = msg.payload?.headers ?? [];
    const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "unknown";
    const dateHeader = headers.find((h) => h.name.toLowerCase() === "date")?.value;
    out.push({
      id: msg.id,
      subject,
      from,
      date: dateHeader ? new Date(dateHeader) : new Date(),
      body: extractBody(msg).slice(0, 4000),
    });
  }
  return out;
}
