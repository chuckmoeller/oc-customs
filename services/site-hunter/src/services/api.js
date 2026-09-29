export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://129.153.131.221:8080';
export const DEFAULT_ORG_ID = import.meta.env.VITE_DEFAULT_ORG_ID || '0ee8e0c9-be4c-5321-9f6c-ff8284325133';

/**
 * Returns full URL for images stored in relative /storage/ paths.
 */
export function getImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = API_BASE_URL.replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

/**
 * Centralized fetch client for FastAPI backend.
 * Automatically prepends API_BASE_URL and attaches organization headers.
 */
export async function apiFetch(path, options = {}) {
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${API_BASE_URL.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = {
    'X-Org-Id': DEFAULT_ORG_ID,
    ...(options.headers || {}),
  };

  // Only set application/json if not sending FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
