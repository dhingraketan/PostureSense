export type Sensitivity = "low" | "medium" | "high";

export type PostureState =
  | "good"
  | "slouch"
  | "lean_left"
  | "lean_right"
  | "too_close"
  | "shoulder_imbalance";

export type FocusState = "screen_facing" | "looking_away" | "away";

export type EventType =
  | "posture_alert"
  | "distraction_alert"
  | "break_reminder"
  | "water_reminder"
  | "stretch_reminder"
  | "gesture_action"
  | "user_ack"
  | "session_start"
  | "session_end";

export type AppEvent = {
  id: string;
  ts: number; // Date.now()
  sessionId?: string;
  type: EventType;
  payload?: Record<string, unknown>;
};

export type UserSettings = {
  sensitivity: Sensitivity;
  focusMode: boolean;
  cameraEnabled: boolean;
  voiceEnabled: boolean;
  privacyMode: boolean;

  reminders: {
    breakMin: number;
    waterMin: number;
    stretchMin: number;
  };

  distraction: {
    awayThresholdSec: number; // face missing > N seconds
    lookAwayThresholdSec: number; // looking away > N seconds
  };
};

export type MinuteBucket = {
  id: string;
  sessionId: string;
  minuteTs: number; // timestamp rounded to minute

  postureSec: Record<PostureState, number>;
  focusSec: {
    screenFacing: number;
    lookingAway: number;
    away: number;
  };

  blinkCount: number;
  fatigueAvg: number; // 0-100

  alertCount: number;
  reminderCount: {
    break: number;
    water: number;
    stretch: number;
  };
};

export type Session = {
  id: string;
  startTs: number;
  endTs?: number;
  settingsSnapshot: UserSettings;
};