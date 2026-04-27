'use client';

/**
 * Dashboard Metrics Component
 *
 * High-level stats utilizing @tanstack/react-query hooks.
 */
import { useQuery } from '@tanstack/react-query';

import { fetchReports } from '@/lib/api';

const metricCards = [
  {
    key: 'totalReports',
    label: 'Total Reports',
    icon: '📊',
    gradient: 'from-brand-600/20 to-brand-800/20',
    border: 'border-brand-500/20',
    textColor: 'text-brand-300',
  },
  {
    key: 'piracyDetected',
    label: 'Piracy Detected',
    icon: '🚨',
    gradient: 'from-red-600/20 to-red-800/20',
    border: 'border-red-500/20',
    textColor: 'text-red-400',
  },
  {
    key: 'fairUseCleared',
    label: 'Fair Use Cleared',
    icon: '✅',
    gradient: 'from-green-600/20 to-green-800/20',
    border: 'border-green-500/20',
    textColor: 'text-green-400',
  },
  {
    key: 'takedownsDrafted',
    label: 'Takedowns Drafted',
    icon: '⚖️',
    gradient: 'from-amber-600/20 to-amber-800/20',
    border: 'border-amber-500/20',
    textColor: 'text-amber-400',
  },
  {
    key: 'pending',
    label: 'Pending Review',
    icon: '⏳',
    gradient: 'from-purple-600/20 to-purple-800/20',
    border: 'border-purple-500/20',
    textColor: 'text-purple-400',
  },
  {
    key: 'avgConfidence',
    label: 'Avg Match Confidence',
    icon: '🎯',
    gradient: 'from-cyan-600/20 to-cyan-800/20',
    border: 'border-cyan-500/20',
    textColor: 'text-cyan-400',
  },
];

export default function DashboardMetrics() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => fetchReports(1),
  });

  const reports = data?.results || [];

  const realReports = reports.filter((r) => typeof r.id === 'number');
  const resolvedClear = reports.filter(
    (r) => r.status === 'Resolved' || (r.match_confidence === 0 && r.status !== 'Dismissed')
  );
  const confidenceReports = reports.filter(
    (r) => r.match_confidence !== null && r.match_confidence > 0
  );

  const metrics: Record<string, number | string> = {
    totalReports: reports.filter((r) => r.match_confidence !== null).length,
    piracyDetected: realReports.filter((r) => !r.is_fair_use && (r.match_confidence ?? 0) > 0.5).length,
    fairUseCleared: reports.filter((r) => r.is_fair_use).length + resolvedClear.length,
    takedownsDrafted: reports.filter(
      (r) => r.status === 'Takedown_Drafted' || r.status === 'Takedown_Sent'
    ).length,
    pending: reports.filter((r) => r.status === 'Pending' && r.match_confidence === null).length,
    avgConfidence:
      confidenceReports.length > 0
        ? `${(confidenceReports.reduce((sum, r) => sum + (r.match_confidence ?? 0), 0) / confidenceReports.length * 100).toFixed(1)}%`
        : '—',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {metricCards.map((card, i) => (
        <div
          key={card.key}
          className={`metric-card bg-gradient-to-br ${card.gradient} border ${card.border}`}
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">{card.icon}</span>
            {isLoading && <div className="w-16 h-5 skeleton rounded" />}
          </div>
          <div>
            <p className="text-sm text-gray-400 mt-2">{card.label}</p>
            {isLoading ? (
              <div className="w-20 h-8 skeleton rounded mt-1" />
            ) : (
              <p className={`text-3xl font-bold ${card.textColor} mt-1`}>
                {metrics[card.key]}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
