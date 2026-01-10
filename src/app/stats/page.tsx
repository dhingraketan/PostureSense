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
  BarChart,
  Bar,
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

function rangeFor(p: Preset) {
  const now = new Date();
  if (p === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end: Date.now() };
  }
  const days = p === "7d" ? 7 : 30;
  return { start: Date.now() - days * 24 * 60 * 60_000, end: Date.now() };
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

  const rows = useMemo(() => chartRows(buckets), [buckets]);
  const posturePie = useMemo(() => postureBreakdownData(totals.postureSec), [totals]);
  const focusPie = useMemo(() => focusBreakdownData(totals.focusSec), [totals]);

  const eventCounts = useMemo(() => countEventTypes(events), [events]);

  const hasData = buckets.length > 0;

  async function handleAiSummary() {
    setAiError(null);
    setAiLoading(true);
    try {
      const { start, end } = rangeFor(preset);

      // Minimal payload for Person C to support
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
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Stats</h1>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border rounded px-3 py-2"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          <button
            className="border rounded px-3 py-2"
            onClick={async () => {
              await seedFakeData();
              await refresh();
            }}
          >
            Seed Fake Data
          </button>

          <button
            className="border rounded px-3 py-2"
            onClick={() => exportBucketsCSV(`buckets-${preset}.csv`, buckets)}
            disabled={!hasData}
          >
            Export CSV
          </button>

          <button
            className="border rounded px-3 py-2"
            onClick={() => exportFullDataset(`dataset-${preset}.json`, sessions, buckets, events)}
            disabled={!hasData}
          >
            Export JSON
          </button>
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="p-6">Loading…</CardContent>
        </Card>
      )}

      {!loading && !hasData && (
        <Card>
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
              sub={`Looking away: ${Math.round(totals.focusSec.lookingAway / 60)} min · Away: ${Math.round(totals.focusSec.away / 60)} min`}
            />
            <Kpi
              title="Blink rate"
              value={`${blinkRate(totals.blinks, buckets.length)}/min`}
              sub={`Avg fatigue: ${Math.round(totals.avgFatigue)}/100`}
            />
          </div>

          {/* EVENT / REMINDER KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi title="Posture alerts" value={`${eventCounts["posture_alert"] ?? 0}`} />
            <Kpi title="Distraction alerts" value={`${eventCounts["distraction_alert"] ?? 0}`} />
            <Kpi title="Break reminders" value={`${eventCounts["break_reminder"] ?? 0}`} sub={`Logged: ${totals.reminders.break}`} />
            <Kpi title="Water reminders" value={`${eventCounts["water_reminder"] ?? 0}`} sub={`Logged: ${totals.reminders.water}`} />
          </div>

          {/* CHARTS: timeline + trends */}
          <Card>
            <CardHeader>
              <CardTitle>Posture score timeline</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="postureScore" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Posture breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={posturePie} dataKey="value" nameKey="name" outerRadius={110} label />
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Focus breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={focusPie} dataKey="value" nameKey="name" outerRadius={110} label />
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Blink trend</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="blinks" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fatigue trend</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="fatigue" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* SESSIONS */}
          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left border-b">
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
                        <tr key={s.id} className="border-b">
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

          {/* AI INSIGHTS PANEL */}
          <Card>
            <CardHeader>
              <CardTitle>AI Insights (Gemini)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                className="border rounded px-3 py-2"
                onClick={handleAiSummary}
                disabled={aiLoading}
              >
                {aiLoading ? "Generating..." : "Generate AI Summary for this range"}
              </button>

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
                        {ai.insights.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  {ai.setupTips?.length ? (
                    <div>
                      <div className="font-medium mb-1">Setup tips</div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {ai.setupTips.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  {ai.exercises?.length ? (
                    <div>
                      <div className="font-medium mb-1">Recommended exercises</div>
                      <div className="space-y-2">
                        {ai.exercises.map((ex, i) => (
                          <div key={i} className="border rounded p-3">
                            <div className="font-medium">
                              {ex.name} · {ex.durationSec}s
                            </div>
                            <ul className="list-disc pl-5 text-sm text-muted-foreground mt-1">
                              {ex.steps.map((s, j) => <li key={j}>{s}</li>)}
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
                        Break: {ai.recommendedReminders.breakMin}m · Water: {ai.recommendedReminders.waterMin}m · Stretch: {ai.recommendedReminders.stretchMin}m
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
