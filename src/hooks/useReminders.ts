"use client";

import { useEffect, useState } from "react";
import type { UserSettings, AppEvent } from "@/types/contracts";
import { defaultReminderState, shouldTrigger, markDone, snoozeMinutes, eventForReminder, notify, speak, type ReminderType } from "@/lib/reminders/engine";

export function useReminders(args: {
  settings: UserSettings;
  sessionId?: string;
  enabled: boolean;
  voiceEnabled: boolean;
  onEvent: (e: AppEvent) => void;
}) {
  const { settings, sessionId, enabled, onEvent, voiceEnabled } = args;
  const [state, setState] = useState(defaultReminderState());

  useEffect(() => {
    if (!enabled) return;

    const t = window.setInterval(async () => {
      (["break", "water", "stretch"] as ReminderType[]).forEach(async (type) => {
        if (!shouldTrigger(type, settings, state)) return;

        const ev = eventForReminder(sessionId, type);
        onEvent(ev);

        const title =
          type === "break" ? "Break time" :
          type === "water" ? "Hydration reminder" :
          "Stretch reminder";

        const msg =
          type === "break" ? "Stand up, rest your eyes, and take a short break." :
          type === "water" ? "Time to drink some water." :
          "Do a quick stretch for your neck and shoulders.";

        await notify(title, msg);
        if (voiceEnabled) speak(msg);

        setState((s) => markDone(type, s));
      });
    }, 5000);

    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, settings, sessionId, state, voiceEnabled]);

  return {
    snooze10: () => setState((s) => snoozeMinutes(s, 10)),
    markBreakDone: () => setState((s) => markDone("break", s)),
    markWaterDone: () => setState((s) => markDone("water", s)),
    markStretchDone: () => setState((s) => markDone("stretch", s)),
  };
}
