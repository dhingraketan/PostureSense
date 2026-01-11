import type { PostureState } from "@/types";

type Landmark = { x: number; y: number; z?: number; visibility?: number };

const IDX = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
} as const; // indices from MediaPipe pose mapping  [oai_citation:6‡Google AI for Developers](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function computeLeanState(pose: Landmark[]): { state: PostureState; tiltRad: number } {
  const ls = pose[IDX.LEFT_SHOULDER];
  const rs = pose[IDX.RIGHT_SHOULDER];
  if (!ls || !rs) return { state: "no_person", tiltRad: 0 };

  // shoulder line tilt: atan2(dy, dx)
  const tiltRad = Math.atan2(rs.y - ls.y, rs.x - ls.x);

  const THRESH = 0.12; // ~7 degrees (demo-friendly)
  if (tiltRad > THRESH) return { state: "lean_right", tiltRad };
  if (tiltRad < -THRESH) return { state: "lean_left", tiltRad };
  return { state: "good", tiltRad };
}

export function computeSlouch(pose: Landmark[]): { isSlouch: boolean; score: number } {
  const nose = pose[IDX.NOSE];
  const ls = pose[IDX.LEFT_SHOULDER];
  const rs = pose[IDX.RIGHT_SHOULDER];
  if (!nose || !ls || !rs) return { isSlouch: false, score: 0 };

  const shoulderMidY = (ls.y + rs.y) / 2;

  // nose should be noticeably ABOVE shoulders (smaller y).
  // If it drops closer, interpret as slouch.
  const headToShoulder = shoulderMidY - nose.y; // bigger is better posture
  const score = clamp01((0.18 - headToShoulder) / 0.18); // normalize slouch severity
  const isSlouch = headToShoulder < 0.18;

  return { isSlouch, score };
}

/**
 * Distance proxy from face landmarks:
 * Build a face "bounding box" from all landmarks.
 * Bigger area => face closer to camera.
 */
export function faceAreaSignal(face: Landmark[]): number {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of face) {
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  return w * h; // normalized area in [0..1]ish
}