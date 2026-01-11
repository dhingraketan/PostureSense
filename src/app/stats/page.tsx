"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Legend,
  Cell,
} from "recharts";

import { getBucketsInRange, getSessionsInRange, getEventsInRange } from "@/lib/storage/repo";
import { seedFakeData } from "@/lib/storage/devSeed";
import { exportBucketsCSV, exportFullDataset } from "@/lib/export/export";

import {
  sumBuckets,
  postureScore,
  topIssue,
  chartRows,
  postureBreakdownData,
  focusBreakdownData,
  countEventTypes,
  blinkRate,
} from "@/lib/stats/compute";

import type { MinuteBucket, Session, AppEvent } from "@/types/contracts";
import { fetchAiSummary, type AiSummary } from "@/lib/gemini/summaryClient";

type Preset = "today" | "7d" | "30d";

/** Range helper */
function rangeFor(p: Preset) {
  const now = new Date();
  if (p === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end: Date.now() };
  }
  const days = p === "7d" ? 7 : 30;
  return { start: Date.now() - days * 24 * 60 * 60_000, end: Date.now() };
}

/**
 * Build a fixed Sun..Sat weekly dataset for charts
 * - postureScore: avg per weekday (0-100)
 * - blinks: avg blinks per minute for that weekday
 * - fatigue: avg fatigue (0-100)
 */
function aggregateWeekSunSat(buckets: MinuteBucket[]) {
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  type Agg = {
    postureSum: number;
    postureCount: number;
    blinkSum: number; // sum blinkCount
    minuteCount: number; // number of buckets (minutes)
    fatigueSum: number;
    fatigueCount: number;
  };

  const agg: Agg[] = Array.from({ length: 7 }, () => ({
    postureSum: 0,
    postureCount: 0,
    blinkSum: 0,
    minuteCount: 0,
    fatigueSum: 0,
    fatigueCount: 0,
  }));

  for (const b of buckets) {
    const d = new Date(b.minuteTs).getDay(); // 0 Sun .. 6 Sat

    // posture score (computed from postureSec distribution)
    const ps = postureScore(b.postureSec);
    agg[d].postureSum += ps;
    agg[d].postureCount += 1;

    // blink rate: we will compute avg blinks per minute for that day
    agg[d].blinkSum += b.blinkCount ?? 0;
    agg[d].minuteCount += 1;

    // fatigue avg
    agg[d].fatigueSum += b.fatigueAvg ?? 0;
    agg[d].fatigueCount += 1;
  }

  return dayLabels.map((day, i) => ({
    day,
    postureScore: agg[i].postureCount ? Math.round(agg[i].postureSum / agg[i].postureCount) : 0,
    blinks: agg[i].minuteCount ? Math.round(agg[i].blinkSum / agg[i].minuteCount) : 0,
    fatigue: agg[i].fatigueCount ? Math.round(agg[i].fatigueSum / agg[i].fatigueCount) : 0,
  }));
}

/** Shared page background shell (same vibe as dashboard) */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className={[
        "min-h-screen p-6 max-w-6xl mx-auto space-y-6",
        "bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(59,130,246,0.12),transparent_40%),radial-gradient(900px_circle_at_90%_10%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(900px_circle_at_50%_100%,rgba(168,85,247,0.10),transparent_45%)]",
        "dark:bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_10%,rgba(16,185,129,0.16),transparent_40%),radial-gradient(900px_circle_at_50%_100%,rgba(168,85,247,0.16),transparent_45%)]",
      ].join(" ")}
    >
      {children}
    </main>
  );
}

/** Buttons */
function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={[
        "rounded-xl px-4 py-2 text-sm font-medium text-white",
        "bg-gradient-to-r from-sky-600 via-indigo-600 to-fuchsia-600",
        "hover:brightness-110 active:scale-[0.98] transition",
        "shadow-[0_10px_30px_-12px_rgba(99,102,241,0.75)]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
      ].join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function SoftButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={[
        "rounded-xl px-4 py-2 text-sm font-medium transition",
        "border border-border bg-card/70 backdrop-blur",
        "hover:bg-muted hover:-translate-y-0.5 active:translate-y-0",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      ].join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** KPI card */
function Kpi({
  title,
  value,
  sub,
  glow,
}: {
  title: string;
  value: string;
  sub?: string;
  glow?: string;
}) {
  return (
    <Card
      className={[
        "rounded-2xl border border-border bg-card/80 backdrop-blur transition-all",
        "hover:-translate-y-0.5",
        glow ?? "hover:shadow-[0_18px_45px_-28px_rgba(99,102,241,0.35)]",
      ].join(" ")}
    >
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const [preset, setPreset] = useState<Preset>("today");
  const [buckets, setBuckets] = useState<MinuteBucket[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // AI summary state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);

  async function refresh() {
    setLoading(true);
    const { start, end } = rangeFor(preset);
    const [b, s, e] = await Promise.all([
      getBucketsInRange(start, end),
      getSessionsInRange(start, end),
      getEventsInRange(start, end),
    ]);
    setBuckets(b);
    setSessions(s);
    setEvents(e);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const totals = useMemo(() => sumBuckets(buckets), [buckets]);
  const score = useMemo(() => postureScore(totals.postureSec), [totals]);
  const issue = useMemo(() => topIssue(totals.postureSec), [totals]);
  const eventCounts = useMemo(() => countEventTypes(events), [events]);

  // CHART DATA
  const minuteRows = useMemo(() => chartRows(buckets), [buckets]);
  const weekRows = useMemo(() => aggregateWeekSunSat(buckets), [buckets]);

  const rows = preset === "7d" ? weekRows : minuteRows;

  const posturePie = useMemo(() => postureBreakdownData(totals.postureSec), [totals]);
  const focusPie = useMemo(() => focusBreakdownData(totals.focusSec), [totals]);

  const hasData = buckets.length > 0;

  async function handleAiSummary() {
    setAiError(null);
    setAiLoading(true);
    try {
      const { start, end } = rangeFor(preset);

      const payload = {
        range: { start, end, preset },
        aggregates: {
          postureScore: score,
          topIssue: issue,
          postureSec: totals.postureSec,
          focusSec: totals.focusSec,
          avgFatigue: Math.round(totals.avgFatigue),
          avgBlinkRate: blinkRate(totals.blinks, buckets.length),
          reminders: totals.reminders,
          eventCounts,
        },
      };

      const data = await fetchAiSummary(payload);
      setAi(data);
    } catch (err: any) {
      setAiError(err?.message ?? "Failed to generate AI summary");
    } finally {
      setAiLoading(false);
    }
  }

  // Pie colors
  const POSTURE_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ef4444", "#06b6d4"];
  const FOCUS_COLORS = ["#22c55e", "#f97316", "#ef4444"];

  // Axis colors (for dark mode visibility)
  const axisTick = { fontSize: 12, fill: "rgba(255,255,255,0.70)" };
  const axisTickLight = { fontSize: 12, fill: "rgba(0,0,0,0.65)" };

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stats</h1>
          <div className="text-sm text-muted-foreground mt-1">
            Trends, breakdowns, sessions, and Gemini insights.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-border bg-card/70 backdrop-blur px-3 py-2 text-sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          <PrimaryButton
            onClick={async () => {
              await seedFakeData();
              await refresh();
            }}
          >
            Seed Fake Data
          </PrimaryButton>

          <SoftButton onClick={() => exportBucketsCSV(`buckets-${preset}.csv`, buckets)} disabled={!hasData}>
            Export CSV
          </SoftButton>

          <SoftButton
            onClick={() => exportFullDataset(`dataset-${preset}.json`, sessions, buckets, events)}
            disabled={!hasData}
          >
            Export JSON
          </SoftButton>
        </div>
      </div>

      {loading && (
        <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
          <CardContent className="p-6">Loading…</CardContent>
        </Card>
      )}

      {!loading && !hasData && (
        <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>No data yet</CardTitle>
          </CardHeader>
          <CardContent>
            Start monitoring to generate stats, or click <b>Seed Fake Data</b> to test charts.
          </CardContent>
        </Card>
      )}

      {!loading && hasData && (
        <>
          {/* KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              title="Posture Score"
              value={`${score}/100`}
              sub={`Top issue: ${issue}`}
              glow="hover:shadow-[0_18px_45px_-28px_rgba(59,130,246,0.55)]"
            />
            <Kpi
              title="Good posture"
              value={`${Math.round(totals.postureSec.good / 60)} min`}
              sub="Total in range"
              glow="hover:shadow-[0_18px_45px_-28px_rgba(34,197,94,0.50)]"
            />
            <Kpi
              title="Screen-facing"
              value={`${Math.round(totals.focusSec.screenFacing / 60)} min`}
              sub={`Looking away: ${Math.round(totals.focusSec.lookingAway / 60)} min · Away: ${Math.round(
                totals.focusSec.away / 60
              )} min`}
              glow="hover:shadow-[0_18px_45px_-28px_rgba(99,102,241,0.55)]"
            />
            <Kpi
              title="Blink rate"
              value={`${blinkRate(totals.blinks, buckets.length)}/min`}
              sub={`Avg fatigue: ${Math.round(totals.avgFatigue)}/100`}
              glow="hover:shadow-[0_18px_45px_-28px_rgba(168,85,247,0.55)]"
            />
          </div>

          {/* EVENT KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi title="Posture alerts" value={`${eventCounts["posture_alert"] ?? 0}`} />
            <Kpi title="Distraction alerts" value={`${eventCounts["distraction_alert"] ?? 0}`} />
            <Kpi title="Break reminders" value={`${eventCounts["break_reminder"] ?? 0}`} sub={`Logged: ${totals.reminders.break}`} />
            <Kpi title="Water reminders" value={`${eventCounts["water_reminder"] ?? 0}`} sub={`Logged: ${totals.reminders.water}`} />
          </div>

          {/* POSTURE TIMELINE */}
          <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(59,130,246,0.55)]">
            <CardHeader>
              <CardTitle>
                Posture score timeline {preset === "7d" ? "(Sun → Sat)" : ""}
              </CardTitle>
            </CardHeader>

            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                  <XAxis
                    dataKey={preset === "7d" ? "day" : "time"}
                    tick={typeof window !== "undefined" && document.documentElement.classList.contains("dark") ? axisTick : axisTickLight}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={typeof window !== "undefined" && document.documentElement.classList.contains("dark") ? axisTick : axisTickLight}
                    label={{
                      value: "Posture Score",
                      angle: -90,
                      position: "insideLeft",
                      style: { textAnchor: "middle" },
                    }}
                  />
                  <Tooltip />
                  <Line type="monotone" dataKey="postureScore" stroke="#3b82f6" strokeWidth={3} dot={preset === "7d"} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* PIE CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(34,197,94,0.45)]">
              <CardHeader>
                <CardTitle>Posture breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={posturePie} dataKey="value" nameKey="name" outerRadius={110} label>
                      {posturePie.map((_, i) => (
                        <Cell key={i} fill={POSTURE_COLORS[i % POSTURE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(168,85,247,0.45)]">
              <CardHeader>
                <CardTitle>Focus breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={focusPie} dataKey="value" nameKey="name" outerRadius={110} label>
                      {focusPie.map((_, i) => (
                        <Cell key={i} fill={FOCUS_COLORS[i % FOCUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* BLINK + FATIGUE TREND */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(168,85,247,0.45)]">
              <CardHeader>
                <CardTitle>Blink trend {preset === "7d" ? "(Sun → Sat)" : ""}</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                    <XAxis dataKey={preset === "7d" ? "day" : "time"} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="blinks" stroke="#a855f7" strokeWidth={3} dot={preset === "7d"} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(34,197,94,0.45)]">
              <CardHeader>
                <CardTitle>Fatigue trend {preset === "7d" ? "(Sun → Sat)" : ""}</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                    <XAxis dataKey={preset === "7d" ? "day" : "time"} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="fatigue" stroke="#22c55e" strokeWidth={3} dot={preset === "7d"} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* SESSIONS */}
          <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(59,130,246,0.35)]">
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left border-b border-border">
                    <tr>
                      <th className="py-2 pr-4">Start</th>
                      <th className="py-2 pr-4">End</th>
                      <th className="py-2 pr-4">Focus Mode</th>
                      <th className="py-2 pr-4">Sensitivity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions
                      .slice()
                      .sort((a, b) => b.startTs - a.startTs)
                      .map((s) => (
                        <tr key={s.id} className="border-b border-border/60">
                          <td className="py-2 pr-4">{new Date(s.startTs).toLocaleString()}</td>
                          <td className="py-2 pr-4">{s.endTs ? new Date(s.endTs).toLocaleString() : "Active"}</td>
                          <td className="py-2 pr-4">{s.settingsSnapshot.focusMode ? "On" : "Off"}</td>
                          <td className="py-2 pr-4">{s.settingsSnapshot.sensitivity}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* AI INSIGHTS */}
          <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(99,102,241,0.55)]">
            <CardHeader>
              <CardTitle>AI Insights (Gemini)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PrimaryButton onClick={handleAiSummary} disabled={aiLoading}>
                {aiLoading ? "Generating..." : "Generate AI Summary for this range"}
              </PrimaryButton>

              {aiError && <div className="text-sm text-red-600">{aiError}</div>}

              {!ai && !aiLoading && (
                <div className="text-sm text-muted-foreground">
                  This will call <code>/api/summary</code> and show a summary + recommendations.
                </div>
              )}

              {ai && (
                <div className="space-y-3">
                  {ai.summaryText && (
                    <div>
                      <div className="font-medium mb-1">Summary</div>
                      <div className="text-sm text-muted-foreground">{ai.summaryText}</div>
                    </div>
                  )}

                  {ai.insights?.length ? (
                    <div>
                      <div className="font-medium mb-1">Insights</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {ai.insights.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {ai.setupTips?.length ? (
                    <div>
                      <div className="font-medium mb-1">Setup tips</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {ai.setupTips.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {ai.exercises?.length ? (
                    <div>
                      <div className="font-medium mb-1">Recommended exercises</div>
                      <div className="space-y-2">
                        {ai.exercises.map((ex, i) => (
                          <div key={i} className="rounded-xl border border-border bg-card/60 p-3">
                            <div className="font-medium">
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

                  {ai.recommendedReminders ? (
                    <div>
                      <div className="font-medium mb-1">Suggested reminders</div>
                      <div className="text-sm text-muted-foreground">
                        Break: {ai.recommendedReminders.breakMin}m · Water: {ai.recommendedReminders.waterMin}m · Stretch:{" "}
                        {ai.recommendedReminders.stretchMin}m
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}