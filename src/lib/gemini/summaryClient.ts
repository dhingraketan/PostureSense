export type AiSummary = {
  summaryText?: string;
  insights?: string[];
  exercises?: { name: string; durationSec: number; steps: string[] }[];
  setupTips?: string[];
  recommendedReminders?: { breakMin: number; waterMin: number; stretchMin: number };
};

export async function fetchAiSummary(payload: unknown): Promise<AiSummary> {
  const res = await fetch("/api/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Summary request failed (${res.status})`);
  }
  return res.json();
}
