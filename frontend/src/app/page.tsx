'use client';

/**
 * Landing/Redirect Page
 * Redirects to dashboard if authenticated, login if not.
 */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? '/dashboard' : '/login');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}
