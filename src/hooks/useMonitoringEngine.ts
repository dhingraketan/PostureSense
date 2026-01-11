"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitoringEngine, MonitoringEvent, PostureState } from "@/types";
import { createFaceLandmarker, createPoseLandmarker } from "@/lib/vision/mediapipe";
import { faceAreaSignal } from "@/lib/posture/heuristics";

type Options = {
  enableFace?: boolean;
  fpsCap?: number;
  drawDebug?: boolean;
  mirror?: boolean; // ✅ true if your preview is mirrored (selfie style)
};

// ---------- drawing helpers ----------
function drawLine(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
  w: number,
  h: number
) {
  if (!a || !b) return;
  ctx.beginPath();
  ctx.moveTo(a.x * w, a.y * h);
  ctx.lineTo(b.x * w, b.y * h);
  ctx.stroke();
}

function ensureCanvasMatchesVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  if (canvas.width !== vw) canvas.width = vw;
  if (canvas.height !== vh) canvas.height = vh;
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  xNorm: number,
  yNorm: number,
  w: number,
  h: number,
  r = 5
) {
  const x = xNorm * w;
  const y = yNorm * h;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
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
  const [distanceSignal, setDistanceSignal] = useState<number | null>(null);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);

  // Face-distance baseline
  const baselineFaceRef = useRef<number | null>(null);
  const baselineFaceSamplesRef = useRef<number[]>([]);

  // Pose baselines (no hips)
  const baselineShoulderXRef = useRef<number | null>(null);
  const baselineNeckYRef = useRef<number | null>(null);
  const baselinePoseSamplesRef = useRef<{ shoulderX: number; neckY: number }[]>([]);

  const lastAlertAtRef = useRef<number>(0);
  const lastStateChangeAtRef = useRef<number>(0);
  const stateRef = useRef<PostureState>("no_person");

  const didLogPoseOnceRef = useRef(false);
  const didLogFaceOnceRef = useRef(false);

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

    setDistanceSignal(null);
    setCurrentPostureState("no_person");
    stateRef.current = "no_person";

    didLogPoseOnceRef.current = false;
    didLogFaceOnceRef.current = false;

    clearOverlay();
  }, [clearOverlay]);

  const pause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
  }, []);

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
      if (stateRef.current !== "no_person") {
        stateRef.current = "no_person";
        setCurrentPostureState("no_person");
        emit({ type: "person_lost", ts: Date.now(), payload: {} });
      }
      if (drawDebug) clearOverlay();
      return;
    }

    // ✅ Mirror landmarks to match mirrored preview (screen-left/screen-right)
    const MIRROR = mirrorRef.current;
    const lm = (i: number): LM => {
      const p = raw[i];
      return MIRROR ? { ...p, x: 1 - p.x } : p;
    };

    // Key points (head + shoulders only)
    const nose = lm(0);
    const lEye = lm(2);
    const rEye = lm(5);
    const lEar = lm(7);
    const rEar = lm(8);
    const ls = lm(11);
    const rs = lm(12);

    // Soft visibility gate only on shoulders
    const visVals = [ls.visibility, rs.visibility].filter((v): v is number => typeof v === "number");
    const minVis = visVals.length ? Math.min(...visVals) : 1;
    if (minVis < 0.05) return;

    const shoulderMid = mid(ls, rs);
    const eyeMid = mid(lEye, rEye);
    const earMid = mid(lEar, rEar);

    // Head roll
    const rawRollDeg = angleDeg(lEar, rEar);
    const rollDeg = normalizeTo90(rawRollDeg);
    const headTiltLeft = rollDeg < -TH.headRollDeg;
    const headTiltRight = rollDeg > TH.headRollDeg;

    // Head up/down
    const noseEyeDeltaY = nose.y - eyeMid.y;
    const headDown = noseEyeDeltaY > TH.headPitchDown;
    const headUp = noseEyeDeltaY < TH.headPitchUp;

    // Shoulder alignment
    const shouldersUneven = absDiff(ls.y, rs.y) > TH.shouldersUnevenY;
    const shouldersDepthMisaligned = Math.abs((ls.z ?? 0) - (rs.z ?? 0)) > TH.shouldersDepthZ;

    // Back straight proxy (no hips)
    const shoulderZ = shoulderMid.z ?? 0;
    const noseZ = nose.z ?? 0;
    const forwardHead = (shoulderZ - noseZ) > TH.forwardHeadZ;

    const neckY = nose.y - shoulderMid.y;
    if (!baselineShoulderXRef.current || !baselineNeckYRef.current) {
      baselinePoseSamplesRef.current.push({ shoulderX: shoulderMid.x, neckY });
      if (baselinePoseSamplesRef.current.length >= 60) {
        const avgX =
          baselinePoseSamplesRef.current.reduce((a, s) => a + s.shoulderX, 0) /
          baselinePoseSamplesRef.current.length;
        const avgNeckY =
          baselinePoseSamplesRef.current.reduce((a, s) => a + s.neckY, 0) /
          baselinePoseSamplesRef.current.length;
        baselineShoulderXRef.current = avgX;
        baselineNeckYRef.current = avgNeckY;
      }
    }

    const neckBaseline = baselineNeckYRef.current;
    const slouchProxy =
      (neckBaseline != null && neckY < neckBaseline * TH.slouchNeckRatio) ||
      (neckBaseline == null && neckY < TH.slouchNeckHardMin);

    // Body lean L/R (screen-based because we mirrored landmarks)
    const baseX = baselineShoulderXRef.current;
    const bodyOffsetX = baseX != null ? shoulderMid.x - baseX : shoulderMid.x - 0.5;
    const isBodyLeaningLeft = bodyOffsetX < -TH.bodyLeanX;
    const isBodyLeaningRight = bodyOffsetX > TH.bodyLeanX;

    // Screen distance (face)
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

        if (!baselineFaceRef.current) {
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

    // Decide state
    let nextState: PostureState = "good";
    if (tooClose) nextState = "too_close";
    else if (tooFar) nextState = "too_far";
    else if (isBodyLeaningLeft) nextState = "body_lean_left";
    else if (isBodyLeaningRight) nextState = "body_lean_right";
    else if (headTiltLeft) nextState = "head_tilt_left";
    else if (headTiltRight) nextState = "head_tilt_right";
    else if (headDown) nextState = "head_down";
    else if (headUp) nextState = "head_up";
    else if (shouldersUneven) nextState = "shoulders_unlevel";
    else if (shouldersDepthMisaligned) nextState = "shoulders_depth_misaligned";
    
    if (nextState !== stateRef.current) {
      stateRef.current = nextState;
      lastStateChangeAtRef.current = now;
      setCurrentPostureState(nextState);
    }

    // Draw overlay (head + shoulders)
    if (drawDebug) {
      const canvas = canvasRef.current;
      if (canvas) {
        ensureCanvasMatchesVideo(video, canvas);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "rgba(0, 255, 0, 0.9)";
          ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
          ctx.lineWidth = 3;

          drawLine(ctx, ls, rs, canvas.width, canvas.height);
          drawLine(ctx, lEar, rEar, canvas.width, canvas.height);
          drawLine(ctx, lEye, rEye, canvas.width, canvas.height);
          drawLine(ctx, nose, shoulderMid, canvas.width, canvas.height);

          const pts = [nose, lEye, rEye, lEar, rEar, ls, rs, shoulderMid, earMid, eyeMid];
          for (const p of pts) drawPoint(ctx, p.x, p.y, canvas.width, canvas.height, p === nose ? 6 : 4);

          ctx.font = "16px sans-serif";
          ctx.fillText(`${nextState}`, 10, 20);
          ctx.fillText(`mirror:${MIRROR}`, 10, 40);
        }
      }
    }

    // Alerts
    const BAD: PostureState[] = [
      "too_close",
      "too_far",
      "body_lean_left",
      "body_lean_right",
      "head_tilt_left",
      "head_tilt_right",
      "head_down",
      "head_up",
      "shoulders_unlevel",
      "shoulders_depth_misaligned",
      "back_not_straight",
    ];

    const badPersistMs = 900;
    const cooldownMs = 3500;

    if (BAD.includes(stateRef.current)) {
      const persisted = now - lastStateChangeAtRef.current >= badPersistMs;
      const cooledDown = now - lastAlertAtRef.current >= cooldownMs;

      if (persisted && cooledDown) {
        lastAlertAtRef.current = now;

        emit({
          type: "posture_alert",
          ts: Date.now(),
          payload: {
            state: stateRef.current,
            metrics: {
              rollDeg,
              noseEyeDeltaY,
              shouldersYDiff: absDiff(ls.y, rs.y),
              shouldersZDiff: Math.abs((ls.z ?? 0) - (rs.z ?? 0)),
              forwardHead,
              bodyOffsetX,
              torsoFromVertical: bodyOffsetX,
              faceArea,
              baseline: baselineFaceRef.current,
            },
            flags: {
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
            },
          },
        });

        if ((tooClose || tooFar) && baselineFaceRef.current && faceArea != null) {
          emit({
            type: "distance_alert",
            ts: Date.now(),
            payload: { distanceSignal: faceArea, baseline: baselineFaceRef.current, tooClose, tooFar },
          });
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
    distanceSignal,
    events,
    videoRef,
    canvasRef,
  };
}