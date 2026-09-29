import { DEFAULT_ORG_ID } from './api.js';

const DEFAULT_USER = {
  uid: 'local-bypass',
  email: 'tech@sitehunter.app',
  displayName: 'Field Technician',
  photoURL: null,
  role: 'admin',
  orgId: 'site-hunter',
};

let currentUser = { ...DEFAULT_USER };

/**
 * Returns current authenticated user
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Subscribe to auth state changes (invoked immediately with current user)
 */
export function onAuthChange(callback) {
  setTimeout(() => {
    callback(currentUser);
  }, 0);
  return () => {};
}

/**
 * Sync user session and auto-provision membership
 */
export async function syncUserSession(user = currentUser) {
  return {
    status: 'ok',
    orgId: user?.orgId || DEFAULT_ORG_ID,
    role: user?.role || 'admin',
  };
}

export const resolveOrgMembership = syncUserSession;

/**
 * Sign in handlers
 */
export async function signInWithGoogle() {
  currentUser = { ...DEFAULT_USER };
  return currentUser;
}

export async function signInWithMicrosoft() {
  currentUser = { ...DEFAULT_USER };
  return currentUser;
}

export async function handleRedirectAuthResult() {
  return currentUser;
}

/**
 * Sign out the current user
 */
export async function logOut() {
  sessionStorage.clear();
}

/**
 * Get user token for API calls
 */
export async function getIdToken() {
  return 'local-bearer-token';
}

/**
 * Get current organization ID
 */
export async function getOrgId() {
  return currentUser.orgId || DEFAULT_ORG_ID;
}
