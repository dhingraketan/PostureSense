import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StatsPage() {
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Stats</CardTitle>
        </CardHeader>
        <CardContent>
          Charts + session history will go here.
        </CardContent>
      </Card>
    </main>
  );
}