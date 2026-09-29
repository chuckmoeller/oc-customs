/**
 * Cryptographic & Hashing Utilities for Edge Asset Staging
 *
 * Implements deterministic SHA-256 digest computation using the Web Crypto API
 * (crypto.subtle) in browser environments with Node.js crypto fallback for SSR/testing.
 */

/**
 * Computes a hexadecimal SHA-256 hash string for an image binary input.
 * Supports:
 * - base64 string (with or without data URI prefix)
 * - Blob / File
 * - ArrayBuffer / Uint8Array
 *
 * @param {string|Blob|File|ArrayBuffer|Uint8Array} input
 * @returns {Promise<string>} 64-character lowercase hex digest
 */
export async function computeSha256(input) {
  let buffer;

  if (typeof input === 'string') {
    // Strip data URI prefix if present (e.g., data:image/jpeg;base64,...)
    const cleanBase64 = input.includes(',') ? input.split(',')[1] : input;

    // Convert base64 to ArrayBuffer
    if (typeof atob === 'function') {
      const binaryString = atob(cleanBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      buffer = bytes.buffer;
    } else {
      // Node.js environment
      const nodeBuf = globalThis.Buffer;
      buffer = nodeBuf.from(cleanBase64, 'base64');
    }
  } else if (input instanceof Blob) {
    buffer = await input.arrayBuffer();
  } else if (input instanceof Uint8Array) {
    buffer = input.buffer;
  } else if (input instanceof ArrayBuffer) {
    buffer = input;
  } else if (typeof globalThis.Buffer !== 'undefined' && globalThis.Buffer.isBuffer(input)) {
    buffer = input;
  } else {
    throw new TypeError('Unsupported input type for SHA-256 calculation');
  }

  // 1. Browser Web Crypto API
  if (
    typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof crypto.subtle.digest === 'function'
  ) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 2. Node.js Crypto fallback
  try {
    const nodeModuleName = 'crypto';
    const nodeCrypto = await import(/* @vite-ignore */ nodeModuleName);
    const nodeBuf = globalThis.Buffer;
    return nodeCrypto
      .createHash('sha256')
      .update(nodeBuf ? nodeBuf.from(buffer) : new Uint8Array(buffer))
      .digest('hex');
  } catch (err) {
    throw new Error(`SHA-256 digest unavailable in this environment: ${err.message}`, {
      cause: err,
    });
  }
}

/**
 * Returns a human-friendly abbreviated hash string (e.g. "a3b8...f9c2").
 *
 * @param {string} hash - 64-character hex string
 * @param {number} [prefixLen=4]
 * @param {number} [suffixLen=4]
 * @returns {string}
 */
export function formatSha256(hash, prefixLen = 4, suffixLen = 4) {
  if (!hash || typeof hash !== 'string' || hash.length <= prefixLen + suffixLen) {
    return hash || '';
  }
  return `${hash.slice(0, prefixLen)}...${hash.slice(-suffixLen)}`;
}
