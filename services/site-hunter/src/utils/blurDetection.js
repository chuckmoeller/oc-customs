/**
 * Core Computer Vision & Image Quality Engine
 *
 * Implements client-side Laplacian Variance calculations on HTML5 Canvas image buffers.
 * Provides real-time edge sharpness quantification for camera viewfinders and static images.
 *
 * Mathematical Foundation:
 * Let I(x, y) represent a 2D grayscale intensity matrix.
 * The discrete Laplacian operator calculates second-order spatial derivatives:
 *   L(x, y) = I(x+1, y) + I(x-1, y) + I(x, y+1) + I(x, y-1) - 4 * I(x, y)
 *
 * The variance of the Laplacian:
 *   Var(L) = (1/N) * sum((L(x, y) - mean(L))^2)
 *
 * High variance indicates sharp high-frequency edge gradients (in-focus).
 * Low variance indicates smooth, attenuated edge gradients (out-of-focus or motion blur).
 */

/**
 * Standard 4-connectivity discrete Laplacian kernel weights
 */
export const LAPLACIAN_4_KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0];

/**
 * Computes the Laplacian variance of an RGBA ImageData buffer.
 *
 * @param {ImageData} imageData - Canvas ImageData object with width, height, and data
 * @returns {number} The Laplacian variance (sharpness score)
 */
export function computeLaplacianVariance(imageData) {
  if (!imageData || !imageData.data || imageData.width < 3 || imageData.height < 3) {
    return 0;
  }

  const { width, height, data } = imageData;
  const numPixels = width * height;

  // 1. Convert to grayscale intensity array: Y = 0.299*R + 0.587*G + 0.114*B
  const gray = new Float32Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

  // 2. Convolve with discrete Laplacian kernel
  const innerWidth = width - 2;
  const innerHeight = height - 2;
  const innerPixels = innerWidth * innerHeight;

  if (innerPixels <= 0) return 0;

  const laplacian = new Float32Array(innerPixels);
  let sum = 0;
  let idx = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const rowAbove = (y - 1) * width;
    const rowBelow = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      // 4-neighbor discrete Laplacian: (up + down + left + right) - 4 * center
      const val =
        gray[rowAbove + x] +
        gray[rowBelow + x] +
        gray[rowOffset + (x - 1)] +
        gray[rowOffset + (x + 1)] -
        4.0 * gray[rowOffset + x];

      laplacian[idx] = val;
      sum += val;
      idx++;
    }
  }

  // 3. Compute mean of Laplacian responses
  const mean = sum / innerPixels;

  // 4. Compute variance of Laplacian responses
  let varianceSum = 0;
  for (let i = 0; i < innerPixels; i++) {
    const diff = laplacian[i] - mean;
    varianceSum += diff * diff;
  }

  return varianceSum / innerPixels;
}

/**
 * Calculates average luminance across an ImageData buffer.
 *
 * @param {ImageData} imageData
 * @returns {number} Average brightness (0 - 255)
 */
export function computeAverageBrightness(imageData) {
  if (!imageData || !imageData.data) return 0;
  const { data } = imageData;
  const len = data.length;
  let sum = 0;
  const pixelCount = len / 4;

  for (let i = 0; i < len; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  return pixelCount > 0 ? sum / pixelCount : 0;
}

/**
 * Analyzes video or canvas frame quality with threshold classification.
 *
 * @param {HTMLCanvasElement|CanvasRenderingContext2D|ImageData} source
 * @param {object} options
 * @param {number} [options.threshold=100] - Minimum Laplacian variance for sharp focus
 * @param {number} [options.minBrightness=35] - Minimum brightness to avoid under-exposure
 * @param {number} [options.maxBrightness=245] - Maximum brightness to avoid over-exposure
 * @param {number} [options.analysisWidth=320] - Downscaled width for 60fps real-time sampling
 * @param {number} [options.analysisHeight=240] - Downscaled height for 60fps real-time sampling
 * @returns {object} Detailed quality assessment
 */
export function analyzeFrameQuality(source, options = {}) {
  const {
    threshold = 100,
    minBrightness = 35,
    maxBrightness = 245,
    analysisWidth: _analysisWidth = 320,
    analysisHeight: _analysisHeight = 240,
  } = options;

  let imageData = null;

  if (source && typeof source.getImageData === 'function') {
    // Context2D
    imageData = source.getImageData(0, 0, source.canvas.width, source.canvas.height);
  } else if (source && source.width && source.height && source.data) {
    // Direct ImageData
    imageData = source;
  } else if (source && source.getContext) {
    // Canvas element
    const ctx = source.getContext('2d');
    imageData = ctx.getImageData(0, 0, source.width, source.height);
  }

  if (!imageData) {
    return {
      variance: 0,
      sharpnessScore: 0,
      brightness: 0,
      isSharp: false,
      isBlurry: true,
      isLowLight: false,
      isOverExposed: false,
      status: 'blurry',
      feedbackMessage: 'No image data available',
      color: '#EF4444', // Red
    };
  }

  const variance = computeLaplacianVariance(imageData);
  const brightness = computeAverageBrightness(imageData);

  const isLowLight = brightness < minBrightness;
  const isOverExposed = brightness > maxBrightness;
  const isSharp = variance >= threshold && !isLowLight && !isOverExposed;
  const isBlurry = !isSharp;

  // Normalized sharpness score (0 - 100 for intuitive UI progress meters)
  const normalizedScore = Math.min(100, Math.round((variance / (threshold * 2.5)) * 100));

  let status;
  let feedbackMessage;
  let color;

  if (isLowLight) {
    status = 'low_light';
    feedbackMessage = 'Low Light - Add Illumination';
    color = '#F59E0B'; // Amber-500
  } else if (isOverExposed) {
    status = 'over_exposed';
    feedbackMessage = 'Glare Detected - Angle Camera';
    color = '#F59E0B'; // Amber-500
  } else if (variance < threshold * 0.5) {
    status = 'severely_blurry';
    feedbackMessage = 'Image Blurry - Hold Steady';
    color = '#EF4444'; // Red-500
  } else if (variance < threshold) {
    status = 'slightly_blurry';
    feedbackMessage = 'Stabilizing - Hold Camera Closer';
    color = '#F59E0B'; // Amber-500
  } else {
    status = 'optimal';
    feedbackMessage = 'Optimal Focus - Ready';
    color = '#22C55E'; // Green-500
  }

  return {
    variance: Math.round(variance * 10) / 10,
    sharpnessScore: normalizedScore,
    brightness: Math.round(brightness),
    threshold,
    isSharp,
    isBlurry,
    isLowLight,
    isOverExposed,
    status,
    feedbackMessage,
    color,
  };
}
