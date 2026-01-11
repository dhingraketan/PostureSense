import type { MinuteBucket, Session, AppEvent } from "@/types/contracts";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(filename: string, data: unknown) {
  download(filename, JSON.stringify(data, null, 2), "application/json");
}

export function exportBucketsCSV(filename: string, buckets: MinuteBucket[]) {
  const header = [
    "id",
    "sessionId",
    "minuteTs",
    "good",
    "slouch",
    "lean_left",
    "lean_right",
    "too_close",
    "shoulder_imbalance",
    "screenFacing",
    "lookingAway",
    "away",
    "blinkCount",
    "fatigueAvg",
    "alertCount",
    "breakRem",
    "waterRem",
    "stretchRem",
  ];

  const rows = buckets.map((b) => [
    b.id,
    b.sessionId,
    b.minuteTs,
    b.postureSec.good ?? 0,
    b.postureSec.slouch ?? 0,
    b.postureSec.lean_left ?? 0,
    b.postureSec.lean_right ?? 0,
    b.postureSec.too_close ?? 0,
    b.postureSec.shoulder_imbalance ?? 0,
    b.focusSec.screenFacing ?? 0,
    b.focusSec.lookingAway ?? 0,
    b.focusSec.away ?? 0,
    b.blinkCount ?? 0,
    b.fatigueAvg ?? 0,
    b.alertCount ?? 0,
    b.reminderCount.break ?? 0,
    b.reminderCount.water ?? 0,
    b.reminderCount.stretch ?? 0,
  ]);

  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  download(filename, csv, "text/csv");
}

export function exportFullDataset(filename: string, sessions: Session[], buckets: MinuteBucket[], events: AppEvent[]) {
  exportJSON(filename, { sessions, buckets, events });
}
