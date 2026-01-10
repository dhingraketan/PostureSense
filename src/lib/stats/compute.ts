import type { MinuteBucket, PostureState, AppEvent } from "@/types/contracts";

const POSTURE: PostureState[] = [
  "good",
  "slouch",
  "lean_left",
  "lean_right",
  "too_close",
  "shoulder_imbalance",
];

export function sumBuckets(buckets: MinuteBucket[]) {
  const postureSec: Record<PostureState, number> = {
    good: 0,
    slouch: 0,
    lean_left: 0,
    lean_right: 0,
    too_close: 0,
    shoulder_imbalance: 0,
  };

  let screenFacing = 0;
  let lookingAway = 0;
  let away = 0;

  let blinks = 0;
  let fatigueSum = 0;
  let fatigueCount = 0;

  let alerts = 0;
  let breakRem = 0, waterRem = 0, stretchRem = 0;

  for (const b of buckets) {
    for (const s of POSTURE) postureSec[s] += b.postureSec?.[s] ?? 0;

    screenFacing += b.focusSec?.screenFacing ?? 0;
    lookingAway += b.focusSec?.lookingAway ?? 0;
    away += b.focusSec?.away ?? 0;

    blinks += b.blinkCount ?? 0;

    if (Number.isFinite(b.fatigueAvg)) {
      fatigueSum += b.fatigueAvg;
      fatigueCount += 1;
    }

    alerts += b.alertCount ?? 0;

    breakRem += b.reminderCount?.break ?? 0;
    waterRem += b.reminderCount?.water ?? 0;
    stretchRem += b.reminderCount?.stretch ?? 0;
  }

  const totalPosture = POSTURE.reduce((acc, s) => acc + postureSec[s], 0);

  return {
    postureSec,
    focusSec: { screenFacing, lookingAway, away },
    blinks,
    avgFatigue: fatigueCount ? fatigueSum / fatigueCount : 0,
    alerts,
    reminders: { break: breakRem, water: waterRem, stretch: stretchRem },
    totalPostureSec: totalPosture,
  };
}

export function postureScore(postureSec: Record<PostureState, number>) {
  const total =
    postureSec.good +
    postureSec.slouch +
    postureSec.lean_left +
    postureSec.lean_right +
    postureSec.too_close +
    postureSec.shoulder_imbalance;

  if (total <= 0) return 0;

  const bad =
    postureSec.slouch * 1.0 +
    (postureSec.lean_left + postureSec.lean_right) * 0.7 +
    postureSec.too_close * 0.6 +
    postureSec.shoulder_imbalance * 0.5;

  const goodRatio = postureSec.good / total;
  const badRatio = bad / total;

  const score = Math.round(100 * Math.max(0, goodRatio - 0.35 * badRatio));
  return Math.max(0, Math.min(100, score));
}

export function topIssue(postureSec: Record<PostureState, number>) {
  const entries = Object.entries(postureSec).filter(([k]) => k !== "good") as [PostureState, number][];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? "good";
}

export function chartRows(buckets: MinuteBucket[]) {
  return buckets.map((b) => ({
    minuteTs: b.minuteTs,
    time: new Date(b.minuteTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),

    postureScore: postureScore(b.postureSec),

    good: b.postureSec.good ?? 0,
    slouch: b.postureSec.slouch ?? 0,
    leanLeft: b.postureSec.lean_left ?? 0,
    leanRight: b.postureSec.lean_right ?? 0,
    tooClose: b.postureSec.too_close ?? 0,
    shoulderImbalance: b.postureSec.shoulder_imbalance ?? 0,

    screenFacing: b.focusSec.screenFacing ?? 0,
    lookingAway: b.focusSec.lookingAway ?? 0,
    away: b.focusSec.away ?? 0,

    blinks: b.blinkCount ?? 0,
    fatigue: b.fatigueAvg ?? 0,

    alerts: b.alertCount ?? 0,
  }));
}

export function postureBreakdownData(postureSec: Record<PostureState, number>) {
  return [
    { name: "Good", value: postureSec.good },
    { name: "Slouch", value: postureSec.slouch },
    { name: "Lean Left", value: postureSec.lean_left },
    { name: "Lean Right", value: postureSec.lean_right },
    { name: "Too Close", value: postureSec.too_close },
    { name: "Shoulder Imbalance", value: postureSec.shoulder_imbalance },
  ];
}

export function focusBreakdownData(focusSec: { screenFacing: number; lookingAway: number; away: number }) {
  return [
    { name: "Screen-facing", value: focusSec.screenFacing },
    { name: "Looking Away", value: focusSec.lookingAway },
    { name: "Away", value: focusSec.away },
  ];
}

export function countEventTypes(events: AppEvent[]) {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

export function blinkRate(totalBlinks: number, bucketCount: number) {
  if (bucketCount <= 0) return 0;
  return Math.round(totalBlinks / bucketCount);
}
