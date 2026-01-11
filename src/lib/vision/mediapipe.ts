import { FilesetResolver, PoseLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";

const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let visionPromise: Promise<any> | null = null;

async function getVisionFileset() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks(WASM_BASE);
  }
  return visionPromise;
}

export async function createPoseLandmarker() {
  const vision = await getVisionFileset();
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

export async function createFaceLandmarker() {
  const vision = await getVisionFileset();
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
}