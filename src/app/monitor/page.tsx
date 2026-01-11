"use client";

import { useMemo } from "react";
import { useMonitoringEngine } from "@/hooks/useMonitoringEngine";
import { useCoachNotifier, requestCoachNotificationPermission } from "@/lib/coach/useCoachNotifier";
import type { PostureState } from "@/types";

// ---------- Theme shell (same vibe as Dashboard/Stats) ----------
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

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const styles =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : tone === "warn"
      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
      : "bg-zinc-500/15 text-zinc-200 border-zinc-500/30";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${styles}`}>
      {label}
    </span>
  );
}

function prettyLabel(s: PostureState) {
  return s.replaceAll("_", " ");
}

/**
 * Tone mapping:
 * - no_person => neutral
 * - everything else => warn (since your current union has no "good")
 * If later you add "good" back, you can treat it as ok.
 */
function toneForPrimary(p: PostureState): "ok" | "warn" | "neutral" {
  if (p === "no_person") return "neutral";
  return "warn";
}

export default function MonitorPage() {
  const engine = useMonitoringEngine({ drawDebug: true, mirror: true, enableFace: true });
  useCoachNotifier(engine);

  const primary = engine.currentPostureState; // PostureState
  const activeList = engine.activeStates ?? [];

  const primaryTone = useMemo(() => toneForPrimary(primary), [primary]);

  return (
    <PageShell>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Monitor</h1>
          <div className="text-sm text-muted-foreground mt-1">
            Live camera view with posture detection + overlay.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Pill
            label={engine.isRunning ? "Monitoring ON" : "Monitoring OFF"}
            tone={engine.isRunning ? "ok" : "neutral"}
          />
          <Pill label={`Primary: ${prettyLabel(primary)}`} tone={primaryTone} />
          <Pill
            label={`Active: ${activeList.length}`}
            tone={activeList.length ? "warn" : "neutral"}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={() => engine.start()} disabled={engine.isRunning}>
          Start
        </PrimaryButton>
        <SoftButton onClick={() => engine.stop()} disabled={!engine.isRunning}>
          Stop
        </SoftButton>
        <SoftButton
          onClick={async () => {
            await requestCoachNotificationPermission();
          }}
        >
          Enable Notifications
        </SoftButton>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera Card */}
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-border bg-card/70 backdrop-blur p-4 md:p-5 shadow-[0_18px_60px_-40px_rgba(59,130,246,0.55)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-medium">Live feed</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Debug overlay is ON · mirrored view
                </div>
              </div>

              <span className="text-xs text-muted-foreground">
                Tip: keep your shoulders visible for best detection
              </span>
            </div>

            <div className="relative w-full aspect-video overflow-hidden rounded-2xl border border-border bg-black/20">
              <video
                ref={engine.videoRef}
                className="h-full w-full object-cover -scale-x-100"
                playsInline
                muted
              />
              <canvas
                ref={engine.canvasRef}
                className="absolute inset-0 h-full w-full pointer-events-none"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Pill label={`Primary: ${prettyLabel(primary)}`} tone={primaryTone} />
              {activeList.slice(0, 6).map((x) => (
                <Pill key={x} label={prettyLabel(x)} tone="neutral" />
              ))}
              {activeList.length > 6 ? (
                <Pill label={`+${activeList.length - 6} more`} tone="neutral" />
              ) : null}
            </div>
          </div>
        </div>

        {/* Status / Details */}
        <div className="rounded-3xl border border-border bg-card/70 backdrop-blur p-5">
          <div className="text-sm font-medium">Status</div>
          <div className="text-xs text-muted-foreground mt-1">
            What the model is currently detecting.
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="text-xs text-muted-foreground">Primary posture</div>
              <div className="mt-1 text-lg font-semibold">{prettyLabel(primary)}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                If it says <b>no person</b>, move into frame.
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="text-xs text-muted-foreground">Active signals</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeList.length ? (
                  activeList.map((x) => <Pill key={x} label={prettyLabel(x)} tone="neutral" />)
                ) : (
                  <Pill label="none" tone="neutral" />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="text-xs text-muted-foreground">Quick help</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                <li>If “too close”, move slightly back.</li>
                <li>For “head down”, raise your screen / lower chin.</li>
                <li>For “shoulders unlevel”, sit centered and relax shoulders.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}