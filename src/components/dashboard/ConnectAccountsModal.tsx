"use client";

import { useState } from "react";
import { CalendarSync, CheckCircle2, ClipboardCopy, CloudCog, Mail, PlugZap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { DashboardData } from "@/lib/types";

export function ConnectAccountsModal({
  open,
  onOpenChange,
  data,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DashboardData | null;
  onChanged: () => Promise<void>;
}) {
  const [moodleUrl, setMoodleUrl] = useState<string>(data?.config.moodleIcsUrl ?? "");
  const [savingMoodle, setSavingMoodle] = useState(false);
  const redirectUri =
    typeof window !== "undefined" ? `${window.location.origin}/api/auth/callback` : "/api/auth/callback";

  const saveMoodle = async () => {
    setSavingMoodle(true);
    try {
      const res = await fetch("/api/connect/moodle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: moodleUrl }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string; eventsFound?: number };
      if (payload.error) {
        toast.warning("Moodle feed", { description: payload.error });
      } else {
        toast.success("Moodle .ics connected", {
          description: `${payload.eventsFound ?? 0} calendar events discovered`,
        });
      }
      await onChanged();
    } catch (err) {
      toast.error("Failed to save Moodle URL", { description: String(err) });
    } finally {
      setSavingMoodle(false);
    }
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.success("Redirect URI copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const gmailConnected = Boolean(data?.config.googleConfigured && data?.config.gmailConnected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto border-white/15 bg-popover sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[#D9DADC]">Connect Accounts</DialogTitle>
          <DialogDescription>
            Zero-click ingestion: connect your real data sources once, UniPulse handles the rest autonomously.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* ── Gmail / Google ── */}
          <section className="flex flex-col gap-2" aria-label="Google Gmail connection">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-[#FFC93C]" aria-hidden />
                <span className="text-sm font-medium text-[#D9DADC]">Google Gmail Gate</span>
                {gmailConnected ? (
                  <Badge className="gap-1 border-transparent bg-emerald-400/15 text-emerald-300">
                    <CheckCircle2 className="size-3" aria-hidden /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-white/15 text-muted-foreground">
                    Not connected
                  </Badge>
                )}
              </div>
            </div>
            {gmailConnected ? (
              <p className="text-xs text-muted-foreground">
                Neptun, Enter Hungary, clinic and professor emails are being surveilled via gmail.readonly.
              </p>
            ) : data?.config.googleConfigured ? (
              <Button
                className="w-fit gap-1.5 bg-[#FFC93C] text-[#1E2024] hover:bg-[#ffd45f]"
                onClick={() => {
                  window.location.href = "/api/auth/google";
                }}
              >
                <PlugZap className="size-4" aria-hidden /> Connect Google Account
              </Button>
            ) : (
              <Alert className="border-white/15 bg-white/[0.03]">
                <CloudCog className="size-4 text-[#FFC93C]" aria-hidden />
                <AlertTitle className="text-sm">OAuth credentials not set yet (Testing mode, $0 cost)</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>Google Cloud Console → APIs &amp; Services → OAuth consent screen → External → Testing.</li>
                    <li>Add your Gmail as a Test user, enable the Gmail API.</li>
                    <li>Credentials → Create Credentials → OAuth client ID → Web application.</li>
                    <li>
                      Paste this Authorized Redirect URI:{" "}
                      <code className="rounded bg-black/40 px-1 py-0.5 text-[11px] text-[#FFC93C]">{redirectUri}</code>
                      <Button variant="ghost" size="sm" className="ml-1 h-6 px-1.5 text-[11px] text-[#FFC93C]" onClick={() => void copyRedirect()}>
                        <ClipboardCopy className="size-3" aria-hidden /> copy
                      </Button>
                    </li>
                    <li>Copy the client ID + secret into <code className="text-[#FFC93C]">.env.local</code> and restart the app.</li>
                  </ol>
                </AlertDescription>
              </Alert>
            )}
          </section>

          <Separator className="bg-white/10" />

          {/* ── Moodle ── */}
          <section className="flex flex-col gap-2" aria-label="Moodle calendar connection">
            <div className="flex items-center gap-2">
              <CalendarSync className="size-4 text-[#FFC93C]" aria-hidden />
              <span className="text-sm font-medium text-[#D9DADC]">Moodle e-Learning .ics Feed</span>
              {data?.config.moodleConnected ? (
                <Badge className="gap-1 border-transparent bg-emerald-400/15 text-emerald-300">
                  <CheckCircle2 className="size-3" aria-hidden /> Synced
                </Badge>
              ) : (
                <Badge variant="outline" className="border-white/15 text-muted-foreground">Not connected</Badge>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="moodle-url" className="text-xs text-muted-foreground">
                Private calendar export URL (elearning.unideb.hu)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="moodle-url"
                  placeholder="https://elearning.unideb.hu/calendar/export.php?userid=...&authtoken=..."
                  value={moodleUrl}
                  onChange={(e) => setMoodleUrl(e.target.value)}
                  className="border-white/15 bg-black/20 text-sm"
                  type="url"
                />
                <Button
                  onClick={() => void saveMoodle()}
                  disabled={savingMoodle || !moodleUrl.trim()}
                  className="shrink-0 gap-1.5 bg-[#FFC93C] text-[#1E2024] hover:bg-[#ffd45f]"
                >
                  {savingMoodle ? "Testing…" : "Save & Test"}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Moodle → Preferences → Calendar → Export calendar → All events → Copy the URL it generates and paste it here.
              </p>
            </div>
          </section>

          <Separator className="bg-white/10" />

          {/* ── Z.ai ── */}
          <section className="flex items-center justify-between" aria-label="Z.ai agent status">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#FFC93C]" aria-hidden />
              <div>
                <p className="text-sm font-medium text-[#D9DADC]">Z.ai GLM Agent</p>
                <p className="text-[11px] text-muted-foreground">
                  Active — triage, extraction and auto-timetabling run on the GLM runtime.
                </p>
              </div>
            </div>
            <Badge className="gap-1 border-transparent bg-[#FFC93C]/15 text-[#FFC93C]">
              <span className="live-dot size-1.5 rounded-full bg-[#FFC93C]" aria-hidden /> Watching
            </Badge>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
