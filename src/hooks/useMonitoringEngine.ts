"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MonitoringEngine,
  MonitoringEvent,
  PostureState,
  PostureMetrics,
  PostureFlags,
} from "@/types";
import { createFaceLandmarker, createPoseLandmarker } from "@/lib/vision/mediapipe";
import { faceAreaSignal } from "@/lib/posture/heuristics";

type Options = {
  enableFace?: boolean;
  fpsCap?: number;
  drawDebug?: boolean;
  mirror?: boolean; // true if preview is mirrored (selfie style)
};

// ---------- drawing helpers ----------
function drawLine(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
  w: number,
  h: number,
  thickness = 6
) {
  if (!a || !b) return;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 1)";
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(a.x * w, a.y * h);
  ctx.lineTo(b.x * w, b.y * h);
  ctx.stroke();
  ctx.restore();
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  xNorm: number,
  yNorm: number,
  w: number,
  h: number,
  r = 6
) {
  const x = xNorm * w;
  const y = yNorm * h;

  ctx.save();

  // white outline
  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 255, 255, 1)";
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fill();

  // purple fill
  ctx.beginPath();
  ctx.fillStyle = "rgba(168, 85, 247, 1)";
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function ensureCanvasMatchesVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  if (canvas.width !== vw) canvas.width = vw;
  if (canvas.height !== vh) canvas.height = vh;
}

// ---------- math helpers ----------
type LM = { x: number; y: number; z?: number; visibility?: number };

const rad2deg = (r: number) => (r * 180) / Math.PI;

function mid(a: LM, b: LM): LM {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z != null && b.z != null ? (a.z + b.z) / 2 : undefined,
  };
}

function angleDeg(a: LM, b: LM) {
  return rad2deg(Math.atan2(b.y - a.y, b.x - a.x));
}

function absDiff(a: number, b: number) {
  return Math.abs(a - b);
}

function normalizeTo90(angle: number) {
  let a = ((angle + 180) % 360) - 180; // (-180, 180]
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function arraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const isBadState = (s: PostureState) => s !== "good" && s !== "no_person";

// ---------- main hook ----------
export function useMonitoringEngine(
  opts: Options = {}
): MonitoringEngine & {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
} {
  const { enableFace = true, fpsCap = 30, drawDebug = true, mirror = true } = opts;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<Awaited<ReturnType<typeof createPoseLandmarker>> | null>(null);
  const faceRef = useRef<Awaited<ReturnType<typeof createFaceLandmarker>> | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);

  // RAF reads refs (avoid stale closures)
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const fpsCapRef = useRef(fpsCap);
  const enableFaceRef = useRef(enableFace);
  const mirrorRef = useRef(mirror);

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [currentPostureState, setCurrentPostureState] = useState<PostureState>("no_person");
  const [activeStates, setActiveStates] = useState<PostureState[]>([]);
  const [distanceSignal, setDistanceSignal] = useState<number | null>(null);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);

  // Face-distance baseline
  const baselineFaceRef = useRef<number | null>(null);
  const baselineFaceSamplesRef = useRef<number[]>([]);

  // Pose baselines (no hips)
  const baselineShoulderXRef = useRef<number | null>(null);
  const baselineNeckYRef = useRef<number | null>(null);
  const baselinePoseSamplesRef = useRef<{ shoulderX: number; neckY: number }[]>([]);

  // Stable issue tracking
  type Issue = Exclude<PostureState, "good" | "no_person">;
  const ISSUE_ORDER: Issue[] = [
    "too_close",
    "too_far",
    "head_down",
    "head_up",
    "head_tilt_left",
    "head_tilt_right",
    "shoulders_unlevel",
    "shoulders_depth_misaligned",
    "body_lean_left",
    "body_lean_right",
    "back_not_straight",
    "slouch",
    "lean_left",
    "lean_right",
  ];

  const issueMapRef = useRef<Map<Issue, { since: number | null; lastSeen: number; active: boolean }>>(
    new Map()
  );

  const lastPrimaryChangeAtRef = useRef<number>(0);
  const primaryRef = useRef<PostureState>("no_person");

  const didLogPoseOnceRef = useRef(false);
  const didLogFaceOnceRef = useRef(false);

  // ---------------- Coach layer refs ----------------
  const coach = {
    windowMs: 120_000, // 2 minutes
    badDominanceMs: 90_000, // bad for >= 90s within the 2-min bucket -> remind at bucket end
    continuousBadMs: 120_000, // same issue continuously for 2 min -> immediate remind
    cooldownMs: 360_000, // 6 minutes no spam
  };

  const coachLastTickRef = useRef<number | null>(null);

  const coachWindowStartRef = useRef<number | null>(null);
  const coachGoodMsRef = useRef<number>(0);
  const coachBadMsRef = useRef<number>(0);
  const coachStateMsRef = useRef<Map<PostureState, number>>(new Map());

  const coachContinuousMsRef = useRef<Map<PostureState, number>>(new Map());
  const coachLastReminderAtRef = useRef<number>(0);

  useEffect(() => {
    fpsCapRef.current = fpsCap;
  }, [fpsCap]);

  useEffect(() => {
    enableFaceRef.current = enableFace;
  }, [enableFace]);

  useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);

  const emit = useCallback((e: MonitoringEvent) => {
    setEvents((prev) => [e, ...prev].slice(0, 200));
  }, []);

  const clearOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    pausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    poseRef.current?.close();
    faceRef.current?.close();
    poseRef.current = null;
    faceRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    baselineFaceRef.current = null;
    baselineFaceSamplesRef.current = [];
    baselineShoulderXRef.current = null;
    baselineNeckYRef.current = null;
    baselinePoseSamplesRef.current = [];

    issueMapRef.current.clear();
    setActiveStates([]);

    setDistanceSignal(null);
    setCurrentPostureState("no_person");
    primaryRef.current = "no_person";

    didLogPoseOnceRef.current = false;
    didLogFaceOnceRef.current = false;

    // coach reset
    coachLastTickRef.current = null;
    coachWindowStartRef.current = null;
    coachGoodMsRef.current = 0;
    coachBadMsRef.current = 0;
    coachStateMsRef.current.clear();
    coachContinuousMsRef.current.clear();
    coachLastReminderAtRef.current = 0;

    clearOverlay();
  }, [clearOverlay]);

  const pause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
  }, []);

  // thresholds
  const TH = {
    headRollDeg: 12,
    headPitchDown: 0.060,
    headPitchUp: 0.030,
    shouldersUnevenY: 0.030,
    shouldersDepthZ: 0.14,
    forwardHeadZ: 0.18,
    bodyLeanX: 0.050,
    slouchNeckRatio: 0.75,
    slouchNeckHardMin: 0.12,
    tooCloseMul: 1.35,
    tooFarMul: 0.75,
  };

  // stability filter params
  const STABLE = {
    persistMs: 450, // must remain true this long to become active
    clearMs: 650, // must remain false this long to clear
  };

  function updateStableIssues(now: number, candidates: Issue[]) {
    const map = issueMapRef.current;
    const cand = new Set<Issue>(candidates);

    for (const issue of ISSUE_ORDER) {
      const prev = map.get(issue) ?? { since: null as number | null, lastSeen: 0, active: false };

      if (cand.has(issue)) {
        if (prev.since == null) prev.since = now;
        prev.lastSeen = now;

        if (!prev.active && now - prev.since >= STABLE.persistMs) {
          prev.active = true;
        }
      } else {
        if (prev.active) {
          if (now - prev.lastSeen >= STABLE.clearMs) {
            prev.active = false;
            prev.since = null;
          }
        } else {
          prev.since = null;
        }
      }

      map.set(issue, prev);
    }

    return ISSUE_ORDER.filter((i) => map.get(i)?.active) as PostureState[];
  }

  function pickPrimary(actives: PostureState[]): PostureState {
    for (const p of ISSUE_ORDER) if (actives.includes(p)) return p;
    return "good";
  }

  function coachTick(
    now: number,
    actives: PostureState[],
    primary: PostureState,
    metrics: PostureMetrics,
    flags: PostureFlags
  ) {
    // Don’t coach if no person
    if (primary === "no_person") return;

    // initialize tick
    if (coachLastTickRef.current == null) {
      coachLastTickRef.current = now;
      coachWindowStartRef.current = now;
      return;
    }

    const dt = Math.max(0, now - coachLastTickRef.current);
    coachLastTickRef.current = now;

    // init window
    if (coachWindowStartRef.current == null) coachWindowStartRef.current = now;

    // update good/bad window accumulation
    const badNow = actives.some(isBadState);
    if (badNow) coachBadMsRef.current += dt;
    else coachGoodMsRef.current += dt;

    // per-state time (only count active issues; if none -> count "good")
    if (actives.length === 0) {
      coachStateMsRef.current.set("good", (coachStateMsRef.current.get("good") ?? 0) + dt);
    } else {
      for (const s of actives) {
        coachStateMsRef.current.set(s, (coachStateMsRef.current.get(s) ?? 0) + dt);
      }
    }

    // continuous tracking: add dt to each active, reset inactive
    const cont = coachContinuousMsRef.current;
    const activeSet = new Set(actives.length ? actives : (["good"] as PostureState[]));

    // keep map small (just things we care about)
    const keys = new Set<PostureState>([...cont.keys(), ...activeSet]);
    keys.forEach((k) => {
      const prev = cont.get(k) ?? 0;
      if (activeSet.has(k)) cont.set(k, prev + dt);
      else cont.set(k, 0);
    });

    const cooledDown = now - coachLastReminderAtRef.current >= coach.cooldownMs;

    // Immediate reminder: a BAD state continuously for 2 min
    if (cooledDown) {
      for (const s of actives) {
        if (isBadState(s) && (cont.get(s) ?? 0) >= coach.continuousBadMs) {
          coachLastReminderAtRef.current = now;
          emit({
            type: "coach_reminder",
            ts: Date.now(),
            payload: {
              states: actives,
              primary,
              windowMs: coach.windowMs,
              goodMs: coachGoodMsRef.current,
              badMs: coachBadMsRef.current,
              topBad: s,
              metrics,
              flags,
            },
          });
          // reset continuous for that state so it won't fire again immediately
          cont.set(s, 0);
          return;
        }
      }
    }

    // Window-end reminder: bad dominated last 2 minutes
    const windowStart = coachWindowStartRef.current;
    const elapsed = windowStart ? now - windowStart : 0;

    if (elapsed >= coach.windowMs) {
      // choose top bad in window
      let topBad: PostureState | undefined = undefined;
      let topMs = 0;
      for (const [k, ms] of coachStateMsRef.current.entries()) {
        if (isBadState(k) && ms > topMs) {
          topMs = ms;
          topBad = k;
        }
      }

      if (cooledDown && coachBadMsRef.current >= coach.badDominanceMs) {
        coachLastReminderAtRef.current = now;
        emit({
          type: "coach_reminder",
          ts: Date.now(),
          payload: {
            states: actives.length ? actives : ["good"],
            primary: actives.length ? primary : "good",
            windowMs: coach.windowMs,
            goodMs: coachGoodMsRef.current,
            badMs: coachBadMsRef.current,
            topBad,
            metrics,
            flags,
          },
        });
      }

      // reset window
      coachWindowStartRef.current = now;
      coachGoodMsRef.current = 0;
      coachBadMsRef.current = 0;
      coachStateMsRef.current.clear();
    }
  }

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    if (!runningRef.current || pausedRef.current) return;

    const video = videoRef.current;
    const pose = poseRef.current;
    if (!video || !pose) return;

    const now = performance.now();
    const cap = fpsCapRef.current;
    const minDelta = 1000 / cap;
    if (now - lastFrameTsRef.current < minDelta) return;
    lastFrameTsRef.current = now;

    const poseRes: any = pose.detectForVideo(video, now);
    const raw: LM[] | null =
      poseRes.landmarks?.[0] ??
      poseRes.poseLandmarks?.[0] ??
      poseRes.worldLandmarks?.[0] ??
      null;

    if (!raw || raw.length < 13) {
      if (primaryRef.current !== "no_person") {
        primaryRef.current = "no_person";
        setCurrentPostureState("no_person");
        setActiveStates([]);
        emit({ type: "person_lost", ts: Date.now(), payload: {} });
      }
      if (drawDebug) clearOverlay();
      return;
    }

    const MIRROR = mirrorRef.current;
    const lm = (i: number): LM => {
      const p = raw[i];
      return MIRROR ? { ...p, x: 1 - p.x } : p;
    };

    // key points
    const nose = lm(0);
    const lEye = lm(2);
    const rEye = lm(5);
    const lEar = lm(7);
    const rEar = lm(8);
    const ls = lm(11);
    const rs = lm(12);

    // visibility gate only on shoulders
    const visVals = [ls.visibility, rs.visibility].filter((v): v is number => typeof v === "number");
    const minVis = visVals.length ? Math.min(...visVals) : 1;
    if (minVis < 0.05) return;

    const shoulderMid = mid(ls, rs);
    const eyeMid = mid(lEye, rEye);
    const earMid = mid(lEar, rEar);

    // --- head roll ---
    const rollDeg = normalizeTo90(angleDeg(lEar, rEar));
    const headTiltLeft = rollDeg < -TH.headRollDeg;
    const headTiltRight = rollDeg > TH.headRollDeg;

    // --- head up/down ---
    const noseEyeDeltaY = nose.y - eyeMid.y;
    const headDown = noseEyeDeltaY > TH.headPitchDown;
    const headUp = noseEyeDeltaY < TH.headPitchUp;

    // --- shoulders ---
    const shouldersUneven = absDiff(ls.y, rs.y) > TH.shouldersUnevenY;
    const shouldersDepthMisaligned = Math.abs((ls.z ?? 0) - (rs.z ?? 0)) > TH.shouldersDepthZ;

    // --- forward head / slouch proxy (no hips) ---
    const shoulderZ = shoulderMid.z ?? 0;
    const noseZ = nose.z ?? 0;
    const forwardHead = (shoulderZ - noseZ) > TH.forwardHeadZ;

    const neckY = nose.y - shoulderMid.y;

    if (baselineShoulderXRef.current == null || baselineNeckYRef.current == null) {
      baselinePoseSamplesRef.current.push({ shoulderX: shoulderMid.x, neckY });
      if (baselinePoseSamplesRef.current.length >= 60) {
        baselineShoulderXRef.current =
          baselinePoseSamplesRef.current.reduce((a, s) => a + s.shoulderX, 0) /
          baselinePoseSamplesRef.current.length;
        baselineNeckYRef.current =
          baselinePoseSamplesRef.current.reduce((a, s) => a + s.neckY, 0) /
          baselinePoseSamplesRef.current.length;
      }
    }

    const neckBaseline = baselineNeckYRef.current;
    const slouchProxy =
      (neckBaseline != null && neckY < neckBaseline * TH.slouchNeckRatio) ||
      (neckBaseline == null && neckY < TH.slouchNeckHardMin);

    // --- body lean left/right (screen-based) ---
    const baseX = baselineShoulderXRef.current;
    const bodyOffsetX = baseX != null ? shoulderMid.x - baseX : shoulderMid.x - 0.5;
    const isBodyLeaningLeft = bodyOffsetX < -TH.bodyLeanX;
    const isBodyLeaningRight = bodyOffsetX > TH.bodyLeanX;

    // --- distance (face) ---
    let tooClose = false;
    let tooFar = false;
    let faceArea: number | null = null;

    if (enableFaceRef.current && faceRef.current) {
      const faceRes: any = faceRef.current.detectForVideo(video, now);
      const faceLandmarks = faceRes.faceLandmarks?.[0];
      if (faceLandmarks?.length) {
        faceArea = faceAreaSignal(faceLandmarks);
        setDistanceSignal(faceArea);

        if (!didLogFaceOnceRef.current) {
          didLogFaceOnceRef.current = true;
          console.log("[FACE] landmarks length:", faceLandmarks.length);
          console.log("[FACE] faceAreaSignal:", faceArea);
        }

        if (baselineFaceRef.current == null) {
          baselineFaceSamplesRef.current.push(faceArea);
          if (baselineFaceSamplesRef.current.length >= 60) {
            baselineFaceRef.current =
              baselineFaceSamplesRef.current.reduce((a, b) => a + b, 0) /
              baselineFaceSamplesRef.current.length;
          }
        } else {
          const baseline = baselineFaceRef.current;
          tooClose = faceArea > baseline * TH.tooCloseMul;
          tooFar = faceArea < baseline * TH.tooFarMul;
        }
      }
    }

    if (!didLogPoseOnceRef.current) {
      didLogPoseOnceRef.current = true;
      console.log("[POSE] rollDeg:", rollDeg.toFixed(2), "noseEyeDeltaY:", noseEyeDeltaY.toFixed(3));
      console.log("[POSE] mirror:", MIRROR);
    }

    // ----- collect ALL candidate issues -----
    type Issue = Exclude<PostureState, "good" | "no_person">;
    const candidates: Issue[] = [];

    if (tooClose) candidates.push("too_close");
    if (tooFar) candidates.push("too_far");

    if (headDown) candidates.push("head_down");
    if (headUp) candidates.push("head_up");
    if (headTiltLeft) candidates.push("head_tilt_left");
    if (headTiltRight) candidates.push("head_tilt_right");

    if (shouldersUneven) candidates.push("shoulders_unlevel");
    if (shouldersDepthMisaligned) candidates.push("shoulders_depth_misaligned");

    if (isBodyLeaningLeft) candidates.push("body_lean_left");
    if (isBodyLeaningRight) candidates.push("body_lean_right");

    // Optional: treat slouchProxy as back_not_straight/slouch
    // ----- stabilize -----
    const newActives = updateStableIssues(now, candidates);

    setActiveStates((prev) =>
      arraysEqual(prev as any, newActives as any) ? prev : (newActives as PostureState[])
    );

    const primary = newActives.length ? pickPrimary(newActives) : "good";

    if (primary !== primaryRef.current) {
      primaryRef.current = primary;
      lastPrimaryChangeAtRef.current = now;
      setCurrentPostureState(primary);
    }

    // ----- metrics/flags (for events + coaching) -----
    const metrics: PostureMetrics = {
      rollDeg,
      noseEyeDeltaY,
      shouldersYDiff: absDiff(ls.y, rs.y),
      shouldersZDiff: Math.abs((ls.z ?? 0) - (rs.z ?? 0)),
      forwardHead,
      bodyOffsetX,
      torsoFromVertical: bodyOffsetX,
      faceArea,
      baseline: baselineFaceRef.current,
    };

    const flags: PostureFlags = {
      headTiltLeft,
      headTiltRight,
      headDown,
      headUp,
      shouldersUneven,
      shouldersDepthMisaligned,
      forwardHead,
      slouch: slouchProxy,
      isBodyLeaningLeft,
      isBodyLeaningRight,
      tooClose,
      tooFar,
    };

    // ✅ Coach layer (2-min reminders, no spam)
    coachTick(now, newActives, primary, metrics, flags);

    // ----- Draw overlay -----
    if (drawDebug) {
      const canvas = canvasRef.current;
      if (canvas) {
        ensureCanvasMatchesVideo(video, canvas);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          drawLine(ctx, ls, rs, canvas.width, canvas.height);
          drawLine(ctx, lEar, rEar, canvas.width, canvas.height);
          drawLine(ctx, lEye, rEye, canvas.width, canvas.height);
          drawLine(ctx, nose, shoulderMid, canvas.width, canvas.height);

          const pts = [nose, lEye, rEye, lEar, rEar, ls, rs, shoulderMid, earMid, eyeMid];
          for (const p of pts) drawPoint(ctx, p.x, p.y, canvas.width, canvas.height, p === nose ? 7 : 6);

          ctx.save();
          ctx.fillStyle = "rgba(255,255,255,1)";
          ctx.font = "16px sans-serif";
          ctx.fillText(`Primary: ${primary}`, 10, 22);
          ctx.fillText(`Active: ${newActives.length ? newActives.join(", ") : "none"}`, 10, 44);
          ctx.restore();
        }
      }
    }
  }, [clearOverlay, drawDebug, emit]);

  const start = useCallback(async () => {
    if (runningRef.current) return;

    const video = videoRef.current;
    if (!video) throw new Error("videoRef not attached");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    streamRef.current = stream;
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;

    await video.play();

    poseRef.current = await createPoseLandmarker();
    if (enableFaceRef.current) faceRef.current = await createFaceLandmarker();

    runningRef.current = true;
    pausedRef.current = false;
    setIsRunning(true);
    setIsPaused(false);

    lastFrameTsRef.current = 0;

    didLogPoseOnceRef.current = false;
    didLogFaceOnceRef.current = false;

    baselineFaceRef.current = null;
    baselineFaceSamplesRef.current = [];
    baselineShoulderXRef.current = null;
    baselineNeckYRef.current = null;
    baselinePoseSamplesRef.current = [];

    issueMapRef.current.clear();
    setActiveStates([]);
    primaryRef.current = "good";
    setCurrentPostureState("good");

    // coach reset (per run)
    coachLastTickRef.current = null;
    coachWindowStartRef.current = null;
    coachGoodMsRef.current = 0;
    coachBadMsRef.current = 0;
    coachStateMsRef.current.clear();
    coachContinuousMsRef.current.clear();
    coachLastReminderAtRef.current = 0;

    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => stop, [stop]);

  return {
    start,
    stop,
    pause,
    isRunning,
    isPaused,
    currentPostureState,
    activeStates,
    distanceSignal,
    events,
    videoRef,
    canvasRef,
  };
}