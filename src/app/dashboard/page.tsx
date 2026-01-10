"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserSettings, AppEvent } from "@/types/contracts";
import { logEvent, getLastNMinutesBuckets } from "@/lib/storage/repo";
import { sumBuckets, postureScore, topIssue, blinkRate } from "@/lib/stats/compute";
import { useReminders } from "@/hooks/useReminders";

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

export default function DashboardPage() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined); // Person A will set this later

  const [coachLoading, setCoachLoading] = useState(false);
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [coachErr, setCoachErr] = useState<string | null>(null);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  // reminder engine: logs events into DB
  const reminders = useReminders({
    settings,
    sessionId: activeSessionId,
    enabled: remindersEnabled,
    voiceEnabled: settings.voiceEnabled,
    onEvent: async (e: AppEvent) => {
      await logEvent(e);
    },
  });

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

      // apply recommended reminders quickly (optional)
      if (data.recommendedReminders) {
        setSettings((s) => ({
          ...s,
          reminders: { ...s.reminders, ...data.recommendedReminders },
        }));
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
      // today range
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const end = Date.now();

      const buckets = await (await import("@/lib/storage/repo")).getBucketsInRange(start, end);
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

      if (data.recommendedReminders) {
        setSettings((s) => ({
          ...s,
          reminders: { ...s.reminders, ...data.recommendedReminders },
        }));
      }
    } catch (e: any) {
      setSummaryErr(e?.message ?? "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Controls */}
          <section className="space-y-3">
            <div className="font-medium">Controls</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ToggleRow
                label="Reminders enabled"
                checked={remindersEnabled}
                onChange={setRemindersEnabled}
              />
              <ToggleRow
                label="Voice alerts"
                checked={settings.voiceEnabled}
                onChange={(v) => setSettings((s) => ({ ...s, voiceEnabled: v }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberRow
                label="Break (min)"
                value={settings.reminders.breakMin}
                onChange={(v) => setSettings((s) => ({ ...s, reminders: { ...s.reminders, breakMin: v } }))}
              />
              <NumberRow
                label="Water (min)"
                value={settings.reminders.waterMin}
                onChange={(v) => setSettings((s) => ({ ...s, reminders: { ...s.reminders, waterMin: v } }))}
              />
              <NumberRow
                label="Stretch (min)"
                value={settings.reminders.stretchMin}
                onChange={(v) => setSettings((s) => ({ ...s, reminders: { ...s.reminders, stretchMin: v } }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="border rounded px-3 py-2" onClick={reminders.snooze10}>
                Snooze 10 min
              </button>
              <button className="border rounded px-3 py-2" onClick={reminders.markWaterDone}>
                Log Water
              </button>
              <button className="border rounded px-3 py-2" onClick={reminders.markBreakDone}>
                Start Break Now
              </button>
              <button className="border rounded px-3 py-2" onClick={reminders.markStretchDone}>
                Stretch Done
              </button>
            </div>
          </section>

          {/* Gemini actions */}
          <section className="space-y-3">
            <div className="font-medium">Gemini Actions</div>

            <div className="flex flex-wrap gap-2">
              <button className="border rounded px-3 py-2" onClick={getCoachingNow} disabled={coachLoading}>
                {coachLoading ? "Getting coaching..." : "Get Coaching Now"}
              </button>

              <button className="border rounded px-3 py-2" onClick={generateDailySummary} disabled={summaryLoading}>
                {summaryLoading ? "Generating..." : "Generate Daily Summary"}
              </button>
            </div>

            {coachErr && <div className="text-sm text-red-600">{coachErr}</div>}
            {summaryErr && <div className="text-sm text-red-600">{summaryErr}</div>}

            {coach && (
              <Card>
                <CardHeader>
                  <CardTitle>Coaching</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coach.insights?.length ? (
                    <ul className="list-disc pl-5 text-sm">
                      {coach.insights.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  ) : null}

                  {coach.nudges?.length ? (
                    <div className="space-y-2">
                      <div className="font-medium">Nudges</div>
                      {coach.nudges.map((n, i) => (
                        <div key={i} className="border rounded p-3">
                          <div className="font-medium">{n.title}</div>
                          <div className="text-sm text-muted-foreground">{n.message}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {coach.exercises?.length ? (
                    <div className="space-y-2">
                      <div className="font-medium">Exercises</div>
                      {coach.exercises.map((ex, i) => (
                        <div key={i} className="border rounded p-3">
                          <div className="font-medium">{ex.name} · {ex.durationSec}s</div>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground mt-1">
                            {ex.steps.map((s, j) => <li key={j}>{s}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {summary && (
              <Card>
                <CardHeader>
                  <CardTitle>Daily Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {summary.summaryText && <div className="text-sm">{summary.summaryText}</div>}
                  {summary.insights?.length ? (
                    <ul className="list-disc pl-5 text-sm text-muted-foreground">
                      {summary.insights.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </section>
        </CardContent>
      </Card>
    </main>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between border rounded px-3 py-2">
      <span className="text-sm">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between border rounded px-3 py-2">
      <span className="text-sm">{label}</span>
      <input
        className="w-20 border rounded px-2 py-1 text-sm"
        type="number"
        value={value}
        min={1}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
