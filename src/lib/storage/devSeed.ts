import type { MinuteBucket, Session, UserSettings } from "@/types/contracts";
import { db } from "./db";
import { uid, toMinuteTs } from "./repo";

export async function seedFakeData() {
  const settings: UserSettings = {
    sensitivity: "medium",
    focusMode: false,
    cameraEnabled: true,
    voiceEnabled: false,
    privacyMode: false,
    reminders: { breakMin: 50, waterMin: 90, stretchMin: 60 },
    distraction: { awayThresholdSec: 20, lookAwayThresholdSec: 10 },
  };

  const session: Session = { id: uid(), startTs: Date.now() - 60 * 60_000, settingsSnapshot: settings };
  await db.sessions.put(session);

  const start = toMinuteTs(session.startTs);
  for (let i = 0; i < 60; i++) {
    const t = start + i * 60_000;
    const good = Math.max(0, 60 - Math.floor(Math.random() * 25));
    const slouch = 60 - good;

    const b: MinuteBucket = {
      id: uid(),
      sessionId: session.id,
      minuteTs: t,
      postureSec: {
        good,
        slouch,
        lean_left: 0,
        lean_right: 0,
        too_close: 0,
        shoulder_imbalance: 0,
      },
      focusSec: {
        screenFacing: 55,
        lookingAway: 3,
        away: 2,
      },
      blinkCount: 12 + Math.floor(Math.random() * 8),
      fatigueAvg: 20 + Math.floor(Math.random() * 40),
      alertCount: slouch > 15 ? 1 : 0,
      reminderCount: { break: 0, water: 0, stretch: 0 },
    };
    await db.minuteBuckets.put(b);
  }
}
