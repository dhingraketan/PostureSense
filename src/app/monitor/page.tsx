import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MonitorPage() {
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Monitor</CardTitle>
        </CardHeader>
        <CardContent>
          Live camera + posture/focus detection will go here.
        </CardContent>
      </Card>
    </main>
  );
}