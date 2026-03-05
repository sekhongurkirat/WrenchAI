"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// Normalized (0–1) center coordinates for each 3×3 grid region
const REGION_CENTERS: Record<string, [number, number]> = {
  TL: [0.18, 0.18], TC: [0.50, 0.18], TR: [0.82, 0.18],
  CL: [0.18, 0.50], CC: [0.50, 0.50], CR: [0.82, 0.50],
  BL: [0.18, 0.82], BC: [0.50, 0.82], BR: [0.82, 0.82],
};

export type AnalysisResult = {
  step: number;
  totalSteps: number;
  instruction: string;
  highlight: string | null;
  highlightLabel: string | null;
  safetyWarning: string | null;
  done: boolean;
  nextAction: string;
};

type Props = {
  vehicle: { year: string; make: string; model: string };
  repairType: string;
  repairLabel: string;
  onBack: () => void;
};

export default function ARCamera({ vehicle, repairType, repairLabel, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const pulseRef = useRef(0);
  const resultRef = useRef<AnalysisResult | null>(null);
  const analyzingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoCapture, setAutoCapture] = useState(false);

  // Keep ref in sync for use inside rAF without stale closures
  useEffect(() => { resultRef.current = result; }, [result]);
  useEffect(() => { analyzingRef.current = analyzing; }, [analyzing]);

  // Start camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      } catch {
        if (!cancelled) setCameraError("Camera access denied. Allow camera permissions and reload.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // AR canvas animation loop
  useEffect(() => {
    if (!ready) return;
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const draw = () => {
      const w = video.clientWidth;
      const h = video.clientHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, w, h);
      pulseRef.current += 0.04;
      const t = pulseRef.current;

      const isAnalyzing = analyzingRef.current;
      const res = resultRef.current;

      // ── Scanning border when analyzing ──
      if (isAnalyzing) {
        ctx.save();
        ctx.strokeStyle = "rgba(251,146,60,0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -(t * 12);
        ctx.strokeRect(16, 16, w - 32, h - 32);
        ctx.restore();

        // Corner brackets
        const bLen = 28, bW = 3;
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = bW;
        ctx.setLineDash([]);
        const corners: [number, number, number, number][] = [
          [16, 16, 1, 1], [w - 16, 16, -1, 1],
          [16, h - 16, 1, -1], [w - 16, h - 16, -1, -1],
        ];
        corners.forEach(([cx, cy, dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy + dy * bLen); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * bLen, cy);
          ctx.stroke();
        });
      }

      // ── Highlight region ──
      if (res?.highlight && REGION_CENTERS[res.highlight]) {
        const [nx, ny] = REGION_CENTERS[res.highlight];
        const x = nx * w;
        const y = ny * h;
        const baseR = Math.min(w, h) * 0.09;
        const pulse = 0.75 + 0.25 * Math.sin(t * 2);
        const r = baseR * pulse;

        // Outer radial glow
        const grd = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.5);
        grd.addColorStop(0, "rgba(251,146,60,0.25)");
        grd.addColorStop(1, "rgba(251,146,60,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing ring
        ctx.strokeStyle = `rgba(251,146,60,${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Inner dot
        ctx.fillStyle = "rgba(251,146,60,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Crosshair lines
        const gap = r * 0.35;
        const arm = r * 0.65;
        ctx.strokeStyle = "rgba(251,146,60,0.5)";
        ctx.lineWidth = 1.5;
        [[x - gap - arm, y, x - gap, y], [x + gap, y, x + gap + arm, y],
         [x, y - gap - arm, x, y - gap], [x, y + gap, x, y + gap + arm]].forEach(([x1, y1, x2, y2]) => {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        });

        // Label tag
        if (res.highlightLabel) {
          const label = res.highlightLabel;
          const fontSize = Math.max(12, Math.round(w * 0.032));
          ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
          const tw = ctx.measureText(label).width;
          const pad = 8;
          const tagW = tw + pad * 2;
          const tagH = fontSize + pad * 1.5;

          // Position tag below the ring, clamped to canvas
          let tx = x - tagW / 2;
          let ty = y + r + 10;
          tx = Math.max(8, Math.min(tx, w - tagW - 8));
          ty = Math.min(ty, h - tagH - 8);

          // Tag background
          ctx.fillStyle = "rgba(251,146,60,0.92)";
          ctx.beginPath();
          ctx.roundRect(tx, ty, tagW, tagH, 6);
          ctx.fill();

          // Connector line from ring to tag
          ctx.strokeStyle = "rgba(251,146,60,0.7)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y + r);
          ctx.lineTo(x, ty);
          ctx.stroke();

          ctx.fillStyle = "#000";
          ctx.fillText(label, tx + pad, ty + tagH - pad);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready]);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }, [voiceEnabled]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.82);
  }, []);

  const analyze = useCallback(async (withImage = true) => {
    if (analyzingRef.current) return;
    setAnalyzing(true);

    const image = withImage ? captureFrame() : null;
    const previousStep = resultRef.current?.step ?? 0;

    try {
      const res = await fetch("/api/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle, repairType, image, previousStep }),
      });
      if (!res.ok) throw new Error("API error");
      const data: AnalysisResult = await res.json();
      setResult(data);

      const toSpeak = [data.safetyWarning, data.instruction].filter(Boolean).join(". ");
      speak(toSpeak);
    } catch {
      // leave result unchanged, user can retry
    } finally {
      setAnalyzing(false);
    }
  }, [vehicle, repairType, captureFrame, speak]);

  // First analysis on camera ready
  useEffect(() => {
    if (ready) analyze(false);
  }, [ready]); // eslint-disable-line

  // Auto-capture mode: re-analyze every 6s
  useEffect(() => {
    if (!autoCapture || !ready) return;
    const id = setInterval(() => {
      if (!analyzingRef.current) analyze(true);
    }, 6000);
    return () => clearInterval(id);
  }, [autoCapture, ready, analyze]);

  if (cameraError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400">{cameraError}</p>
        <button onClick={onBack} className="text-zinc-400 underline text-sm">Go back</button>
      </div>
    );
  }

  const buttonLabel = analyzing
    ? "Analyzing..."
    : result?.done
    ? "Complete ✓"
    : result
    ? "Next Step →"
    : "Analyze";

  return (
    <div className="relative flex-1 overflow-hidden bg-black select-none">
      {/* Live video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Hidden canvas for frame capture */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* AR overlay canvas */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Safety warning */}
      {result?.safetyWarning && (
        <div className="absolute top-0 inset-x-0 bg-red-600/90 backdrop-blur-sm px-4 py-2 text-white text-sm font-semibold text-center z-10">
          ⚠️ {result.safetyWarning}
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute inset-x-0 flex items-center justify-between px-3 z-10 ${result?.safetyWarning ? "top-10" : "top-3"}`}>
        <button
          onClick={onBack}
          className="bg-black/50 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-xl"
        >
          ← Back
        </button>

        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-white font-medium text-center">
          <span className="text-orange-400">{repairLabel}</span>
          {result && (
            <span className="ml-2 text-zinc-400">
              Step {result.step}/{result.totalSteps}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setAutoCapture((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-xl backdrop-blur-sm transition-colors ${
              autoCapture ? "bg-orange-500/80 text-white" : "bg-black/50 text-zinc-400"
            }`}
            title="Auto-analyze every 6s"
          >
            {autoCapture ? "AUTO" : "AUTO"}
          </button>
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            className="bg-black/50 backdrop-blur-sm text-lg w-9 h-9 rounded-xl flex items-center justify-center"
          >
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* Analyzing spinner overlay */}
      {analyzing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-5 py-3 flex items-center gap-2.5">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
            <span className="text-white text-sm">Analyzing...</span>
          </div>
        </div>
      )}

      {/* Bottom instruction card */}
      <div className="absolute bottom-0 inset-x-0 z-10">
        {/* Gradient fade */}
        <div className="h-32 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

        <div className="bg-black px-4 pt-2 pb-6">
          {result ? (
            <>
              <p className="text-white text-base font-medium leading-snug mb-1">
                {result.instruction}
              </p>
              {result.nextAction && (
                <p className="text-orange-400 text-sm mb-3">{result.nextAction}</p>
              )}
            </>
          ) : (
            <p className="text-zinc-400 text-sm mb-3 text-center">
              {ready ? `Point your camera at your ${vehicle.make} ${vehicle.model}...` : "Starting camera..."}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => analyze(true)}
              disabled={analyzing || !ready || result?.done}
              className="flex-1 bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-4 rounded-2xl text-base transition-colors active:scale-95 disabled:active:scale-100"
            >
              {buttonLabel}
            </button>
            <button
              onClick={() => analyze(true)}
              disabled={analyzing || !ready}
              className="w-14 h-14 bg-zinc-800 rounded-2xl text-xl flex items-center justify-center active:scale-95 disabled:opacity-40"
              title="Re-analyze current view"
            >
              📷
            </button>
          </div>
        </div>
      </div>

      {/* Done overlay */}
      {result?.done && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-green-500/90 backdrop-blur-sm rounded-3xl px-8 py-6 text-center">
            <p className="text-4xl mb-2">✅</p>
            <p className="text-white text-xl font-bold">Repair Complete!</p>
            <p className="text-green-100 text-sm mt-1">{repairLabel} finished</p>
          </div>
        </div>
      )}
    </div>
  );
}
