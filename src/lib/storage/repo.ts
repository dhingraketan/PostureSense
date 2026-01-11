import { db } from "./db";
import type { AppEvent, MinuteBucket, Session, UserSettings } from "@/types/contracts";

/** Round timestamp down to the minute boundary */
export const toMinuteTs = (ts: number) => Math.floor(ts / 60000) * 60000;

/** Simple ID generator (good enough for hackathon) */
export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function saveSettings(settings: UserSettings) {
  await db.kv.put({ key: "settings", value: settings });
}

export async function loadSettings(): Promise<UserSettings | null> {
  const row = await db.kv.get("settings");
  return row?.value ?? null;
}

export async function startSession(settingsSnapshot: Session["settingsSnapshot"]) {
  const session: Session = {
    id: uid(),
    startTs: Date.now(),
    settingsSnapshot,
  };
  await db.sessions.put(session);

  const ev: AppEvent = {
    id: uid(),
    ts: Date.now(),
    sessionId: session.id,
    type: "session_start",
  };
  await db.events.put(ev);

  return session;
}

export async function endSession(sessionId: string) {
  const endTs = Date.now();
  await db.sessions.update(sessionId, { endTs });

  const ev: AppEvent = {
    id: uid(),
    ts: endTs,
    sessionId,
    type: "session_end",
  };
  await db.events.put(ev);
}

export async function putMinuteBucket(bucket: MinuteBucket) {
  const fixed: MinuteBucket = { ...bucket, minuteTs: toMinuteTs(bucket.minuteTs) };
  await db.minuteBuckets.put(fixed);
}

export async function logEvent(event: AppEvent) {
  await db.events.put(event);
}

/** Query sessions by date range */
export async function getSessionsInRange(startMs: number, endMs: number) {
  return db.sessions.where("startTs").between(startMs, endMs, true, true).toArray();
}

/** Query buckets by date range (optionally by sessionId) */
export async function getBucketsInRange(startMs: number, endMs: number, sessionId?: string) {
  const startMin = toMinuteTs(startMs);
  const endMin = toMinuteTs(endMs);

  if (sessionId) {
    return db.minuteBuckets
      .where("[sessionId+minuteTs]")
      .between([sessionId, startMin], [sessionId, endMin], true, true)
      .sortBy("minuteTs");
  }

  const all = await db.minuteBuckets.where("minuteTs").between(startMin, endMin, true, true).toArray();
  return all.sort((a, b) => a.minuteTs - b.minuteTs);
}

export async function getEventsInRange(startMs: number, endMs: number, sessionId?: string) {
  const evs = await db.events.where("ts").between(startMs, endMs, true, true).toArray();
  return sessionId ? evs.filter(e => e.sessionId === sessionId) : evs;
}

/** For Dashboard/Gemini: last N minutes (all sessions) */
export async function getLastNMinutesBuckets(nMinutes: number) {
  const end = Date.now();
  const start = end - nMinutes * 60_000;
  return getBucketsInRange(start, end);
}
