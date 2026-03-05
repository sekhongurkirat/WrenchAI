"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface CameraProps {
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
}

export default function Camera({ onCapture, onClose }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      } catch {
        setError("Camera access denied. Please allow camera permissions and try again.");
      }
    }
    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onCapture(dataUrl);
  }, [onCapture]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 p-6 bg-zinc-800 rounded-xl text-center">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={onClose} className="text-zinc-400 underline text-sm">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-h-72 object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <span className="text-zinc-400 text-sm">Starting camera...</span>
        </div>
      )}

      {ready && (
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-4">
          <button
            onClick={capture}
            className="bg-white text-black font-semibold px-6 py-2 rounded-full text-sm shadow-lg active:scale-95 transition-transform"
          >
            Capture Photo
          </button>
          <button
            onClick={onClose}
            className="bg-zinc-700 text-white px-4 py-2 rounded-full text-sm active:scale-95 transition-transform"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
