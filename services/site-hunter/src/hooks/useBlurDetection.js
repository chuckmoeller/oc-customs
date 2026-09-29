import { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeFrameQuality } from '../utils/blurDetection.js';

/**
 * Custom React hook for real-time video stream blur evaluation.
 * Performs periodic Laplacian variance calculations on a downscaled canvas buffer.
 *
 * @param {object} options
 * @param {React.RefObject<HTMLVideoElement>} options.videoRef - Reference to the active <video> element
 * @param {boolean} options.isStreaming - Whether camera stream is currently active
 * @param {number} [options.threshold=110] - Laplacian variance threshold
 * @param {number} [options.intervalMs=120] - Sampling frequency in milliseconds
 * @param {boolean} [options.enabled=true] - Whether evaluation loop is enabled
 */
export function useBlurDetection({
  videoRef,
  isStreaming,
  threshold = 110,
  intervalMs = 120,
  enabled = true,
}) {
  const [quality, setQuality] = useState({
    variance: 0,
    sharpnessScore: 0,
    brightness: 128,
    isSharp: false,
    isBlurry: true,
    isLowLight: false,
    isOverExposed: false,
    status: 'blurry',
    feedbackMessage: 'Stabilizing camera...',
    color: '#F59E0B', // Amber
  });

  const offscreenCanvasRef = useRef(null);
  const timerRef = useRef(null);
  const recentScoresRef = useRef([]);

  // Initialize offscreen canvas once
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 240;
      offscreenCanvasRef.current = c;
    }
  }, []);

  // Frame analysis worker
  const evaluateFrame = useCallback(() => {
    const video = videoRef?.current;
    const canvas = offscreenCanvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      return null;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Draw downscaled frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const result = analyzeFrameQuality(ctx, {
      threshold,
      analysisWidth: canvas.width,
      analysisHeight: canvas.height,
    });

    // 3-frame rolling average to prevent UI jitter
    recentScoresRef.current.push(result.sharpnessScore);
    if (recentScoresRef.current.length > 3) {
      recentScoresRef.current.shift();
    }
    const smoothedScore = Math.round(
      recentScoresRef.current.reduce((a, b) => a + b, 0) / recentScoresRef.current.length
    );

    const smoothedResult = {
      ...result,
      sharpnessScore: smoothedScore,
    };

    setQuality(smoothedResult);
    return smoothedResult;
  }, [videoRef, threshold]);

  // Real-time evaluation loop
  useEffect(() => {
    if (!isStreaming || !enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Run first evaluation after short warm-up delay
    const initialTimeout = setTimeout(() => {
      evaluateFrame();
      timerRef.current = setInterval(evaluateFrame, intervalMs);
    }, 250);

    return () => {
      clearTimeout(initialTimeout);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isStreaming, enabled, intervalMs, evaluateFrame]);

  // On-demand frame check at snapshot time
  const checkCurrentFrame = useCallback(() => {
    return evaluateFrame();
  }, [evaluateFrame]);

  return {
    ...quality,
    checkCurrentFrame,
  };
}
