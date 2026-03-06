"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { AnalysisResult, HistoryEntry, OverlayType, Direction } from "@/lib/types";

// ── Region grid ───────────────────────────────────────────────────────────────
const REGION_XY: Record<string, [number, number]> = {
  TL: [0.18, 0.18], TC: [0.50, 0.18], TR: [0.82, 0.18],
  CL: [0.18, 0.50], CC: [0.50, 0.50], CR: [0.82, 0.50],
  BL: [0.18, 0.82], BC: [0.50, 0.82], BR: [0.82, 0.82],
};

// ── Canvas action overlays ────────────────────────────────────────────────────
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  angle: number, size: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.6);
  ctx.lineTo(-size, size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPressOverlay(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, t: number
) {
  // Bouncing downward arrow — mimics pressing action
  const bounce = Math.abs(Math.sin(t * 2.8)) * r * 0.5;
  const tip = y - r * 0.3 - bounce;
  const shaftTop = tip - r * 1.1;

  ctx.strokeStyle = "#fb923c";
  ctx.fillStyle = "#fb923c";
  ctx.lineWidth = 4;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(x, shaftTop);
  ctx.lineTo(x, tip - r * 0.15);
  ctx.stroke();

  // Arrowhead
  drawArrowhead(ctx, x, tip, Math.PI / 2, r * 0.35);

  // "PRESS" label above
  const fs = Math.max(11, Math.round(r * 0.38));
  ctx.font = `bold ${fs}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText("PRESS", x, shaftTop - 8);
  ctx.textAlign = "left";
}

function drawPullOverlay(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, direction: Direction, t: number
) {
  // Flowing arrows in the pull direction
  const dirs: Record<string, [number, number, number]> = {
    up:    [0, -1,  -Math.PI / 2],
    down:  [0,  1,   Math.PI / 2],
    left:  [-1, 0,   Math.PI],
    right: [1,  0,   0],
  };
  const [dx, dy, angle] = dirs[direction ?? "right"] ?? dirs.right;

  ctx.strokeStyle = "#fb923c";
  ctx.fillStyle = "#fb923c";
  ctx.lineWidth = 3;

  for (let i = 0; i < 3; i++) {
    // Staggered animation — arrows travel outward
    const phase = ((t * 0.9 + i * 0.33) % 1);
    const dist = r * 0.6 + phase * r * 1.4;
    const alpha = 1 - phase;
    const ax = x + dx * dist;
    const ay = y + dy * dist;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(ax - dx * r * 0.3, ay - dy * r * 0.3);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    drawArrowhead(ctx, ax, ay, angle, r * 0.28);
  }
  ctx.globalAlpha = 1;

  // Label
  const labelX = x + dx * r * 2.4;
  const labelY = y + dy * r * 2.4;
  const label = "PULL";
  const fs = Math.max(11, Math.round(r * 0.38));
  ctx.font = `bold ${fs}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fb923c";
  ctx.fillText(label, labelX, labelY + 5);
  ctx.textAlign = "left";
}

function drawLiftOverlay(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, t: number
) {
  // Stacked chevrons floating upward
  ctx.strokeStyle = "#fb923c";
  ctx.lineWidth = 3;

  for (let i = 0; i < 3; i++) {
    const phase = ((t * 0.7 + i * 0.33) % 1);
    const oy = r + (1 - phase) * r * 1.6;
    const alpha = i === 0 ? 1 : i === 1 ? 0.65 : 0.35;
    ctx.globalAlpha = alpha * (1 - phase * 0.5);

    const cy = y - oy;
    const hw = r * 0.55;
    ctx.beginPath();
    ctx.moveTo(x - hw, cy + r * 0.25);
    ctx.lineTo(x, cy);
    ctx.lineTo(x + hw, cy + r * 0.25);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const fs = Math.max(11, Math.round(r * 0.38));
  ctx.font = `bold ${fs}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fb923c";
  ctx.fillText("LIFT", x, y + r * 1.6);
  ctx.textAlign = "left";
}

function drawTwistOverlay(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, direction: Direction, t: number
) {
  const ccw = direction === "counterclockwise";
  const spin = (t * (ccw ? -1 : 1)) % (Math.PI * 2);
  const arcR = r * 1.1;

  ctx.strokeStyle = "#fb923c";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  // Spinning arc (270 degrees)
  ctx.beginPath();
  ctx.arc(x, y, arcR, spin, spin + Math.PI * 1.5, ccw);
  ctx.stroke();

  // Arrowhead at end of arc
  const endAngle = spin + Math.PI * 1.5 * (ccw ? -1 : 1);
  const arrowAngle = endAngle + (ccw ? -Math.PI / 2 : Math.PI / 2);
  const ax = x + arcR * Math.cos(endAngle);
  const ay = y + arcR * Math.sin(endAngle);
  ctx.fillStyle = "#fb923c";
  drawArrowhead(ctx, ax, ay, arrowAngle, r * 0.32);

  const label = direction === "counterclockwise" ? "LOOSEN" : "TIGHTEN";
  const fs = Math.max(11, Math.round(r * 0.38));
  ctx.font = `bold ${fs}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fb923c";
  ctx.fillText(label, x, y + arcR + fs + 6);
  ctx.textAlign = "left";
}

function drawUnclipOverlay(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, t: number
) {
  // Two sides of a clip opening apart
  const gap = (0.3 + 0.7 * Math.abs(Math.sin(t * 2))) * r * 0.7;

  ctx.strokeStyle = "#fb923c";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  // Left clip half
  ctx.beginPath();
  ctx.moveTo(x - gap - r * 0.1, y - r * 0.4);
  ctx.lineTo(x - gap - r * 0.1, y + r * 0.4);
  ctx.moveTo(x - gap - r * 0.1, y);
  ctx.lineTo(x - gap - r * 0.5, y);
  ctx.stroke();

  // Right clip half
  ctx.beginPath();
  ctx.moveTo(x + gap + r * 0.1, y - r * 0.4);
  ctx.lineTo(x + gap + r * 0.1, y + r * 0.4);
  ctx.moveTo(x + gap + r * 0.1, y);
  ctx.lineTo(x + gap + r * 0.5, y);
  ctx.stroke();

  // Outward arrows
  ctx.fillStyle = "#fb923c";
  drawArrowhead(ctx, x - gap - r * 0.55, y, Math.PI, r * 0.28);
  drawArrowhead(ctx, x + gap + r * 0.55, y, 0, r * 0.28);

  const fs = Math.max(11, Math.round(r * 0.38));
  ctx.font = `bold ${fs}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fb923c";
  ctx.fillText("UNCLIP", x, y + r * 1.5);
  ctx.textAlign = "left";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    return (m[1] ?? null) as string | null;
  };
  return {
    highlight: nullableStr("highlight"),
    highlightLabel: nullableStr("highlightLabel"),
    overlayType: nullableStr("overlayType") as OverlayType | undefined,
    direction: nullableStr("direction") as Direction | undefined,
    instruction: str("instruction") ?? undefined,
    safetyWarning: nullableStr("safetyWarning"),
    nextAction: str("nextAction") ?? undefined,
    step: num("step") ?? undefined,
    totalSteps: num("totalSteps") ?? undefined,
    done: bool("done") ?? undefined,
    stepComplete: bool("stepComplete") ?? undefined,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  vehicle: { year: string; make: string; model: string };
  repairType: string;
  repairLabel: string;
  onBack: () => void;
};

export default function ARCamera({ vehicle, repairType, repairLabel, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  // Overlay animation state (refs — read inside rAF without stale closures)
  const pulseRef = useRef(0);
  const overlayPosRef = useRef<[number, number]>([0.5, 0.5]);
  const targetPosRef = useRef<[number, number] | null>(null);
  const overlayVisibleRef = useRef(false);
  const overlayLabelRef = useRef<string | null>(null);
  const overlayTypeRef = useRef<OverlayType>(null);
  const overlayDirectionRef = useRef<Direction>(null);
  const isAnalyzingRef = useRef(false);
  const showCompleteRef = useRef(false);
  const completeFadeRef = useRef(0); // 0–1

  // Motion detection
  const prevMotionPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const motionCooldownRef = useRef(false);

  // React state
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [liveResult, setLiveResult] = useState<Partial<AnalysisResult> | null>(null);
  const [sessionHistory, setSessionHistory] = useState<HistoryEntry[]>([]);

  // Debug state
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugFrame, setDebugFrame] = useState<string | null>(null);
  const [debugRaw, setDebugRaw] = useState<string>("");
  const [debugPrompt, setDebugPrompt] = useState<string>("");

  // Refs for callbacks
  const liveResultRef = useRef<Partial<AnalysisResult> | null>(null);
  const sessionHistoryRef = useRef<HistoryEntry[]>([]);
  useEffect(() => { liveResultRef.current = liveResult; }, [liveResult]);
  useEffect(() => { sessionHistoryRef.current = sessionHistory; }, [sessionHistory]);

  // ── Camera ──────────────────────────────────────────────────────────────────
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

  // ── AR canvas loop ──────────────────────────────────────────────────────────
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

      // ── Scanning border while analyzing ──
      if (isAnalyzingRef.current) {
        const bLen = 30;
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        [
          [14, 14, 1, 1], [w - 14, 14, -1, 1],
          [14, h - 14, 1, -1], [w - 14, h - 14, -1, -1],
        ].forEach(([cx, cy, dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy + dy * bLen); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * bLen, cy);
          ctx.stroke();
        });
        ctx.strokeStyle = "rgba(251,146,60,0.35)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 7]);
        ctx.lineDashOffset = -(t * 10);
        ctx.strokeRect(14, 14, w - 28, h - 28);
        ctx.setLineDash([]);
      }

      // ── Lerp overlay position ──
      if (overlayVisibleRef.current && targetPosRef.current) {
        const [tx, ty] = targetPosRef.current;
        const [cx, cy] = overlayPosRef.current;
        overlayPosRef.current = [cx + (tx - cx) * 0.1, cy + (ty - cy) * 0.1];
      }

      // ── Draw highlight + action overlay ──
      if (overlayVisibleRef.current) {
        const [nx, ny] = overlayPosRef.current;
        const x = nx * w;
        const y = ny * h;
        const baseR = Math.min(w, h) * 0.09;
        const pulse = 0.78 + 0.22 * Math.sin(t * 2.2);
        const r = baseR * pulse;

        // Glow
        const grd = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 3);
        grd.addColorStop(0, "rgba(251,146,60,0.18)");
        grd.addColorStop(1, "rgba(251,146,60,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        // Base ring
        ctx.strokeStyle = `rgba(251,146,60,${0.55 + 0.45 * pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Outer ring faint
        ctx.strokeStyle = "rgba(251,146,60,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        // ── Action-specific overlay ──
        const ot = overlayTypeRef.current;
        const dir = overlayDirectionRef.current;
        if (ot === "press")  drawPressOverlay(ctx, x, y, baseR, t);
        else if (ot === "pull")   drawPullOverlay(ctx, x, y, baseR, dir, t);
        else if (ot === "lift")   drawLiftOverlay(ctx, x, y, baseR, t);
        else if (ot === "twist")  drawTwistOverlay(ctx, x, y, baseR, dir, t);
        else if (ot === "unclip") drawUnclipOverlay(ctx, x, y, baseR, t);
        else {
          // Default: crosshair arms
          const gap = r * 0.38;
          const arm = r * 0.55;
          ctx.strokeStyle = "rgba(251,146,60,0.5)";
          ctx.lineWidth = 1.5;
          [[x - gap - arm, y, x - gap, y], [x + gap, y, x + gap + arm, y],
           [x, y - gap - arm, x, y - gap], [x, y + gap, x, y + gap + arm]].forEach(([x1, y1, x2, y2]) => {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          });
        }

        // Label tag (always shown below ring)
        const label = overlayLabelRef.current;
        if (label) {
          const fs = Math.max(12, Math.round(w * 0.03));
          ctx.font = `bold ${fs}px system-ui, sans-serif`;
          ctx.textAlign = "left";
          const tw = ctx.measureText(label).width;
          const pad = 7;
          const tagW = tw + pad * 2;
          const tagH = fs + pad * 1.6;
          let lx = x - tagW / 2;
          let ly = y + baseR * 1.6 + 12;
          lx = Math.max(8, Math.min(lx, w - tagW - 8));
          ly = Math.min(ly, h - tagH - 80);

          ctx.fillStyle = "rgba(251,146,60,0.92)";
          ctx.beginPath();
          ctx.roundRect(lx, ly, tagW, tagH, 6);
          ctx.fill();
          ctx.fillStyle = "#000";
          ctx.fillText(label, lx + pad, ly + tagH - pad * 0.8);
        }
      }

      // ── Step complete flash ──
      if (showCompleteRef.current) {
        completeFadeRef.current = Math.min(completeFadeRef.current + 0.06, 1);
        const alpha = Math.sin(completeFadeRef.current * Math.PI);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(34,197,94,0.25)";
        ctx.fillRect(0, 0, w, h);

        // Big checkmark
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(w / 2 - 40, h / 2);
        ctx.lineTo(w / 2 - 10, h / 2 + 30);
        ctx.lineTo(w / 2 + 45, h / 2 - 35);
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (completeFadeRef.current >= 1) {
          showCompleteRef.current = false;
          completeFadeRef.current = 0;
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const captureFrame = useCallback((quality = 0.82): string | null => {
    const v = videoRef.current;
    const c = captureCanvasRef.current;
    if (!v || !c || v.videoWidth === 0) return null;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    return c.toDataURL("image/jpeg", quality);
  }, []);

  const prevSpokenRef = useRef("");
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !("speechSynthesis" in window) || text === prevSpokenRef.current) return;
    prevSpokenRef.current = text;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, [voiceEnabled]);

  // ── Motion detection ────────────────────────────────────────────────────────
  const detectMotion = useCallback((): number => {
    const v = videoRef.current;
    const c = motionCanvasRef.current;
    if (!v || !c || v.videoWidth === 0) return 0;
    const ctx = c.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(v, 0, 0, 80, 45);
    const pixels = ctx.getImageData(0, 0, 80, 45).data;
    if (!prevMotionPixelsRef.current) {
      prevMotionPixelsRef.current = new Uint8ClampedArray(pixels);
      return 0;
    }
    let diff = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      diff += Math.abs(pixels[i] - prevMotionPixelsRef.current[i]);
    }
    prevMotionPixelsRef.current = new Uint8ClampedArray(pixels);
    return diff / (pixels.length / 4);
  }, []);

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const analyze = useCallback(async (withImage = true) => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    setAnalyzing(true);

    const rawImage = withImage ? captureFrame() : null;
    if (rawImage) setDebugFrame(rawImage);

    try {
      const res = await fetch("/api/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle, repairType, image: rawImage,
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

        const partial = extractPartial(buffer);

        // Apply highlight + overlay type early (first few tokens)
        if (!earlyApplied && partial.highlight !== undefined) {
          earlyApplied = true;
          if (partial.highlight && REGION_XY[partial.highlight]) {
            targetPosRef.current = REGION_XY[partial.highlight];
            overlayVisibleRef.current = true;
          } else if (partial.highlight === null) {
            overlayVisibleRef.current = false;
          }
          if (partial.highlightLabel !== undefined) overlayLabelRef.current = partial.highlightLabel;
          if (partial.overlayType !== undefined) overlayTypeRef.current = partial.overlayType ?? null;
          if (partial.direction !== undefined) overlayDirectionRef.current = partial.direction ?? null;
        }

        // Live update instruction as it streams
        if (partial.instruction) setLiveResult((prev) => ({ ...prev, ...partial }));
      }

      // Store raw response for debug
      setDebugRaw(buffer);

      // Parse final
      const jsonStr = buffer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      let finalResult: AnalysisResult;
      try {
        finalResult = JSON.parse(jsonStr);
      } catch {
        finalResult = {
          step: (liveResultRef.current?.step ?? 0) + 1,
          totalSteps: liveResultRef.current?.totalSteps ?? 5,
          instruction: liveResultRef.current?.instruction ?? "Continue.",
          highlight: liveResultRef.current?.highlight ?? null,
          highlightLabel: liveResultRef.current?.highlightLabel ?? null,
          overlayType: liveResultRef.current?.overlayType ?? null,
          direction: liveResultRef.current?.direction ?? null,
          stepComplete: false,
          safetyWarning: null,
          done: false,
          nextAction: "",
        };
      }

      // Apply final overlay
      if (finalResult.highlight && REGION_XY[finalResult.highlight]) {
        targetPosRef.current = REGION_XY[finalResult.highlight];
        overlayVisibleRef.current = true;
      } else {
        overlayVisibleRef.current = false;
      }
      overlayLabelRef.current = finalResult.highlightLabel;
      overlayTypeRef.current = finalResult.overlayType;
      overlayDirectionRef.current = finalResult.direction;

      setLiveResult(finalResult);

      // Step completion flash
      if (finalResult.stepComplete) {
        showCompleteRef.current = true;
        completeFadeRef.current = 0;
      }

      // Speak
      const toSpeak = [finalResult.safetyWarning, finalResult.instruction].filter(Boolean).join(". ");
      speak(toSpeak);

      // Save to history
      const imageToStore = rawImage ?? null;
      const saveToHistory = async () => {
        const compressed = imageToStore ? await compressImage(imageToStore) : null;
        setSessionHistory((prev) => [...prev, { image: compressed, result: finalResult }]);
      };
      saveToHistory();

    } catch {
      // silent — auto-loop will retry
    } finally {
      isAnalyzingRef.current = false;
      setAnalyzing(false);
    }
  }, [vehicle, repairType, captureFrame, speak]);

  // ── Fetch system prompt for debug panel ────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams({
      year: vehicle.year, make: vehicle.make, model: vehicle.model, repairType,
    });
    fetch(`/api/debug-prompt?${params}`)
      .then((r) => r.json())
      .then((d) => setDebugPrompt(d.prompt ?? ""))
      .catch(() => {});
  }, [vehicle, repairType]); // eslint-disable-line

  // ── First analysis on camera ready ─────────────────────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (ready && !initializedRef.current) {
      initializedRef.current = true;
      setTimeout(() => analyze(false), 600);
    }
  }, [ready]); // eslint-disable-line

  // ── Auto-analyze loop (always on) ──────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      if (!isAnalyzingRef.current && !(liveResultRef.current as AnalysisResult | null)?.done) {
        analyze(true);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [ready, analyze]);

  // ── Motion-triggered re-analysis ───────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      if (isAnalyzingRef.current || motionCooldownRef.current) return;
      const diff = detectMotion();
      if (diff > 28) { // threshold — significant movement
        motionCooldownRef.current = true;
        setTimeout(() => { motionCooldownRef.current = false; }, 3000); // 3s cooldown
        if (!isAnalyzingRef.current) analyze(true);
      }
    }, 800);
    return () => clearInterval(id);
  }, [ready, analyze, detectMotion]);

  // ── Render ──────────────────────────────────────────────────────────────────
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
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={captureCanvasRef} className="hidden" />
      <canvas ref={motionCanvasRef} width={80} height={45} className="hidden" />
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Safety warning */}
      {result?.safetyWarning && (
        <div className="absolute top-0 inset-x-0 bg-red-600/90 backdrop-blur-sm px-4 py-2 text-white text-sm font-bold text-center z-20">
          ⚠️ {result.safetyWarning}
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute inset-x-0 flex items-center justify-between px-3 z-10 ${result?.safetyWarning ? "top-10" : "top-3"}`}>
        <button onClick={onBack} className="bg-black/55 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-xl active:scale-95">
          ← Back
        </button>

        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${analyzing ? "bg-orange-400 animate-ping" : "bg-green-400 animate-pulse"}`} />
          <span className="text-xs text-white font-medium">
            {analyzing ? "Analyzing…" : "Watching"}
          </span>
          {result && <span className="text-xs text-zinc-400 ml-1">{result.step}/{result.totalSteps}</span>}
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setDebugOpen((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-xl backdrop-blur-sm font-mono font-semibold transition-colors ${debugOpen ? "bg-yellow-400/90 text-black" : "bg-black/55 text-zinc-400"}`}
          >
            DEBUG
          </button>
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            className="bg-black/55 backdrop-blur-sm text-lg w-9 h-9 rounded-xl flex items-center justify-center"
          >
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* Bottom instruction card */}
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
              {ready ? `Pointing camera at your ${vehicle.make}…` : "Starting camera…"}
            </p>
          )}

          <div className="flex gap-2 mt-2">
            <button
              onClick={() => analyze(true)}
              disabled={analyzing || !ready || isDone}
              className="flex-1 bg-zinc-800 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3.5 rounded-2xl text-sm transition-colors active:scale-[0.97]"
            >
              {analyzing ? "Analyzing…" : isDone ? "Complete ✓" : "Analyze Now"}
            </button>
            <button
              onClick={() => setVoiceEnabled((v) => !v)}
              className={`w-14 h-14 rounded-2xl text-xl flex items-center justify-center transition-colors ${voiceEnabled ? "bg-orange-500/20" : "bg-zinc-800"}`}
            >
              {voiceEnabled ? "🔊" : "🔇"}
            </button>
          </div>
        </div>
      </div>

      {/* Debug panel */}
      {debugOpen && (
        <div className="absolute inset-0 z-30 bg-black/95 overflow-y-auto">
          <div className="p-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-yellow-400 font-mono font-bold text-sm">DEBUG INSPECTOR</span>
              <button
                onClick={() => setDebugOpen(false)}
                className="text-zinc-400 bg-zinc-800 px-3 py-1 rounded-lg text-sm"
              >
                Close
              </button>
            </div>

            {/* Last captured frame */}
            <div className="mb-4">
              <p className="text-yellow-400 font-mono text-xs uppercase tracking-wider mb-2">
                Last frame sent to Claude ({sessionHistory.length} steps in history)
              </p>
              {debugFrame ? (
                <img src={debugFrame} alt="last frame" className="w-full rounded-lg border border-zinc-700" />
              ) : (
                <p className="text-zinc-500 text-xs">No frame captured yet</p>
              )}
            </div>

            {/* Raw Claude response */}
            <div className="mb-4">
              <p className="text-yellow-400 font-mono text-xs uppercase tracking-wider mb-2">
                Raw Claude response
              </p>
              {debugRaw ? (
                <pre className="text-green-400 font-mono text-xs bg-zinc-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-zinc-700">
                  {(() => {
                    try { return JSON.stringify(JSON.parse(debugRaw), null, 2); }
                    catch { return debugRaw; }
                  })()}
                </pre>
              ) : (
                <p className="text-zinc-500 text-xs">No response yet</p>
              )}
            </div>

            {/* System prompt */}
            <div>
              <p className="text-yellow-400 font-mono text-xs uppercase tracking-wider mb-2">
                System prompt sent to Claude
              </p>
              {debugPrompt ? (
                <pre className="text-zinc-300 font-mono text-xs bg-zinc-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-zinc-700">
                  {debugPrompt}
                </pre>
              ) : (
                <p className="text-zinc-500 text-xs">Loading…</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Done overlay */}
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
