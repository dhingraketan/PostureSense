export function fallbackSummary(payload: any) {
  const a = payload?.aggregates ?? {};
  const postureScore = a.postureScore ?? 0;
  const topIssue = a.topIssue ?? "slouch";
  const awayMin = Math.round((a.focusSec?.away ?? 0) / 60);
  const lookAwayMin = Math.round((a.focusSec?.lookingAway ?? 0) / 60);
  const fatigue = a.avgFatigue ?? 0;

  return {
    summaryText: `In this range, your posture score is ${postureScore}/100. The most common issue was ${topIssue}. You spent ${awayMin} min away and ${lookAwayMin} min looking away. Avg fatigue was ${fatigue}/100.`,
    insights: [
      postureScore < 60 ? "Your posture score is low—try raising screen height and sitting back in the chair." : "Your posture score is solid—keep the same workstation setup.",
      topIssue === "slouch" ? "Slouching dominates—add a lumbar support or roll a towel behind your lower back." : `Main issue is ${topIssue}—adjust chair/desk alignment and monitor position.`,
      awayMin > 10 ? "You had significant away time—enable focus mode to get instant distraction alerts." : "Away time is controlled—good focus consistency.",
    ],
    setupTips: [
      "Keep top of monitor at eye level.",
      "Feet flat on the ground; elbows ~90°.",
      "Use reminders: break, water, stretch.",
    ],
    exercises: [
      { name: "Neck reset", durationSec: 45, steps: ["Chin tuck gently", "Hold 5s", "Repeat 6–8 times"] },
      { name: "Shoulder rolls", durationSec: 30, steps: ["Roll shoulders back", "Slow circles", "Repeat 10 times"] },
    ],
    recommendedReminders: { breakMin: 50, waterMin: 90, stretchMin: 60 },
  };
}

export function fallbackCoach(payload: any) {
  const a = payload?.aggregates ?? {};
  const postureScore = a.postureScore ?? 0;
  const topIssue = a.topIssue ?? "slouch";

  return {
    insights: [
      postureScore < 70 ? `Quick fix: address ${topIssue} now for the next 5 minutes.` : "You're doing well—maintain this posture for the next block.",
    ],
    nudges: [
      { title: "Posture reset", message: "Sit tall, shoulders relaxed, chin slightly tucked. Re-check in 60 seconds.", cooldownMin: 5 },
      { title: "Eye break", message: "Look 20 feet away for 20 seconds (20–20–20 rule).", cooldownMin: 10 },
    ],
    exercises: [
      { name: "Chest opener", durationSec: 40, steps: ["Interlace fingers behind back", "Lift hands slightly", "Hold 20s, repeat"] },
    ],
    setupTips: ["Move monitor back an arm’s length.", "Keep wrists neutral on keyboard/mouse."],
    recommendedReminders: { breakMin: 50, waterMin: 90, stretchMin: 60 },
  };
}
