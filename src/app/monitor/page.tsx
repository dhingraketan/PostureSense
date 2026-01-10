import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MonitorPage() {
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Monitor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Person A will plug in live camera + posture/focus detection here.
          </div>
          <div className="text-sm">
            Controls exist on Dashboard for reminders + Gemini. Monitor page will later include Start/Stop + Focus Mode.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
