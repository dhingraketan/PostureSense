"use client";

import { useMonitoringEngine } from "@/hooks/useMonitoringEngine";

export default function MonitorPage() {
  const engine = useMonitoringEngine({ enableFace: true, drawDebug: true });

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded bg-black text-white" onClick={engine.start}>
          Start
        </button>
        <button className="px-3 py-2 rounded border" onClick={engine.pause}>
          Pause
        </button>
        <button className="px-3 py-2 rounded border" onClick={engine.stop}>
          Stop
        </button>
      </div>

      <div className="text-sm">
        <div>
          State: <b>{engine.currentPostureState}</b>
        </div>
        <div>
          DistanceSignal: <b>{engine.distanceSignal?.toFixed(4) ?? "—"}</b>
        </div>
      </div>

      {/* ✅ Put the overlay block RIGHT HERE */}
      <div className="relative w-full max-w-3xl">
        <video ref={engine.videoRef} className="w-full rounded border" playsInline />
        <canvas
          ref={engine.canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>
    </div>
  );
}