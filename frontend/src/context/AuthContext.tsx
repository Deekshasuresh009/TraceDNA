'use client';

/**
 * TraceDNA Auth Context
 *
 * - Stores access token in React Context (NOT localStorage for security)
 * - Silent Refresh on Mount: useEffect calls /api/auth/refresh to persist across reloads
 * - Login function calls Next.js proxy which sets httpOnly refresh cookie
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { setAccessToken } from '@/lib/axios';

interface User {
  username: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync token with axios interceptor
  useEffect(() => {
    setAccessToken(accessToken);
  }, [accessToken]);

  // --- Silent Refresh on Mount ---
  useEffect(() => {
    const silentRefresh = async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setToken(data.access);
          setUser({ username: data.username || 'User' });
        }
      } catch {
        // No valid refresh token — user needs to log in
      } finally {
        setIsLoading(false);
      }
    };

    silentRefresh();
  }, []);

  // --- Login ---
  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Invalid credentials');
    }

    const data = await res.json();
    setToken(data.access);
    setUser({ username });
  }, []);

  // --- Signup ---
  const signup = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(error.detail || 'Registration failed');
    }

    const data = await res.json();
    setToken(data.access);
    setUser({ username });
  }, []);

  // --- Logout ---
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAccessToken(null);

    // Clear the httpOnly cookie by calling a logout endpoint
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!accessToken,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
