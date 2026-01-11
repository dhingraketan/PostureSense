"use client";

import { useMonitoringEngine } from "@/hooks/useMonitoringEngine";
import { useCoachNotifier, requestCoachNotificationPermission } from "@/lib/coach/useCoachNotifier";

export default function MonitorPage() {
  const engine = useMonitoringEngine({ drawDebug: true, mirror: true, enableFace: true });

  useCoachNotifier(engine);

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded bg-black text-white" onClick={() => engine.start()}>
          Start
        </button>
        <button className="px-3 py-2 rounded border" onClick={() => engine.stop()}>
          Stop
        </button>
        <button
          className="px-3 py-2 rounded border"
          onClick={async () => {
            await requestCoachNotificationPermission();
          }}
        >
          Enable Notifications
        </button>
      </div>

      <div className="relative w-full max-w-3xl">
        <video ref={engine.videoRef} className="w-full rounded border -scale-x-100" />
        <canvas ref={engine.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>

      <div className="text-sm">
        <div>Primary: {engine.currentPostureState}</div>
        <div>Active: {engine.activeStates.length ? engine.activeStates.join(", ") : "none"}</div>
      </div>
    </div>
  );
}