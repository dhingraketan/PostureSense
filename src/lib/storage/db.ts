import Dexie, { Table } from "dexie";
import type { Session, MinuteBucket, AppEvent, UserSettings } from "@/types/contracts";

type KVRow = { key: "settings"; value: UserSettings };

class PostureSenseDB extends Dexie {
  sessions!: Table<Session, string>;
  minuteBuckets!: Table<MinuteBucket, string>;
  events!: Table<AppEvent, string>;
  kv!: Table<KVRow, string>;

  constructor() {
    super("posture-sense-db");

    this.version(1).stores({
      sessions: "id, startTs, endTs",
      minuteBuckets: "id, sessionId, minuteTs, [sessionId+minuteTs]",
      events: "id, ts, sessionId, type",
      kv: "key",
    });
  }
}

export const db = new PostureSenseDB();
