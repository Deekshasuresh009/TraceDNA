'use client';

/**
 * Patrol Scanner Page — Scan suspect URLs
 */
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import Sidebar from '@/components/Sidebar';
import { ConfidenceMeter } from '@/components/AlertsTable';
import { useAuth } from '@/context/AuthContext';
import { fetchReports, scanUrl } from '@/lib/api';

export default function PatrolPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [suspectUrl, setSuspectUrl] = useState('');
  const [sourceVideoTitle, setSourceVideoTitle] = useState('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);
  
  const { data: reportsData, isLoading: isLoadingReports } = useQuery({
    queryKey: ['reports'],
    queryFn: () => fetchReports(1),
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const scanMutation = useMutation({
    mutationFn: () => scanUrl(suspectUrl, sourceVideoTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setSuspectUrl('');
      setSourceVideoTitle('');
    },
  });

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
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Patrol Scanner</h1>
            <p className="text-gray-500 mt-1">
              Scan suspect URLs to detect unauthorized copies of your content
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div className="glass-card p-8">
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-6">New Scan Objective</h2>
                </div>
                {/* Source Video Title */}
                <div>
                  <label htmlFor="patrol-source-title" className="block text-sm font-medium text-gray-400 mb-2">
                    Source Video Title
                  </label>
                  <input
                    id="patrol-source-title"
                    type="text"
                    value={sourceVideoTitle}
                    onChange={(e) => setSourceVideoTitle(e.target.value)}
                    className="input-field"
                    placeholder="e.g. UFC 300 Promo"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    The title of the source video (from Vault)
                  </p>
                </div>

                {/* Suspect URL */}
                <div>
                  <label htmlFor="patrol-suspect-url" className="block text-sm font-medium text-gray-400 mb-2">
                    Suspect URL
                  </label>
                  <div className="relative">
                    <input
                      id="patrol-suspect-url"
                      type="url"
                      value={suspectUrl}
                      onChange={(e) => setSuspectUrl(e.target.value)}
                      className="input-field !pr-10"
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>
                </div>

                {/* Success */}
                {scanMutation.isSuccess && (
                  <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-xs text-green-400 animate-fade-in">
                    ✓ Scan queued! Check logs and table below.
                  </div>
                )}

                {/* Error */}
                {scanMutation.isError && (
                  <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 animate-fade-in">
                    Scan failed: {((scanMutation.error as any).response?.data?.error) || (scanMutation.error as Error).message}
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={() => scanMutation.mutate()}
                  disabled={!suspectUrl || !sourceVideoTitle || scanMutation.isPending}
                  className="btn-primary w-full flex items-center justify-center gap-2 !py-3"
                >
                  {scanMutation.isPending ? 'Initiating Scan...' : 'Launch Patrol Scan'}
                </button>
              </div>
            </div>
            
            <div className="glass-card p-8 flex flex-col justify-center items-center text-center">
              <svg className="w-16 h-16 text-brand-500/50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <h3 className="text-lg font-bold text-brand-300">SSRF Protection Active</h3>
              <p className="text-sm text-gray-500 mt-2">
                All URLs are dynamically validated against IP-literal blocklists and domain allowlists before any processing is conducted inside the container.
              </p>
            </div>
          </div>
          
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">Recent Patrol Scans</h2>
            <p className="text-gray-500 text-sm mt-1">Live tracking of ongoing AI analyses</p>
          </div>
          
          <div className="glass-card overflow-hidden">
            {isLoadingReports ? (
              <div className="p-8 text-center text-gray-500">Loading patrol history...</div>
            ) : reportsData?.results?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No scans conducted yet.</div>
            ) : (
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="text-xs uppercase bg-white/5 text-gray-300">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-semibold">Report ID</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Suspect URL</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Confidence</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {reportsData?.results?.slice(0, 5).map((report: any) => (
                    <tr key={report.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-white font-medium">#{report.id}</td>
                      <td className="px-6 py-4 text-gray-300 truncate max-w-xs">{report.original_suspect_url}</td>
                      <td className="px-6 py-4">
                         <ConfidenceMeter confidence={report.match_confidence} />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border
                          ${report.status === 'Takedown_Drafted' || report.status === 'Needs_Review' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
                            report.status === 'Resolved' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                          {report.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
