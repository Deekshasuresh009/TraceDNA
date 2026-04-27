'use client';

/**
 * Notifications Page
 *
 * Displays all auto-patrol piracy detection alerts.
 * Shows confidence scores, suspect URLs, and links to Reports & DMCA.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';

interface Notification {
  id: number;
  notification_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  report_id: number | null;
  source_video_title: string | null;
  match_confidence: number | null;
  suspect_url: string | null;
}

export default function NotificationsPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  const fetchNotifications = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.results || []);
      }
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [accessToken]);

  const markAllRead = async () => {
    if (!accessToken) return;
    setIsMarkingRead(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } finally {
      setIsMarkingRead(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen md:ml-64 pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              🔔 Piracy Alerts
              {unreadCount > 0 && (
                <span className="px-3 py-1 text-sm bg-red-500/20 border border-red-500/30 text-red-400 rounded-full font-semibold">
                  {unreadCount} new
                </span>
              )}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Auto-patrol scan results — YouTube piracy detections
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={isMarkingRead}
              className="btn-ghost text-sm flex items-center gap-2"
            >
              {isMarkingRead ? 'Marking...' : '✓ Mark all read'}
            </button>
          )}
        </div>

        {/* Notification List */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card p-5 animate-pulse">
                <div className="h-4 skeleton rounded w-3/4 mb-3" />
                <div className="h-3 skeleton rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <div className="text-5xl mb-4">🛡️</div>
            <h2 className="text-xl font-semibold text-white mb-2">All clear!</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              No piracy alerts yet. TraceDNA will automatically scan YouTube every 6 hours
              for your protected content and notify you here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => {
              const confidence = notif.match_confidence
                ? Math.round(notif.match_confidence * 100)
                : null;
              const isHigh = (confidence ?? 0) >= 85;
              const isMedium = (confidence ?? 0) >= 60 && (confidence ?? 0) < 85;

              return (
                <div
                  key={notif.id}
                  className={`glass-card p-5 border transition-all duration-200 ${
                    !notif.is_read
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-white/5'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      !notif.is_read ? 'bg-red-500/20' : 'bg-gray-700/40'
                    }`}>
                      <span className="text-lg">⚠️</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-relaxed ${
                        !notif.is_read ? 'text-white' : 'text-gray-300'
                      }`}>
                        {notif.message}
                      </p>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {confidence !== null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            isHigh
                              ? 'text-red-400 bg-red-500/15 border-red-500/30'
                              : isMedium
                              ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
                              : 'text-green-400 bg-green-500/15 border-green-500/30'
                          }`}>
                            {confidence}% match
                          </span>
                        )}
                        {notif.source_video_title && (
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">
                            📹 {notif.source_video_title}
                          </span>
                        )}
                        <span className="text-xs text-gray-600">
                          {new Date(notif.created_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Suspect URL */}
                      {notif.suspect_url && (
                        <a
                          href={notif.suspect_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-400 hover:text-brand-300 transition-colors mt-1 block truncate"
                        >
                          🔗 {notif.suspect_url}
                        </a>
                      )}
                    </div>

                    {/* Action */}
                    {notif.report_id && (
                      <Link
                        href="/reports"
                        className="btn-danger text-xs !px-4 !py-2 flex-shrink-0 flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        View Report
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
