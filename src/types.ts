export type PostureState =
  | "good"
  | "lean_left"
  | "lean_right"
  | "slouch"
  | "too_close"
  | "no_person";

export type MonitoringEvent =
  | { type: "posture_alert"; ts: number; payload: { state: PostureState; score?: number } }
  | { type: "distance_alert"; ts: number; payload: { distanceSignal: number; baseline: number } }
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
};