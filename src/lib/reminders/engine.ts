import type { UserSettings, AppEvent } from "@/types/contracts";
import { uid } from "@/lib/storage/repo";

export type ReminderType = "break" | "water" | "stretch";

export type PomodoroConfig = {
  focusMin: number;
  breakMin: number;
};

export type ReminderState = {
  lastBreakTs: number;
  lastWaterTs: number;
  lastStretchTs: number;
  snoozeUntilTs?: number;
};

export function defaultReminderState(): ReminderState {
  const now = Date.now();
  return { lastBreakTs: now, lastWaterTs: now, lastStretchTs: now };
}

export function shouldTrigger(type: ReminderType, settings: UserSettings, state: ReminderState) {
  const now = Date.now();
  if (state.snoozeUntilTs && now < state.snoozeUntilTs) return false;

  const mins =
    type === "break" ? settings.reminders.breakMin :
    type === "water" ? settings.reminders.waterMin :
    settings.reminders.stretchMin;

  const last =
    type === "break" ? state.lastBreakTs :
    type === "water" ? state.lastWaterTs :
    state.lastStretchTs;

  return now - last >= mins * 60_000;
}

export function markDone(type: ReminderType, state: ReminderState) {
  const now = Date.now();
  if (type === "break") return { ...state, lastBreakTs: now };
  if (type === "water") return { ...state, lastWaterTs: now };
  return { ...state, lastStretchTs: now };
}

export function snoozeMinutes(state: ReminderState, minutes: number) {
  return { ...state, snoozeUntilTs: Date.now() + minutes * 60_000 };
}

export function eventForReminder(sessionId: string | undefined, type: ReminderType): AppEvent {
  const map = {
    break: "break_reminder",
    water: "water_reminder",
    stretch: "stretch_reminder",
  } as const;

  return {
    id: uid(),
    ts: Date.now(),
    sessionId,
    type: map[type],
  };
}

export function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(u);
}

export async function notify(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
