import React, { useRef, useState, useCallback } from "react";
import { isHeicImage, ensureJpegImage } from "../../utils/imageUtils.js";

/**
 * Camera component for capturing photos or uploading from gallery.
 * Fullscreen viewfinder on mobile with large capture button.
 */
export default function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  // Start camera stream
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("Could not access camera. Try uploading a photo instead.");
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  // Take photo from video stream
  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    onCapture(base64);
  }, [stopCamera, onCapture]);

  // Handle file upload from gallery
  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        let base64 = reader.result;
        if (isHeicImage(base64) || file.name?.toLowerCase().endsWith(".heic") || file.name?.toLowerCase().endsWith(".heif")) {
          base64 = await ensureJpegImage(base64);
        }
        onCapture(base64);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onCapture]
  );

  const handleCancel = () => {
    stopCamera();
    onCancel?.();
  };

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Camera viewfinder — fullscreen overlay on mobile */}
      {streaming && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full object-cover"
          />
          {/* Bottom control bar — pinned, safe-area aware */}
          <div
            className="flex-none bg-black/80 pt-4 px-6 flex items-center justify-center gap-6"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
          >
            <button
              onClick={handleCancel}
              className="px-5 py-3 bg-gray-700 text-white rounded-full text-base font-medium active:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={takePhoto}
              className="w-20 h-20 bg-white rounded-full border-[5px] border-gray-400 shadow-xl active:scale-95 transition-transform"
              aria-label="Take photo"
            />
            {/* Spacer to center the capture button */}
            <div className="w-[76px]" />
          </div>
        </div>
      )}

      {/* Action buttons (when camera is not streaming) */}
      {!streaming && (
        <div className="flex flex-col gap-3">
          <button
            onClick={startCamera}
            className="w-full flex items-center justify-center gap-2 bg-green-600 text-white rounded-lg px-6 py-4 font-medium hover:bg-green-700 active:bg-green-800 transition-colors text-lg"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Take Photo
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 rounded-lg px-6 py-4 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upload from Gallery
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif,.HEIC,.HEIF"
            capture="environment"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
