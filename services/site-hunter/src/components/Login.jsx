import React, { useState, useEffect } from 'react';
import {
  signInWithGoogle,
  signInWithMicrosoft,
  handleRedirectAuthResult,
} from '../services/auth.js';

export default function Login() {
  const [loadingProvider, setLoadingProvider] = useState(null); // 'google' | 'microsoft' | null
  const [error, setError] = useState(null);

  // Check if returning from a mobile redirect sign-in flow
  useEffect(() => {
    handleRedirectAuthResult().catch((err) => {
      console.error('[Login] Redirect sign-in error:', err);
      setError(err.message || 'Failed to complete redirect sign-in.');
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setLoadingProvider('google');
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('[Login] Google sign-in failed:', err);
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setLoadingProvider('microsoft');
    setError(null);
    try {
      await signInWithMicrosoft();
    } catch (err) {
      console.error('[Login] Microsoft sign-in failed:', err);
      setError(err.message || 'Microsoft sign-in failed. Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1419] px-4 py-8">
      <div className="max-w-md w-full space-y-8 bg-[#121B28] border border-gray-700/70 rounded-2xl p-8 shadow-2xl">
        {/* Header & Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#67986A]/15 border border-[#67986A]/40 text-[#67986A] text-xs font-semibold tracking-wide uppercase">
            <span>Site Hunter 2.0</span>
            <span>•</span>
            <span>Enterprise SSO</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight">MADISON SITE HUNTER</h1>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">
            Field Equipment Scanner & AI Spec Engine. Sign in using your corporate account to
            continue.
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-red-950/60 border border-red-800 text-red-300 rounded-xl p-3.5 text-xs flex items-start justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-red-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-white p-0.5 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* OAuth SSO Buttons */}
        <div className="space-y-3.5 pt-2">
          {/* Google Sign-in */}
          <button
            onClick={handleGoogleSignIn}
            disabled={!!loadingProvider}
            type="button"
            className="w-full flex items-center justify-center gap-3 bg-[#1A2332] hover:bg-[#223044] active:bg-[#16202e] border border-gray-600/80 hover:border-gray-500 rounded-xl px-5 py-3.5 text-gray-100 font-medium text-sm transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-[#67986A]/50"
          >
            {loadingProvider === 'google' ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>
              {loadingProvider === 'google' ? 'Connecting to Google…' : 'Sign in with Google'}
            </span>
          </button>

          {/* Microsoft Sign-in */}
          <button
            onClick={handleMicrosoftSignIn}
            disabled={!!loadingProvider}
            type="button"
            className="w-full flex items-center justify-center gap-3 bg-[#1A2332] hover:bg-[#223044] active:bg-[#16202e] border border-gray-600/80 hover:border-gray-500 rounded-xl px-5 py-3.5 text-gray-100 font-medium text-sm transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-[#67986A]/50"
          >
            {loadingProvider === 'microsoft' ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
            )}
            <span>
              {loadingProvider === 'microsoft'
                ? 'Connecting to Microsoft…'
                : 'Sign in with Microsoft'}
            </span>
          </button>
        </div>

        {/* Footer Security Notice */}
        <div className="pt-3 border-t border-gray-700/50 text-center">
          <p className="text-xs text-gray-500">
            Sign in with your authorized Google Workspace or Microsoft 365 Entra ID corporate
            account.
          </p>
        </div>
      </div>
    </div>
  );
}
