import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MonitorPage() {
  return (
    <main
      className="min-h-screen p-6 max-w-6xl mx-auto space-y-6
      bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(59,130,246,0.12),transparent_40%),radial-gradient(900px_circle_at_90%_10%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(900px_circle_at_50%_100%,rgba(168,85,247,0.10),transparent_45%)]
      dark:bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_10%,rgba(16,185,129,0.16),transparent_40%),radial-gradient(900px_circle_at_50%_100%,rgba(168,85,247,0.16),transparent_45%)]"
    >
      <div>
        <h1 className="text-2xl font-semibold">Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live camera feed + posture/focus detection (Person A wiring).
        </p>
      </div>

      <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur transition-all hover:shadow-[0_18px_50px_-30px_rgba(59,130,246,0.55)]">
        <CardHeader>
          <CardTitle>Live Feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            Camera preview + overlays will render here.
            <div className="mt-2 text-xs">
              Suggestion: show face box, posture skeleton, focus state badge, blink rate badge.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-border bg-card/70 p-4 transition-all hover:shadow-[0_18px_40px_-28px_rgba(16,185,129,0.45)]">
              <div className="text-xs text-muted-foreground">Posture</div>
              <div className="text-lg font-semibold mt-1">—</div>
              <div className="text-xs text-muted-foreground mt-1">good / slouch / lean</div>
            </div>

            <div className="rounded-2xl border border-border bg-card/70 p-4 transition-all hover:shadow-[0_18px_40px_-28px_rgba(168,85,247,0.45)]">
              <div className="text-xs text-muted-foreground">Focus</div>
              <div className="text-lg font-semibold mt-1">—</div>
              <div className="text-xs text-muted-foreground mt-1">screen / looking away / away</div>
            </div>

            <div className="rounded-2xl border border-border bg-card/70 p-4 transition-all hover:shadow-[0_18px_40px_-28px_rgba(99,102,241,0.45)]">
              <div className="text-xs text-muted-foreground">Fatigue</div>
              <div className="text-lg font-semibold mt-1">—</div>
              <div className="text-xs text-muted-foreground mt-1">blink rate + emotion signal</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}