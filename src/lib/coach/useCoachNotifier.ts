"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { MonitoringEngine, PostureState, CoachReminderPayload } from "@/types";

function titleFor(primary: PostureState) {
  switch (primary) {
    case "too_close":
      return "You’re too close to the screen";
    case "too_far":
      return "You’re too far from the screen";
    case "head_down":
      return "Head down detected";
    case "head_up":
      return "Head up detected";
    case "head_tilt_left":
    case "head_tilt_right":
      return "Head tilt detected";
    case "shoulders_unlevel":
      return "Uneven shoulders";
    case "shoulders_depth_misaligned":
      return "Shoulders rotated";
    case "body_lean_left":
    case "body_lean_right":
      return "Body leaning";
    case "back_not_straight":
      return "Back not straight";
    default:
      return "Posture reminder";
  }
}

function adviceFor(states: PostureState[]) {
  const tips: string[] = [];

  if (states.includes("too_close")) tips.push("Lean back ~1 arm’s length.");
  if (states.includes("too_far")) tips.push("Move a bit closer to the screen.");
  if (states.includes("head_down")) tips.push("Raise your screen / tuck chin slightly.");
  if (states.includes("head_up")) tips.push("Lower the screen so eyes look forward.");
  if (states.includes("head_tilt_left") || states.includes("head_tilt_right"))
    tips.push("Center your head (ears over shoulders).");
  if (states.includes("shoulders_unlevel")) tips.push("Relax shoulders and level them.");
  if (states.includes("shoulders_depth_misaligned")) tips.push("Square shoulders to the camera.");
  if (states.includes("body_lean_left") || states.includes("body_lean_right"))
    tips.push("Sit centered: feet flat, weight even.");
  if (states.includes("back_not_straight")) tips.push("Sit tall: chest up, shoulders back.");

  tips.push("Quick reset: roll shoulders + blink slowly.");

  return tips.slice(0, 2).join(" ");
}

export async function requestCoachNotificationPermission() {
  if (typeof window === "undefined") return "unsupported" as const;
  if (!("Notification" in window)) return "unsupported" as const;

  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;

  const p = await Notification.requestPermission();
  return p as "granted" | "denied" | "default";
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // On production this must be HTTPS for best support.
  new Notification(title, { body });
}

/**
 * Listen to engine.events; when a coach_reminder comes in,
 * show a Sonner toast + a browser notification.
 */
export function useCoachNotifier(engine: MonitoringEngine) {
  const lastHandledTsRef = useRef<number>(0);

  useEffect(() => {
    const e = engine.events?.[0];
    if (!e) return;

    if (e.type !== "coach_reminder") return;
    if (e.ts <= lastHandledTsRef.current) return;
    lastHandledTsRef.current = e.ts;

    const payload = e.payload as CoachReminderPayload;

    const title = titleFor(payload.primary);
    const body = adviceFor(payload.states);

    toast(title, {
      description: body,
      duration: 7000,
    });

    showBrowserNotification(title, body);
  }, [engine.events]);
}