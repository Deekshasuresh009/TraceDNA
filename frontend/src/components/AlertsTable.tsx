'use client';

/**
 * AlertsTable Component
 *
 * Data grid mapping PiracyReport data with DMCA generation via useMutation.
 * Triggers queryClient.invalidateQueries on success for instant UI update.
 * Includes a DMCA modal viewer for drafted notices.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { fetchReports, generateDMCA } from '@/lib/api';
import DualVideoPlayer from '@/components/DualVideoPlayer';
import type { PiracyReport, ReportStatus } from '@/lib/types';

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ReportStatus }) {
  const styles: Record<ReportStatus, string> = {
    Pending: 'status-pending',
    Takedown_Drafted: 'bg-orange-500/15 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
    Takedown_Sent: 'bg-red-500/15 text-red-400 border border-red-500/20 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
    Dismissed: 'bg-gray-500/15 text-gray-400 border border-gray-500/20 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
    Resolved: 'bg-green-500/15 text-green-400 border border-green-500/20 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
  };
  const labels: Record<ReportStatus, string> = {
    Pending: 'Pending',
    Takedown_Drafted: 'Takedown Drafted',
    Takedown_Sent: 'Takedown Sent',
    Dismissed: 'Dismissed',
    Resolved: 'Resolved',
  };
  return <span className={styles[status]}>{labels[status]}</span>;
}

// ─── Confidence Meter ─────────────────────────────────────────────────────────
export function ConfidenceMeter({ confidence }: { confidence: number | null }) {
  if (confidence === null || confidence === undefined) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 bg-surface-300 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 bg-brand-500/20" />
          <div className="h-full bg-brand-500 rounded-full animate-[pulse_1.5s_ease-in-out_infinite] w-full" />
        </div>
        <span className="text-sm font-mono text-brand-400 animate-pulse">Scanning...</span>
      </div>
    );
  }

  const percentage = confidence * 100;
  const color =
    percentage >= 85
      ? 'from-red-500 to-red-400'
      : percentage >= 60
        ? 'from-amber-500 to-amber-400'
        : 'from-green-500 to-green-400';

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-surface-300 rounded-full overflow-hidden relative">
        <div
          className={`absolute left-0 top-0 h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-mono text-gray-300">{percentage.toFixed(1)}%</span>
    </div>
  );
}

// ─── DMCA Modal ───────────────────────────────────────────────────────────────
function DMCAModal({ report, onClose }: { report: PiracyReport; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCopy = () => {
    if (report.dmca_draft) {
      navigator.clipboard.writeText(report.dmca_draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col glass-card border border-white/10 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10 bg-gradient-to-r from-orange-500/10 to-red-500/5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">⚖️</span>
              <h2 className="text-xl font-bold text-white">DMCA Takedown Notice</h2>
            </div>
            <p className="text-sm text-gray-400">
              AI-generated legal notice for:{' '}
              <span className="text-orange-400 font-medium truncate">
                {report.suspect_video_title}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta info bar */}
        <div className="flex items-center gap-6 px-6 py-3 bg-white/[0.03] border-b border-white/5 text-xs text-gray-500 flex-wrap">
          <span>
            🎯 Match confidence:{' '}
            <span className="text-red-400 font-semibold">
              {report.match_confidence !== null ? `${(report.match_confidence * 100).toFixed(1)}%` : 'N/A'}
            </span>
          </span>
          <span>
            📅 Generated:{' '}
            <span className="text-gray-300">{new Date(report.updated_at || report.created_at).toLocaleDateString()}</span>
          </span>
          <span>
            📋 Status:{' '}
            <span className="text-orange-400 font-semibold">Takedown Drafted</span>
          </span>
        </div>

        {/* DMCA Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {report.dmca_draft ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed bg-black/30 border border-white/5 rounded-xl p-5 select-text">
              {report.dmca_draft}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <span className="text-4xl mb-3">📄</span>
              <p className="font-medium">No DMCA draft available yet</p>
              <p className="text-sm mt-1">The draft may still be generating. Please try again shortly.</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between p-4 border-t border-white/10 bg-black/20">
          <p className="text-xs text-gray-600">
            ⚠️ Review before sending. AI-generated drafts may need legal review.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="btn-ghost text-sm px-4 py-2"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              disabled={!report.dmca_draft}
              className="btn-primary text-sm px-5 py-2 inline-flex items-center gap-2 disabled:opacity-50"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy to Clipboard
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AlertsTable() {
  const [page, setPage] = useState(1);
  const [viewingDMCA, setViewingDMCA] = useState<PiracyReport | null>(null);
  const [viewingMatch, setViewingMatch] = useState<PiracyReport | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reports', page],
    queryFn: () => fetchReports(page),
    refetchInterval: 5000,
  });

  const dmcaMutation = useMutation({
    mutationFn: (reportId: number) => generateDMCA(reportId),
    onSuccess: (responseData) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      // Auto-open the modal with the freshly generated DMCA
      if (responseData?.report) {
        setViewingDMCA(responseData.report);
      }
    },
  });

  const reports = data?.results || [];

  if (isLoading) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Piracy Alerts</h2>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 py-4 border-b border-white/5">
              <div className="w-1/4 h-5 skeleton rounded" />
              <div className="w-1/4 h-5 skeleton rounded" />
              <div className="w-1/6 h-5 skeleton rounded" />
              <div className="w-1/6 h-5 skeleton rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>  
      {/* DMCA Viewer Modal */}
      {viewingDMCA && (
        <DMCAModal report={viewingDMCA} onClose={() => setViewingDMCA(null)} />
      )}

      {/* Gotcha Player */}
      {viewingMatch && (
        <DualVideoPlayer report={viewingMatch} onClose={() => setViewingMatch(null)} />
      )}

      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Piracy Alerts</h2>
            <p className="text-sm text-gray-500 mt-0.5">{data?.count || 0} reports found</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                <th className="text-left px-6 py-4 font-medium">Source Video</th>
                <th className="text-left px-6 py-4 font-medium">Suspect Video</th>
                <th className="text-left px-6 py-4 font-medium">Confidence</th>
                <th className="text-left px-6 py-4 font-medium">Fair Use</th>
                <th className="text-left px-6 py-4 font-medium">Status</th>
                <th className="text-left px-6 py-4 font-medium">Date</th>
                <th className="text-right px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report: PiracyReport) => (
                <tr key={report.id} className="table-row">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      <span className="text-gray-200 truncate max-w-[180px]">
                        {report.source_video_title}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-gray-200 truncate max-w-[180px]">
                        {report.suspect_video_title}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <ConfidenceMeter confidence={report.match_confidence} />
                  </td>
                  <td className="px-6 py-4">
                    {report.match_confidence === null ? (
                      <span className="text-gray-500 italic">Scanning...</span>
                    ) : report.match_confidence === 0 ? (
                      report.status === 'Dismissed' ? (
                        <span className="text-gray-500 font-medium">⚠ Failed</span>
                      ) : (
                        <span className="text-green-400 font-medium">✓ Clear</span>
                      )
                    ) : report.is_fair_use ? (
                      <span className="text-green-400 font-medium border border-green-500/20 px-2 py-1 bg-green-500/10 rounded">
                        ✓ Fair Use
                      </span>
                    ) : (
                      <span className="text-red-400 font-bold border border-red-500/20 px-2 py-1 bg-red-500/10 rounded">
                        ✗ Piracy
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={report.status} />
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-xs font-mono">
                    {new Date(report.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {/* View Match (Gotcha Player) — for high confidence piracy reports */}
                  {typeof report.id === 'number' &&
                   (report.match_confidence ?? 0) > 0 &&
                   report.match_confidence !== null && (
                    <button
                      onClick={() => setViewingMatch(report)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-400/40 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-all duration-150 mb-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      View Match
                    </button>
                  )}

                  {/* Draft DMCA button — only for real, unresolved piracy reports */}
                    {report.status === 'Pending' && !report.is_fair_use && typeof report.id === 'number' && (
                      <button
                        onClick={() => dmcaMutation.mutate(report.id as number)}
                        disabled={dmcaMutation.isPending}
                        className="btn-danger text-xs !px-4 !py-1.5 inline-flex items-center gap-1.5"
                      >
                        {dmcaMutation.isPending ? (
                          <>
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Drafting...
                          </>
                        ) : (
                          'Draft DMCA'
                        )}
                      </button>
                    )}

                    {/* View DMCA button — for drafted/sent reports */}
                    {(report.status === 'Takedown_Drafted' || report.status === 'Takedown_Sent') && (
                      <button
                        onClick={() => setViewingDMCA(report)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 border border-orange-500/20 hover:border-orange-400/40 bg-orange-500/10 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg transition-all duration-150"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        View DMCA
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-500">
                    <div className="text-4xl mb-3">🛡️</div>
                    <p className="font-medium">No piracy reports yet</p>
                    <p className="text-sm mt-1">Upload source content and scan suspect URLs to get started.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && (data.next || data.previous) && (
          <div className="p-4 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!data.previous}
              className="btn-ghost text-xs disabled:opacity-30"
            >
              ← Previous
            </button>
            <span className="text-xs text-gray-500">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.next}
              className="btn-ghost text-xs disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
