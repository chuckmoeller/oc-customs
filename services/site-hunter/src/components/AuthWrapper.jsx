import React, { useState, useEffect } from 'react';
import { onAuthChange, syncUserSession } from '../services/auth.js';

/**
 * Wraps the application and provisions the default authenticated field technician
 * user session connected to the OCI PostgreSQL backend.
 */
export default function AuthWrapper({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (activeUser) => {
      if (activeUser) {
        const session = await syncUserSession(activeUser);
        setUser({
          ...activeUser,
          orgId: session.orgId,
          role: session.role,
        });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1419]">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-3 border-[#67986A] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm font-medium tracking-wide">Loading Site Hunter...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child, { user }) : child
      )}
    </>
  );
}
