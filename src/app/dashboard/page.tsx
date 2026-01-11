"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserSettings, AppEvent } from "@/types/contracts";
import { logEvent, getLastNMinutesBuckets, uid } from "@/lib/storage/repo";
import { sumBuckets, postureScore, topIssue, blinkRate } from "@/lib/stats/compute";
import { useReminders } from "@/hooks/useReminders";
//import ThemeToggle from "@/components/ThemeToggle";

// ---------- Types ----------
type CoachResponse = {
  insights?: string[];
  nudges?: { title: string; message: string; cooldownMin: number }[];
  exercises?: { name: string; durationSec: number; steps: string[] }[];
  setupTips?: string[];
  recommendedReminders?: { breakMin: number; waterMin: number; stretchMin: number };
};

type SummaryResponse = {
  summaryText?: string;
  insights?: string[];
  exercises?: { name: string; durationSec: number; steps: string[] }[];
  setupTips?: string[];
  recommendedReminders?: { breakMin: number; waterMin: number; stretchMin: number };
};

const defaultSettings: UserSettings = {
  sensitivity: "medium",
  focusMode: false,
  cameraEnabled: true,
  voiceEnabled: false,
  privacyMode: false,
  reminders: { breakMin: 50, waterMin: 90, stretchMin: 60 },
  distraction: { awayThresholdSec: 20, lookAwayThresholdSec: 10 },
};

// ---------- Small UI helpers ----------
function Chip({
  label,
  on,
  tone = "neutral",
}: {
  label: string;
  on: boolean;
  tone?: "neutral" | "blue" | "green" | "purple";
}) {
  const toneOn =
    tone === "green"
      ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-700 dark:text-emerald-200"
      : tone === "blue"
      ? "bg-sky-500/15 border-sky-400/30 text-sky-700 dark:text-sky-200"
      : tone === "purple"
      ? "bg-fuchsia-500/15 border-fuchsia-400/30 text-fuchsia-700 dark:text-fuchsia-200"
      : "bg-zinc-500/10 border-zinc-400/20 text-zinc-700 dark:text-zinc-200";

  const toneOff = "bg-muted border-border text-muted-foreground";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border",
        "transition-all duration-200 hover:scale-[1.02]",
        on ? toneOn : toneOff,
      ].join(" ")}
    >
      <span className={["h-2 w-2 rounded-full", on ? "bg-current" : "bg-zinc-400 dark:bg-zinc-500"].join(" ")} />
      {label}
    </span>
  );
}

function Button({
  children,
  onClick,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost";
  disabled?: boolean;
}) {
  const base =
    "relative overflow-hidden rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

  const styles =
    variant === "default"
      ? [
          "text-white",
          "bg-gradient-to-r from-sky-600 via-indigo-600 to-fuchsia-600",
          "hover:brightness-110",
          "shadow-[0_10px_30px_-12px_rgba(99,102,241,0.7)]",
        ].join(" ")
      : variant === "outline"
      ? "border border-border bg-background hover:bg-muted"
      : "hover:bg-muted";

  return (
    <button className={[base, styles].join(" ")} onClick={onClick} disabled={disabled}>
      {variant === "default" ? (
        <span className="pointer-events-none absolute inset-0 opacity-40">
          <span className="absolute -left-20 top-0 h-full w-20 bg-white/30 rotate-12 blur-md animate-[shine_2.8s_ease-in-out_infinite]" />
        </span>
      ) : null}
      <span className="relative z-10">{children}</span>

      <style jsx>{`
        @keyframes shine {
          0% {
            transform: translateX(0) rotate(12deg);
          }
          70% {
            transform: translateX(520px) rotate(12deg);
          }
          100% {
            transform: translateX(520px) rotate(12deg);
          }
        }
      `}</style>
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  desc,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  desc?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card/80 backdrop-blur p-4 transition-all hover:shadow-[0_18px_50px_-30px_rgba(59,130,246,0.45)]">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
      </div>
      <input className="mt-1 h-4 w-4 accent-foreground" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 5,
  onChange,
  suffix = "min",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4 transition-all hover:shadow-[0_18px_50px_-30px_rgba(168,85,247,0.45)]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-sm text-muted-foreground">
          {value} {suffix}
        </div>
      </div>

      <input className="w-full mt-3" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />

      <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, pct }: { label: string; value: string; pct?: number }) {
  const p = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : null;

  return (
    <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-22px_rgba(59,130,246,0.55)]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 text-foreground">{value}</div>

      {p !== null ? (
        <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-fuchsia-500 transition-all duration-500"
            style={{ width: `${p}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------- Pomodoro ----------
type PomodoroMode = "focus" | "break";
function formatMMSS(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  // Person A will wire real session id later
  const [activeSessionId] = useState<string | undefined>(undefined);

  // Gemini state
  const [tab, setTab] = useState<"coach" | "summary">("coach");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [coachErr, setCoachErr] = useState<string | null>(null);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const [notif, setNotif] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    if (!("Notification" in window)) setNotif("unsupported");
    else setNotif(Notification.permission);
  }, []);

  async function requestNotifications() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setNotif(p);
  }

  const reminders = useReminders({
    settings,
    sessionId: activeSessionId,
    enabled: remindersEnabled,
    voiceEnabled: settings.voiceEnabled,
    onEvent: async (e: AppEvent) => {
      await logEvent(e);
    },
  });

  const [snapshot, setSnapshot] = useState<{
    score: number;
    issue: string;
    fatigue: number;
    blink: number;
    awayMin: number;
    lookAwayMin: number;
  } | null>(null);

  async function refreshSnapshot() {
    const buckets = await getLastNMinutesBuckets(15);
    const totals = sumBuckets(buckets);
    setSnapshot({
      score: postureScore(totals.postureSec),
      issue: topIssue(totals.postureSec),
      fatigue: Math.round(totals.avgFatigue),
      blink: blinkRate(totals.blinks, buckets.length),
      awayMin: Math.round((totals.focusSec.away ?? 0) / 60),
      lookAwayMin: Math.round((totals.focusSec.lookingAway ?? 0) / 60),
    });
  }

  useEffect(() => {
    refreshSnapshot();
    const t = setInterval(refreshSnapshot, 15000);
    return () => clearInterval(t);
  }, []);

  const payloadBuilder = async () => {
    const buckets = await getLastNMinutesBuckets(15);
    const totals = sumBuckets(buckets);
    return {
      windowMin: 15,
      aggregates: {
        postureScore: postureScore(totals.postureSec),
        topIssue: topIssue(totals.postureSec),
        postureSec: totals.postureSec,
        focusSec: totals.focusSec,
        avgBlinkRate: blinkRate(totals.blinks, buckets.length),
        avgFatigue: Math.round(totals.avgFatigue),
        reminders: totals.reminders,
        alerts: totals.alerts,
      },
    };
  };

  async function getCoachingNow() {
    setCoachErr(null);
    setCoachLoading(true);
    try {
      const payload = await payloadBuilder();
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as CoachResponse;
      setCoach(data);
      setTab("coach");

      if (data.recommendedReminders) {
        setSettings((s) => ({ ...s, reminders: { ...s.reminders, ...data.recommendedReminders } }));
      }
    } catch (e: any) {
      setCoachErr(e?.message ?? "Failed to get coaching");
    } finally {
      setCoachLoading(false);
    }
  }

  async function generateDailySummary() {
    setSummaryErr(null);
    setSummaryLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const end = Date.now();

      const { getBucketsInRange } = await import("@/lib/storage/repo");
      const buckets = await getBucketsInRange(start, end);
      const totals = sumBuckets(buckets);

      const payload = {
        range: { start, end, preset: "today" },
        aggregates: {
          postureScore: postureScore(totals.postureSec),
          topIssue: topIssue(totals.postureSec),
          postureSec: totals.postureSec,
          focusSec: totals.focusSec,
          avgBlinkRate: blinkRate(totals.blinks, buckets.length),
          avgFatigue: Math.round(totals.avgFatigue),
          reminders: totals.reminders,
          alerts: totals.alerts,
        },
      };

      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SummaryResponse;
      setSummary(data);
      setTab("summary");

      if (data.recommendedReminders) {
        setSettings((s) => ({ ...s, reminders: { ...s.reminders, ...data.recommendedReminders } }));
      }
    } catch (e: any) {
      setSummaryErr(e?.message ?? "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  // Pomodoro
  const [pomoMode, setPomoMode] = useState<PomodoroMode>("focus");
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoSec, setPomoSec] = useState(25 * 60);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pomoRunning) {
      setPomoMode("focus");
      setPomoSec(focusMin * 60);
    }
  }, [focusMin, breakMin, pomoRunning]);

  useEffect(() => {
    if (!pomoRunning) return;
    timerRef.current = window.setInterval(() => setPomoSec((s) => s - 1), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [pomoRunning]);

  useEffect(() => {
    if (!pomoRunning) return;
    if (pomoSec > 0) return;

    if (pomoMode === "focus") {
      setPomoMode("break");
      setPomoSec(breakMin * 60);
      logEvent({ id: uid(), ts: Date.now(), sessionId: activeSessionId, type: "break_reminder" });
    } else {
      setPomoMode("focus");
      setPomoSec(focusMin * 60);
    }
  }, [pomoSec, pomoRunning, pomoMode, breakMin, focusMin, activeSessionId]);

  function resetPomodoro() {
    setPomoRunning(false);
    setPomoMode("focus");
    setPomoSec(focusMin * 60);
  }

  return (
    <main
      className="min-h-screen p-6 max-w-6xl mx-auto space-y-6
      bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(59,130,246,0.12),transparent_40%),radial-gradient(900px_circle_at_90%_10%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(900px_circle_at_50%_100%,rgba(168,85,247,0.10),transparent_45%)]
      dark:bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_10%,rgba(16,185,129,0.16),transparent_40%),radial-gradient(900px_circle_at_50%_100%,rgba(168,85,247,0.16),transparent_45%)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="text-sm text-muted-foreground mt-1">
            Live controls, reminders, and Gemini coaching.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="green" label={`Reminders ${remindersEnabled ? "ON" : "OFF"}`} on={remindersEnabled} />
          <Chip tone="purple" label={`Voice ${settings.voiceEnabled ? "ON" : "OFF"}`} on={settings.voiceEnabled} />
          <Chip
            tone="blue"
            label={
              notif === "unsupported"
                ? "Notifications Unsupported"
                : notif === "granted"
                ? "Notifications Allowed"
                : "Notifications Not Allowed"
            }
            on={notif === "granted"}
          />
        </div>
      </div>

      {/* Top grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick snapshot */}
        <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_50px_-30px_rgba(59,130,246,0.45)]">
          <CardHeader>
            <CardTitle>Now (last 15 min)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Posture score" value={snapshot ? `${snapshot.score}/100` : "—"} pct={snapshot ? snapshot.score : 0} />
              <Stat label="Top issue" value={snapshot ? snapshot.issue.replaceAll("_", " ") : "—"} />
              <Stat label="Blink rate" value={snapshot ? `${snapshot.blink}/min` : "—"} pct={snapshot ? Math.min(100, (snapshot.blink / 30) * 100) : 0} />
              <Stat label="Avg fatigue" value={snapshot ? `${snapshot.fatigue}/100` : "—"} pct={snapshot ? snapshot.fatigue : 0} />
            </div>

            <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4 transition-all hover:shadow-[0_18px_50px_-30px_rgba(16,185,129,0.45)]">
              <div className="text-sm font-medium">Focus signals</div>
              <div className="text-sm text-muted-foreground mt-2">
                Looking away: <b className="text-foreground">{snapshot ? snapshot.lookAwayMin : "—"}</b> min · Away:{" "}
                <b className="text-foreground">{snapshot ? snapshot.awayMin : "—"}</b> min
              </div>
              <div className="text-xs text-muted-foreground mt-1">(Approx. from face direction + presence.)</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={refreshSnapshot}>
                Refresh
              </Button>
              {notif !== "granted" && notif !== "unsupported" ? (
                <Button onClick={requestNotifications}>Enable Notifications</Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_50px_-30px_rgba(168,85,247,0.45)] lg:col-span-2">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Toggle label="Reminders" checked={remindersEnabled} onChange={setRemindersEnabled} desc="Break, water and stretch prompts." />
              <Toggle
                label="Voice alerts"
                checked={settings.voiceEnabled}
                onChange={(v) => setSettings((s) => ({ ...s, voiceEnabled: v }))}
                desc="Text-to-speech for reminders."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SliderRow
                label="Break interval"
                value={settings.reminders.breakMin}
                min={15}
                max={90}
                step={5}
                onChange={(v) => setSettings((s) => ({ ...s, reminders: { ...s.reminders, breakMin: v } }))}
              />
              <SliderRow
                label="Water interval"
                value={settings.reminders.waterMin}
                min={30}
                max={180}
                step={10}
                onChange={(v) => setSettings((s) => ({ ...s, reminders: { ...s.reminders, waterMin: v } }))}
              />
              <SliderRow
                label="Stretch interval"
                value={settings.reminders.stretchMin}
                min={20}
                max={120}
                step={10}
                onChange={(v) => setSettings((s) => ({ ...s, reminders: { ...s.reminders, stretchMin: v } }))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={reminders.snooze10}>Snooze 10</Button>
              <Button variant="outline" onClick={reminders.markWaterDone}>Log Water</Button>
              <Button variant="outline" onClick={reminders.markBreakDone}>Start Break</Button>
              <Button variant="outline" onClick={reminders.markStretchDone}>Stretch Done</Button>

              <div className="ml-auto flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setSettings((s) => ({ ...s, reminders: { breakMin: 25, waterMin: 60, stretchMin: 45 } }))}
                >
                  Preset: Study
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSettings((s) => ({ ...s, reminders: { breakMin: 50, waterMin: 90, stretchMin: 60 } }))}
                >
                  Preset: Work
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pomodoro + AI panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pomodoro */}
        <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_50px_-30px_rgba(16,185,129,0.45)]">
          <CardHeader>
            <CardTitle>Pomodoro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Chip tone="green" label={pomoMode === "focus" ? "FOCUS" : "BREAK"} on />
              <div className="text-3xl font-semibold tabular-nums">{formatMMSS(Math.max(0, pomoSec))}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SliderRow label="Focus" value={focusMin} min={15} max={60} step={5} onChange={setFocusMin} />
              <SliderRow label="Break" value={breakMin} min={5} max={20} step={5} onChange={setBreakMin} />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setPomoRunning((v) => !v)}>{pomoRunning ? "Pause" : "Start"}</Button>
              <Button variant="outline" onClick={resetPomodoro}>Reset</Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Auto-switches focus/break and logs a break reminder.
            </div>
          </CardContent>
        </Card>

        {/* AI Panel */}
        <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_50px_-30px_rgba(99,102,241,0.55)] lg:col-span-2">
          <CardHeader>
            <CardTitle>AI Coach</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={getCoachingNow} disabled={coachLoading}>
                {coachLoading ? "Getting coaching..." : "Get Coaching Now"}
              </Button>
              <Button variant="outline" onClick={generateDailySummary} disabled={summaryLoading}>
                {summaryLoading ? "Generating..." : "Generate Daily Summary"}
              </Button>

              <div className="ml-auto flex gap-2">
                <button
                  className={[
                    "px-3 py-1 rounded-full text-sm border transition",
                    tab === "coach"
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:bg-muted text-foreground",
                  ].join(" ")}
                  onClick={() => setTab("coach")}
                >
                  Coaching
                </button>
                <button
                  className={[
                    "px-3 py-1 rounded-full text-sm border transition",
                    tab === "summary"
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:bg-muted text-foreground",
                  ].join(" ")}
                  onClick={() => setTab("summary")}
                >
                  Daily Summary
                </button>
              </div>
            </div>

            {coachErr && <div className="text-sm text-red-600">{coachErr}</div>}
            {summaryErr && <div className="text-sm text-red-600">{summaryErr}</div>}

            {tab === "coach" ? (
              <AiBlock
                title="Coaching"
                emptyHint="Click “Get Coaching Now” to generate immediate feedback."
                data={
                  coach
                    ? { bullets: coach.insights, nudges: coach.nudges, exercises: coach.exercises, tips: coach.setupTips }
                    : null
                }
              />
            ) : (
              <AiBlock
                title="Daily Summary"
                emptyHint="Click “Generate Daily Summary” to summarize today’s metrics."
                data={
                  summary
                    ? { summaryText: summary.summaryText, bullets: summary.insights, exercises: summary.exercises, tips: summary.setupTips }
                    : null
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function AiBlock({
  title,
  emptyHint,
  data,
}: {
  title: string;
  emptyHint: string;
  data: null | {
    summaryText?: string;
    bullets?: string[];
    nudges?: { title: string; message: string; cooldownMin: number }[];
    exercises?: { name: string; durationSec: number; steps: string[] }[];
    tips?: string[];
  };
}) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/80 backdrop-blur p-6 text-sm text-muted-foreground">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.summaryText ? (
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground mt-2">{data.summaryText}</div>
        </div>
      ) : null}

      {data.bullets?.length ? (
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4">
          <div className="text-sm font-medium text-foreground">Insights</div>
          <ul className="list-disc pl-5 text-sm text-muted-foreground mt-2 space-y-1">
            {data.bullets.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.nudges?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.nudges.map((n, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4">
              <div className="text-sm font-medium text-foreground">{n.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{n.message}</div>
              <div className="text-xs text-muted-foreground mt-2">Cooldown: {n.cooldownMin} min</div>
            </div>
          ))}
        </div>
      ) : null}

      {data.exercises?.length ? (
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4">
          <div className="text-sm font-medium text-foreground">Exercises</div>
          <div className="mt-2 space-y-3">
            {data.exercises.map((ex, i) => (
              <div key={i} className="rounded-xl bg-muted border border-border p-3">
                <div className="text-sm font-medium text-foreground">
                  {ex.name} · {ex.durationSec}s
                </div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground mt-1">
                  {ex.steps.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.tips?.length ? (
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4">
          <div className="text-sm font-medium text-foreground">Setup tips</div>
          <ul className="list-disc pl-5 text-sm text-muted-foreground mt-2 space-y-1">
            {data.tips.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}