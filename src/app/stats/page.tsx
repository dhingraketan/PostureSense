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
  postureBreakdownData,
  focusBreakdownData,
  countEventTypes,
  blinkRate,
} from "@/lib/stats/compute";

import type { MinuteBucket, Session, AppEvent } from "@/types/contracts";
import { fetchAiSummary, type AiSummary } from "@/lib/gemini/summaryClient";

type Preset = "today" | "7d" | "30d";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Pie colors (good contrast in dark mode)
const PIE_COLORS_POSTURE = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ef4444", "#06b6d4"];
const PIE_COLORS_FOCUS = ["#3b82f6", "#a855f7", "#ef4444"];

/**
 * Always return EXACTLY 7 points (Sun..Sat).
 * We average postureScore/fatigue/blinks across all MinuteBuckets that fall on each weekday.
 */
function weeklyAggregate(buckets: MinuteBucket[]) {
  const agg = new Map<number, { postureSum: number; fatigueSum: number; blinkSum: number; n: number }>();
  for (let i = 0; i < 7; i++) agg.set(i, { postureSum: 0, fatigueSum: 0, blinkSum: 0, n: 0 });

  for (const b of buckets) {
    const dayIdx = new Date(b.minuteTs).getDay(); // 0=Sun..6=Sat
    const v = agg.get(dayIdx)!;

    v.postureSum += postureScore(b.postureSec);
    v.fatigueSum += b.fatigueAvg ?? 0;
    v.blinkSum += b.blinkCount ?? 0;
    v.n += 1;
  }

  return WEEK_DAYS.map((day, idx) => {
    const v = agg.get(idx)!;
    const denom = Math.max(1, v.n);
    return {
      day,
      postureScore: Math.round(v.postureSum / denom),
      fatigue: Math.round(v.fatigueSum / denom),
      blinks: Math.round(v.blinkSum / denom),
    };
  });
}

function rangeFor(p: Preset) {
  const now = new Date();
  if (p === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end: Date.now() };
  }
  const days = p === "7d" ? 7 : 30;
  return { start: Date.now() - days * 24 * 60 * 60_000, end: Date.now() };
}

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

export default function StatsPage() {
  const [preset, setPreset] = useState<Preset>("today");
  const [buckets, setBuckets] = useState<MinuteBucket[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);

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

  const posturePie = useMemo(() => postureBreakdownData(totals.postureSec), [totals]);
  const focusPie = useMemo(() => focusBreakdownData(totals.focusSec), [totals]);
  const eventCounts = useMemo(() => countEventTypes(events), [events]);

  const hasData = buckets.length > 0;

  // ✅ IMPORTANT: For charts, always compare by weekday
  const weeklyRows = useMemo(() => weeklyAggregate(buckets), [buckets]);

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
            <Kpi title="Posture Score" value={`${score}/100`} sub={`Top issue: ${issue}`} />
            <Kpi title="Good posture" value={`${Math.round(totals.postureSec.good / 60)} min`} sub="Total in range" />
            <Kpi
              title="Screen-facing"
              value={`${Math.round(totals.focusSec.screenFacing / 60)} min`}
              sub={`Looking away: ${Math.round(totals.focusSec.lookingAway / 60)} min · Away: ${Math.round(
                totals.focusSec.away / 60
              )} min`}
            />
            <Kpi
              title="Blink rate"
              value={`${blinkRate(totals.blinks, buckets.length)}/min`}
              sub={`Avg fatigue: ${Math.round(totals.avgFatigue)}/100`}
            />
          </div>

          {/* Posture timeline (Sun..Sat) */}
          <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_55px_-32px_rgba(59,130,246,0.55)]">
            <CardHeader>
              <CardTitle>Posture score timeline (Sun → Sat)</CardTitle>
            </CardHeader>

            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyRows}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    label={{
                      value: "Posture Score",
                      angle: -90,
                      position: "insideLeft",
                      style: { textAnchor: "middle" },
                    }}
                  />
                  <Tooltip />
                  <Line type="monotone" dataKey="postureScore" stroke="#3b82f6" strokeWidth={4} dot />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Pie charts with colors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle>Posture breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={posturePie} dataKey="value" nameKey="name" outerRadius={110} label>
                      {posturePie.map((_, i) => (
                        <Cell key={`posture-${i}`} fill={PIE_COLORS_POSTURE[i % PIE_COLORS_POSTURE.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle>Focus breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={focusPie} dataKey="value" nameKey="name" outerRadius={110} label>
                      {focusPie.map((_, i) => (
                        <Cell key={`focus-${i}`} fill={PIE_COLORS_FOCUS[i % PIE_COLORS_FOCUS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Blink + Fatigue trends (Sun..Sat) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle>Blink trend (Sun → Sat)</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyRows}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="blinks" stroke="#a855f7" strokeWidth={4} dot />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle>Fatigue trend (Sun → Sat)</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyRows}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="fatigue" stroke="#22c55e" strokeWidth={4} dot />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Sessions */}
          <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
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

          {/* AI panel */}
          <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur">
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
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_-28px_rgba(99,102,241,0.35)]">
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}