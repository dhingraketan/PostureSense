"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitoringEngine, MonitoringEvent, PostureState } from "@/types";
import { createFaceLandmarker, createPoseLandmarker } from "@/lib/vision/mediapipe";
import { computeLeanState, computeSlouch, faceAreaSignal } from "@/lib/posture/heuristics";

type Options = {
    enableFace?: boolean;
    fpsCap?: number;
    drawDebug?: boolean; // draw landmarks overlay for debugging
};

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
    r = 6
) {
    const x = xNorm * w;
    const y = yNorm * h;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

export function useMonitoringEngine(
    opts: Options = {}
): MonitoringEngine & {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
} {
    const { enableFace = true, fpsCap = 30, drawDebug = true } = opts;

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const poseRef = useRef<Awaited<ReturnType<typeof createPoseLandmarker>> | null>(null);
    const faceRef = useRef<Awaited<ReturnType<typeof createFaceLandmarker>> | null>(null);

    const rafRef = useRef<number | null>(null);
    const lastFrameTsRef = useRef<number>(0);

    // IMPORTANT: refs that the RAF loop reads (avoid stale React state closures)
    const runningRef = useRef(false);
    const pausedRef = useRef(false);
    const fpsCapRef = useRef(fpsCap);
    const enableFaceRef = useRef(enableFace);

    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    const [currentPostureState, setCurrentPostureState] = useState<PostureState>("no_person");
    const [distanceSignal, setDistanceSignal] = useState<number | null>(null);
    const [events, setEvents] = useState<MonitoringEvent[]>([]);

    // For “too-close”: baseline learned in first ~2s
    const baselineRef = useRef<number | null>(null);
    const baselineSamplesRef = useRef<number[]>([]);
    const lastAlertAtRef = useRef<number>(0);
    const lastStateChangeAtRef = useRef<number>(0);
    const stateRef = useRef<PostureState>("no_person");

    // Debug logs
    const didLogPoseOnceRef = useRef(false);
    const didLogFaceOnceRef = useRef(false);

    // keep refs in sync if opts change
    useEffect(() => {
        fpsCapRef.current = fpsCap;
    }, [fpsCap]);

    useEffect(() => {
        enableFaceRef.current = enableFace;
    }, [enableFace]);

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

        baselineRef.current = null;
        baselineSamplesRef.current = [];
        setDistanceSignal(null);
        setCurrentPostureState("no_person");

        // reset debug flags
        didLogPoseOnceRef.current = false;
        didLogFaceOnceRef.current = false;

        clearOverlay();
    }, [clearOverlay]);

    const pause = useCallback(() => {
        pausedRef.current = !pausedRef.current;
        setIsPaused(pausedRef.current);
    }, []);

    const loop = useCallback(() => {
        rafRef.current = requestAnimationFrame(loop);

        if (!runningRef.current || pausedRef.current) return;

        const video = videoRef.current;
        const pose = poseRef.current;
        if (!video || !pose) return;

        // throttle FPS
        const now = performance.now();
        const cap = fpsCapRef.current;
        const minDelta = 1000 / cap;
        if (now - lastFrameTsRef.current < minDelta) return;
        lastFrameTsRef.current = now;

        // Detect pose
        const poseRes: any = pose.detectForVideo(video, now);

        // Some builds expose landmarks under different keys. Support both:
        const poseLandmarks =
            poseRes.landmarks?.[0] ??
            poseRes.poseLandmarks?.[0] ??
            poseRes.worldLandmarks?.[0] ??
            null;

        if (!poseLandmarks || poseLandmarks.length < 13) {
            if (stateRef.current !== "no_person") {
                stateRef.current = "no_person";
                setCurrentPostureState("no_person");
                emit({ type: "person_lost", ts: Date.now(), payload: {} });
            }
            if (drawDebug) clearOverlay();
            return;
        }

        // Debug: verify once
        if (!didLogPoseOnceRef.current) {
            didLogPoseOnceRef.current = true;
            console.log("[POSE] landmarks length:", poseLandmarks.length);
            console.log("[POSE] nose (0):", poseLandmarks[0]);
            console.log("[POSE] left shoulder (11):", poseLandmarks[11]);
            console.log("[POSE] right shoulder (12):", poseLandmarks[12]);
            console.log("[POSE] raw keys:", Object.keys(poseRes));
        }

        // Draw a minimal overlay so you can SEE it working immediately
        if (drawDebug) {
            const canvas = canvasRef.current;
            if (canvas) {
                ensureCanvasMatchesVideo(video, canvas);
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // styles
                    ctx.fillStyle = "rgba(0, 255, 0, 0.9)";
                    ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
                    ctx.lineWidth = 3;

                    // Common pose indices (MediaPipe Pose)
                    const nose = poseLandmarks[0];
                    const ls = poseLandmarks[11];
                    const rs = poseLandmarks[12];
                    const le = poseLandmarks[13];
                    const re = poseLandmarks[14];
                    const lw = poseLandmarks[15];
                    const rw = poseLandmarks[16];
                    const lh = poseLandmarks[23];
                    const rh = poseLandmarks[24];
                    const lk = poseLandmarks[25];
                    const rk = poseLandmarks[26];
                    const la = poseLandmarks[27];
                    const ra = poseLandmarks[28];

                    // Draw lines (skeleton connections)
                    // torso + head
                    drawLine(ctx, ls, rs, canvas.width, canvas.height);     // shoulders
                    drawLine(ctx, ls, lh, canvas.width, canvas.height);     // left shoulder -> left hip
                    drawLine(ctx, rs, rh, canvas.width, canvas.height);     // right shoulder -> right hip
                    drawLine(ctx, lh, rh, canvas.width, canvas.height);     // hips
                    drawLine(ctx, nose, ls, canvas.width, canvas.height);   // nose -> left shoulder
                    drawLine(ctx, nose, rs, canvas.width, canvas.height);   // nose -> right shoulder

                    // arms
                    drawLine(ctx, ls, le, canvas.width, canvas.height);
                    drawLine(ctx, le, lw, canvas.width, canvas.height);
                    drawLine(ctx, rs, re, canvas.width, canvas.height);
                    drawLine(ctx, re, rw, canvas.width, canvas.height);

                    // legs
                    drawLine(ctx, lh, lk, canvas.width, canvas.height);
                    drawLine(ctx, lk, la, canvas.width, canvas.height);
                    drawLine(ctx, rh, rk, canvas.width, canvas.height);
                    drawLine(ctx, rk, ra, canvas.width, canvas.height);

                    // Draw key points on top
                    const pts = [nose, ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra];
                    for (const p of pts) {
                        if (!p) continue;
                        drawPoint(ctx, p.x, p.y, canvas.width, canvas.height, 5);
                    }
                }
            }
        }

        // 1) Lean
        const lean = computeLeanState(poseLandmarks);

        // 2) Slouch
        const slouch = computeSlouch(poseLandmarks);

        // 3) Optional Face signals
        let tooClose = false;
        let faceArea: number | null = null;

        if (enableFaceRef.current && faceRef.current) {
            const faceRes = faceRef.current.detectForVideo(video, now);
            const faceLandmarks = faceRes.faceLandmarks?.[0];

            if (faceLandmarks?.length) {
                faceArea = faceAreaSignal(faceLandmarks);
                setDistanceSignal(faceArea);

                if (!didLogFaceOnceRef.current) {
                    didLogFaceOnceRef.current = true;
                    console.log("[FACE] landmarks length:", faceLandmarks.length);
                    console.log("[FACE] faceAreaSignal:", faceArea);
                }

                // baseline from first ~60 frames
                if (!baselineRef.current) {
                    baselineSamplesRef.current.push(faceArea);
                    if (baselineSamplesRef.current.length >= 60) {
                        const avg =
                            baselineSamplesRef.current.reduce((a, b) => a + b, 0) /
                            baselineSamplesRef.current.length;
                        baselineRef.current = avg;
                        console.log("[FACE] baseline set:", baselineRef.current);
                    }
                } else {
                    const baseline = baselineRef.current;
                    tooClose = faceArea > baseline * 1.35;
                }
            }
        }

        // Decide final posture state (priority order)
        let nextState: PostureState = "good";
        if (tooClose) nextState = "too_close";
        else if (slouch.isSlouch) nextState = "slouch";
        else if (lean.state !== "good") nextState = lean.state;

        // State change tracking
        if (nextState !== stateRef.current) {
            stateRef.current = nextState;
            lastStateChangeAtRef.current = now;
            setCurrentPostureState(nextState);
            console.log("[STATE] ->", nextState);
        }

        // Alert policy: only alert if "bad" state persists, with cooldown
        const BAD: PostureState[] = ["lean_left", "lean_right", "slouch", "too_close"];
        const badPersistMs = 1200;
        const cooldownMs = 5000;

        if (BAD.includes(stateRef.current)) {
            const persisted = now - lastStateChangeAtRef.current >= badPersistMs;
            const cooledDown = now - lastAlertAtRef.current >= cooldownMs;

            if (persisted && cooledDown) {
                lastAlertAtRef.current = now;

                emit({
                    type: "posture_alert",
                    ts: Date.now(),
                    payload: { state: stateRef.current, score: slouch.score },
                });

                if (stateRef.current === "too_close" && baselineRef.current && faceArea != null) {
                    emit({
                        type: "distance_alert",
                        ts: Date.now(),
                        payload: { distanceSignal: faceArea, baseline: baselineRef.current },
                    });
                }
            }
        }
    }, [clearOverlay, drawDebug, emit]);

    const start = useCallback(async () => {
        if (runningRef.current) return;

        const video = videoRef.current;
        if (!video) throw new Error("videoRef not attached");

        // Camera
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
        });

        streamRef.current = stream;
        video.srcObject = stream;

        // Recommended attributes for iOS / Safari stability
        video.playsInline = true;
        video.muted = true;

        await video.play();

        // Load models
        poseRef.current = await createPoseLandmarker();
        if (enableFaceRef.current) faceRef.current = await createFaceLandmarker();

        // Start loop
        runningRef.current = true;
        pausedRef.current = false;
        setIsRunning(true);
        setIsPaused(false);
        lastFrameTsRef.current = 0;

        // reset debug flags each start
        didLogPoseOnceRef.current = false;
        didLogFaceOnceRef.current = false;

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