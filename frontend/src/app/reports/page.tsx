'use client';

/**
 * Reports Page — Full alerts table
 */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import AlertsTable from '@/components/AlertsTable';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/context/AuthContext';

export default function ReportsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:ml-64 pb-20 md:pb-8 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Alerts & Reports</h1>
            <p className="text-gray-500 mt-1">
              Review piracy analysis results and manage DMCA takedowns
            </p>
          </div>
          <AlertsTable />
        </div>
      </main>
    </div>
  );
}
