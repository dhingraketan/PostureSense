export type PostureState =
  | "good"
  | "lean_left"
  | "lean_right"
  | "slouch"
  | "too_close"
  | "no_person"
  | "too_far"
  | "body_lean_left"
  | "body_lean_right"
  | "head_tilt_left"
  | "head_tilt_right"
  | "head_up"
  | "head_down"
  | "shoulders_unlevel"
  | "shoulders_depth_misaligned"
  | "back_not_straight";

export type PostureMetrics = {
  rollDeg: number;
  noseEyeDeltaY: number;
  shouldersYDiff: number;
  shouldersZDiff: number;
  forwardHead: boolean;
  bodyOffsetX: number;
  torsoFromVertical: number;
  faceArea: number | null;
  baseline: number | null;
};

export type PostureFlags = {
  headTiltLeft: boolean;
  headTiltRight: boolean;
  headDown: boolean;
  headUp: boolean;
  shouldersUneven: boolean;
  shouldersDepthMisaligned: boolean;
  forwardHead: boolean;
  slouch: boolean;
  isBodyLeaningLeft: boolean;
  isBodyLeaningRight: boolean;
  tooClose: boolean;
  tooFar: boolean;
};

export type CoachReminderPayload = {
  /** Snapshot of stabilized issues right now (multi) */
  states: PostureState[];
  /** A single primary issue for display */
  primary: PostureState;

  /** Window summary (rolling bucket) */
  windowMs: number;
  goodMs: number;
  badMs: number;

  /** Most time-spent bad state in the window */
  topBad?: PostureState;

  /** Optional diagnostic signals for better coaching */
  metrics?: PostureMetrics;
  flags?: PostureFlags;
};

export type MonitoringEvent =
  | {
      type: "posture_alert";
      ts: number;
      payload: {
        state: PostureState;
        score?: number;
        metrics?: PostureMetrics;
        flags?: PostureFlags;
      };
    }
  | {
      type: "coach_reminder";
      ts: number;
      payload: CoachReminderPayload;
    }
  | {
      type: "distance_alert";
      ts: number;
      payload: {
        distanceSignal: number;
        baseline: number;
        tooClose?: boolean;
        tooFar?: boolean;
      };
    }
  | { type: "person_lost"; ts: number; payload: {} };

export type MonitoringEngine = {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;

  isRunning: boolean;
  isPaused: boolean;

  currentPostureState: PostureState;
  distanceSignal: number | null;

  events: MonitoringEvent[];
  activeStates: PostureState[];
};