import { apiFetch } from './api.js';

/**
 * Upload an image to FastAPI storage backend (/api/upload)
 * Saves to persistent local Docker volume (/app/storage/photos)
 *
 * @param {Blob|File} imageBlob - The image file or blob to upload
 * @param {string} [filename] - Optional filename (defaults to timestamp.jpg)
 * @returns {Promise<{ url: string, path: string, bucket: string, size: number }>}
 */
export async function uploadScanImage(imageBlob, filename) {
  const timestamp = Date.now();
  const name = filename || `${timestamp}.jpg`;

  const formData = new FormData();
  formData.append('file', imageBlob, name);

  const res = await apiFetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to upload photo: ${res.status} ${errorText}`);
  }

  const data = await res.json();

  return {
    url: data.url,
    path: data.path || data.url,
    bucket: 'local-disk',
    size: data.size || (imageBlob.size ?? 0),
  };
}

/**
 * Convert a base64 image string to a Blob for upload
 * @param {string} base64String - The base64 image (with or without data: prefix)
 * @returns {Blob}
 */
export function base64ToBlob(base64String) {
  if (!base64String) return new Blob([], { type: 'image/jpeg' });

  // Strip data URL prefix if present
  const base64Data = base64String.includes(',')
    ? base64String.split(',')[1]
    : base64String;

  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  // Detect MIME type from data URL or default to jpeg
  const mimeType = base64String.includes('data:')
    ? base64String.split(';')[0].split(':')[1]
    : 'image/jpeg';

  return new Blob([byteArray], { type: mimeType });
}
