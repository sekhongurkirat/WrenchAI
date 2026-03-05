"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { AnalysisResult, HistoryEntry } from "@/lib/types";

// Normalized (0–1) center coords for each 3×3 region
const REGION_XY: Record<string, [number, number]> = {
  TL: [0.18, 0.18], TC: [0.50, 0.18], TR: [0.82, 0.18],
  CL: [0.18, 0.50], CC: [0.50, 0.50], CR: [0.82, 0.50],
  BL: [0.18, 0.82], BC: [0.50, 0.82], BR: [0.82, 0.82],
};

// Compress image for history storage (lower quality to keep payload small)
function compressImage(dataUrl: string, quality = 0.45): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

// Pull key fields out of a partial JSON string as it streams in
function extractPartial(text: string): Partial<AnalysisResult> {
  const str = (key: string) => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, "s"));
    return m ? m[1] : null;
  };
  const bool = (key: string) => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`));
    return m ? m[1] === "true" : null;
  };
  const num = (key: string) => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1]) : null;
  };
  const nullableStr = (key: string) => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*(?:"([^"]*)"|null)`));
    if (!m) return undefined;
    return m[1] ?? null;
  };
  return {
    highlight: nullableStr("highlight") as string | null | undefined,
    highlightLabel: nullableStr("highlightLabel") as string | null | undefined,
    instruction: str("instruction") ?? undefined,
    safetyWarning: nullableStr("safetyWarning") as string | null | undefined,
    nextAction: str("nextAction") ?? undefined,
    step: num("step") ?? undefined,
    totalSteps: num("totalSteps") ?? undefined,
    done: bool("done") ?? undefined,
  };
}

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

  // Overlay animation state (refs so rAF reads latest without re-renders)
  const pulseRef = useRef(0);
  const overlayPosRef = useRef<[number, number]>([0.5, 0.5]); // current lerped position
  const targetPosRef = useRef<[number, number] | null>(null);   // target position
  const overlayVisibleRef = useRef(false);
  const overlayLabelRef = useRef<string | null>(null);

  // React state (for UI re-renders)
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoMode, setAutoMode] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [watchState, setWatchState] = useState<"idle" | "watching" | "analyzing">("idle");
  const [liveResult, setLiveResult] = useState<Partial<AnalysisResult> | null>(null);
  const [sessionHistory, setSessionHistory] = useState<HistoryEntry[]>([]);

  // Refs for use inside callbacks without stale closures
  const analyzingRef = useRef(false);
  const liveResultRef = useRef<Partial<AnalysisResult> | null>(null);
  const sessionHistoryRef = useRef<HistoryEntry[]>([]);

  useEffect(() => { analyzingRef.current = analyzing; }, [analyzing]);
  useEffect(() => { liveResultRef.current = liveResult; }, [liveResult]);
  useEffect(() => { sessionHistoryRef.current = sessionHistory; }, [sessionHistory]);

  // ── Camera setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      } catch {
        if (!cancelled) setCameraError("Camera access denied. Allow permissions and reload.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── AR canvas animation loop ───────────────────────────────────────────────
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

      // ── Scanning animation while analyzing ──
      if (isAnalyzing) {
        // Corner brackets
        const bLen = 28;
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        const corners: [number, number, number, number][] = [
          [14, 14, 1, 1], [w - 14, 14, -1, 1],
          [14, h - 14, 1, -1], [w - 14, h - 14, -1, -1],
        ];
        corners.forEach(([cx, cy, dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy + dy * bLen); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * bLen, cy);
          ctx.stroke();
        });

        // Dashed border
        ctx.strokeStyle = "rgba(251,146,60,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 7]);
        ctx.lineDashOffset = -(t * 10);
        ctx.strokeRect(14, 14, w - 28, h - 28);
        ctx.setLineDash([]);
      }

      // ── Smooth lerp of highlight position ──
      if (overlayVisibleRef.current && targetPosRef.current) {
        const [tx, ty] = targetPosRef.current;
        const [cx, cy] = overlayPosRef.current;
        // Lerp at 10% per frame (~60fps → reaches target in ~400ms)
        overlayPosRef.current = [
          cx + (tx - cx) * 0.10,
          cy + (ty - cy) * 0.10,
        ];
      }

      // ── Highlight overlay ──
      if (overlayVisibleRef.current) {
        const [nx, ny] = overlayPosRef.current;
        const x = nx * w;
        const y = ny * h;
        const baseR = Math.min(w, h) * 0.09;
        const pulse = 0.78 + 0.22 * Math.sin(t * 2.2);
        const r = baseR * pulse;

        // Radial glow
        const grd = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 2.8);
        grd.addColorStop(0, "rgba(251,146,60,0.22)");
        grd.addColorStop(1, "rgba(251,146,60,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring (faint)
        ctx.strokeStyle = `rgba(251,146,60,0.3)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
        ctx.stroke();

        // Main pulsing ring
        ctx.strokeStyle = `rgba(251,146,60,${0.65 + 0.35 * pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Inner dot
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Crosshair arms
        const gap = r * 0.38;
        const arm = r * 0.58;
        ctx.strokeStyle = "rgba(251,146,60,0.55)";
        ctx.lineWidth = 1.5;
        [[x - gap - arm, y, x - gap, y], [x + gap, y, x + gap + arm, y],
         [x, y - gap - arm, x, y - gap], [x, y + gap, x, y + gap + arm]].forEach(([x1, y1, x2, y2]) => {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        });

        // Label tag
        const label = overlayLabelRef.current;
        if (label) {
          const fs = Math.max(12, Math.round(w * 0.031));
          ctx.font = `bold ${fs}px system-ui, sans-serif`;
          const tw = ctx.measureText(label).width;
          const pad = 7;
          const tagW = tw + pad * 2;
          const tagH = fs + pad * 1.6;
          let lx = x - tagW / 2;
          let ly = y + r + 10;
          lx = Math.max(8, Math.min(lx, w - tagW - 8));
          ly = Math.min(ly, h - tagH - 60); // leave room for bottom bar

          // Connector
          ctx.strokeStyle = "rgba(251,146,60,0.6)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x, y + r + 2);
          ctx.lineTo(x, ly);
          ctx.stroke();
          ctx.setLineDash([]);

          // Tag background
          ctx.fillStyle = "rgba(251,146,60,0.92)";
          ctx.beginPath();
          ctx.roundRect(lx, ly, tagW, tagH, 6);
          ctx.fill();

          ctx.fillStyle = "#000";
          ctx.fillText(label, lx + pad, ly + tagH - pad * 0.8);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready]);

  // ── Capture frame ──────────────────────────────────────────────────────────
  const captureFrame = useCallback((quality = 0.82): string | null => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  // ── Speak ──────────────────────────────────────────────────────────────────
  const prevSpokenRef = useRef("");
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !("speechSynthesis" in window) || text === prevSpokenRef.current) return;
    prevSpokenRef.current = text;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, [voiceEnabled]);

  // ── Analyze ────────────────────────────────────────────────────────────────
  const analyze = useCallback(async (withImage = true) => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    setAnalyzing(true);
    setWatchState("analyzing");

    const rawImage = withImage ? captureFrame() : null;

    try {
      const res = await fetch("/api/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle,
          repairType,
          image: rawImage,
          history: sessionHistoryRef.current,
        }),
      });
      if (!res.ok || !res.body) throw new Error("API error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let earlyApplied = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Early overlay update from first few tokens (~300ms after request)
        if (!earlyApplied) {
          const partial = extractPartial(buffer);
          if (partial.highlight !== undefined || partial.highlightLabel !== undefined) {
            earlyApplied = true;
            if (partial.highlight && REGION_XY[partial.highlight]) {
              targetPosRef.current = REGION_XY[partial.highlight];
              overlayVisibleRef.current = true;
            } else if (partial.highlight === null) {
              overlayVisibleRef.current = false;
            }
            if (partial.highlightLabel !== undefined) {
              overlayLabelRef.current = partial.highlightLabel;
            }
          }
        }

        // Live instruction as it streams
        const partial = extractPartial(buffer);
        if (partial.instruction) {
          setLiveResult((prev) => ({ ...prev, ...partial }));
        }
      }

      // Parse final JSON
      const jsonStr = buffer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      let finalResult: AnalysisResult;
      try {
        finalResult = JSON.parse(jsonStr);
      } catch {
        finalResult = {
          step: (liveResultRef.current?.step ?? 0) + 1,
          totalSteps: liveResultRef.current?.totalSteps ?? 5,
          instruction: liveResultRef.current?.instruction ?? "Continue with the repair.",
          highlight: liveResultRef.current?.highlight ?? null,
          highlightLabel: liveResultRef.current?.highlightLabel ?? null,
          safetyWarning: null,
          done: false,
          nextAction: "",
        };
      }

      // Update overlay from final result
      if (finalResult.highlight && REGION_XY[finalResult.highlight]) {
        targetPosRef.current = REGION_XY[finalResult.highlight];
        overlayVisibleRef.current = true;
      } else {
        overlayVisibleRef.current = false;
      }
      overlayLabelRef.current = finalResult.highlightLabel;

      setLiveResult(finalResult);

      // Speak instruction + safety warning
      const toSpeak = [finalResult.safetyWarning, finalResult.instruction].filter(Boolean).join(". ");
      speak(toSpeak);

      // Save to session history (compressed image for future context)
      if (rawImage) {
        compressImage(rawImage).then((compressed) => {
          setSessionHistory((prev) => [...prev, { image: compressed, result: finalResult }]);
        });
      } else {
        setSessionHistory((prev) => [...prev, { image: null, result: finalResult }]);
      }

    } catch {
      // silent fail — auto-loop will retry
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
      setWatchState(autoMode ? "watching" : "idle");
    }
  }, [vehicle, repairType, captureFrame, speak, autoMode]);

  // ── First analysis on camera ready ────────────────────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (ready && !initializedRef.current) {
      initializedRef.current = true;
      setWatchState("watching");
      setTimeout(() => analyze(false), 800);
    }
  }, [ready]); // eslint-disable-line

  // ── Auto-analyze loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoMode || !ready) return;
    setWatchState("watching");
    const id = setInterval(() => {
      if (!analyzingRef.current && !(liveResultRef.current as AnalysisResult | null)?.done) {
        analyze(true);
      }
    }, 5000);
    return () => { clearInterval(id); if (!analyzingRef.current) setWatchState("idle"); };
  }, [autoMode, ready, analyze]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (cameraError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center bg-zinc-950">
        <p className="text-red-400">{cameraError}</p>
        <button onClick={onBack} className="text-zinc-400 underline text-sm">Go back</button>
      </div>
    );
  }

  const result = liveResult as AnalysisResult | null;
  const isDone = result?.done ?? false;

  return (
    <div className="relative flex-1 overflow-hidden bg-black select-none touch-none">
      {/* Live video */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

      {/* Hidden capture canvas */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* AR overlay canvas */}
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Safety warning */}
      {result?.safetyWarning && (
        <div className="absolute top-0 inset-x-0 bg-red-600/90 backdrop-blur-sm px-4 py-2 text-white text-sm font-semibold text-center z-20">
          ⚠️ {result.safetyWarning}
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute inset-x-0 flex items-center justify-between px-3 z-10 ${result?.safetyWarning ? "top-10" : "top-3"}`}>
        <button
          onClick={onBack}
          className="bg-black/55 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-xl active:scale-95"
        >
          ← Back
        </button>

        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
          {/* Watching indicator */}
          <span className={`w-2 h-2 rounded-full ${
            watchState === "analyzing" ? "bg-orange-400 animate-ping" :
            watchState === "watching" ? "bg-green-400 animate-pulse" :
            "bg-zinc-600"
          }`} />
          <span className="text-xs text-white font-medium">
            {watchState === "analyzing" ? "Analyzing..." :
             watchState === "watching" ? "Watching" :
             repairLabel}
          </span>
          {result && (
            <span className="text-xs text-zinc-400 ml-1">
              {result.step}/{result.totalSteps}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setAutoMode((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-xl backdrop-blur-sm font-semibold transition-colors ${
              autoMode ? "bg-green-500/80 text-white" : "bg-black/55 text-zinc-400"
            }`}
          >
            AUTO
          </button>
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            className="bg-black/55 backdrop-blur-sm text-lg w-9 h-9 rounded-xl flex items-center justify-center"
          >
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* Bottom card */}
      <div className="absolute bottom-0 inset-x-0 z-10">
        <div className="h-24 bg-gradient-to-t from-black via-black/85 to-transparent pointer-events-none" />
        <div className="bg-black px-4 pt-1 pb-7">
          {result ? (
            <>
              <p className="text-white text-base font-semibold leading-snug mb-0.5">
                {result.instruction ?? ""}
                {analyzing && <span className="text-zinc-500 animate-pulse"> ▌</span>}
              </p>
              {result.nextAction && !analyzing && (
                <p className="text-orange-400 text-sm mb-2">{result.nextAction}</p>
              )}
            </>
          ) : (
            <p className="text-zinc-400 text-sm mb-3 text-center">
              {ready ? `Point camera at your ${vehicle.make} ${vehicle.model}…` : "Starting camera…"}
            </p>
          )}

          <div className="flex gap-2 mt-2">
            <button
              onClick={() => analyze(true)}
              disabled={analyzing || !ready || isDone}
              className="flex-1 bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-bold py-4 rounded-2xl text-base transition-colors active:scale-[0.97] disabled:active:scale-100"
            >
              {analyzing ? "Analyzing…" : isDone ? "Complete ✓" : result ? "Next Step →" : "Analyze"}
            </button>
            <button
              onClick={() => analyze(true)}
              disabled={analyzing || !ready}
              title="Re-analyze current view"
              className="w-14 h-14 bg-zinc-800/90 rounded-2xl text-xl flex items-center justify-center active:scale-95 disabled:opacity-40"
            >
              📷
            </button>
          </div>
        </div>
      </div>

      {/* Completion overlay */}
      {isDone && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="bg-green-600/92 backdrop-blur-sm rounded-3xl px-10 py-8 text-center shadow-2xl">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-white text-2xl font-bold">Done!</p>
            <p className="text-green-100 text-sm mt-1">{repairLabel} complete</p>
          </div>
        </div>
      )}
    </div>
  );
}
