import { NextResponse } from "next/server";
import { appBaseUrl, buildGoogleAuthUrl, googleOAuthConfigured } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Starts the Google OAuth 2.0 consent flow (gmail.readonly, Testing mode). */
export async function GET(req: Request) {
  if (!googleOAuthConfigured()) {
    const redirectUri = `${appBaseUrl(req)}/api/auth/callback`;
    return NextResponse.json({
      configured: false,
      message:
        "Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart the server. Paste this exact Redirect URI in Google Cloud Console:",
      redirectUri,
    });
  }
  const redirectUri = `${appBaseUrl(req)}/api/auth/callback`;
  return NextResponse.redirect(buildGoogleAuthUrl(redirectUri));
}
