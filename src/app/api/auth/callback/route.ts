import { db } from "@/lib/db";
import { appBaseUrl, exchangeGoogleCode, googleOAuthConfigured } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Google OAuth 2.0 callback: exchanges the code, stores tokens, returns home. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) return Response.redirect(`${appBaseUrl(req)}/?google_error=${encodeURIComponent(error)}`, 302);
  if (!code) return Response.redirect(`${appBaseUrl(req)}/?google_error=missing_code`, 302);
  if (!googleOAuthConfigured()) return Response.redirect(`${appBaseUrl(req)}/?google_error=not_configured`, 302);

  try {
    const redirectUri = `${appBaseUrl(req)}/api/auth/callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);

    // Identify the student (optional enrichment)
    let email: string | undefined;
    try {
      const uiRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (uiRes.ok) {
        const ui = (await uiRes.json()) as { email?: string };
        email = ui.email;
      }
    } catch {
      // userinfo is optional
    }

    await db.userConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token ?? null,
        googleTokenExpiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
        gmailConnected: true,
        studentName: email ?? "Student",
      },
      update: {
        googleAccessToken: tokens.access_token,
        ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
        googleTokenExpiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
        gmailConnected: true,
        ...(email ? { studentName: email } : {}),
      },
    });

    return Response.redirect(`${appBaseUrl(req)}/?connected=gmail`, 302);
  } catch (err) {
    console.error("[UniPulse OAuth] callback failed:", err);
    return Response.redirect(`${appBaseUrl(req)}/?google_error=exchange_failed`, 302);
  }
}
