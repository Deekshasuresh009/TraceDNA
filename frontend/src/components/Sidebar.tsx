'use client';

/**
 * Sidebar Navigation Component
 * Includes live notification bell for auto-patrol piracy alerts.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/vault',
    label: 'Content Vault',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
    ),
  },
  {
    href: '/patrol',
    label: 'Patrol Scanner',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
    ),
  },
  {
    href: '/reports',
    label: 'Alerts & Reports',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },

  {
    href: '/live',
    label: 'Live Event Shield',
    badge: 'LIVE',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
      </svg>
    ),
  },
];

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, accessToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll for unread notifications every 30 seconds
  useEffect(() => {
    if (!accessToken) return;

    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.unread_count || 0);
        }
      } catch {
        // Silently ignore network errors
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-surface-50/60 backdrop-blur-xl border-r border-white/5 flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">TraceDNA</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Digital Rights Shield</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20 shadow-lg shadow-brand-500/5'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              `}
            >
              {item.icon}
              {item.label}
              {(item as any).badge && (
                <span className="ml-auto text-[9px] font-black tracking-widest text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded border border-red-500/30 animate-pulse">
                  {(item as any).badge}
                </span>
              )}
              {isActive && !(item as any).badge && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              )}
            </Link>
          );
        })}

        {/* Notifications Link */}
        <Link
          href="/notifications"
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname === '/notifications'
              ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20 shadow-lg shadow-brand-500/5'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <div className="relative">
            <BellIcon />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          Notifications
          {unreadCount > 0 && (
            <span className="ml-auto text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-500/20">
              {unreadCount}
            </span>
          )}
        </Link>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{user?.username || 'Guest'}</p>
            <p className="text-xs text-gray-500">Analyst</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Sign Out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-surface-50/90 backdrop-blur-xl border-t border-white/5 z-50">
        <ul className="flex justify-around items-center h-16 px-2 w-full">
          {[...navItems, { href: '/notifications', label: 'Alerts', icon: (
            <div className="relative">
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
          )}].map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`flex flex-col items-center justify-center h-full w-full gap-1 ${
                    isActive ? 'text-brand-400' : 'text-gray-500'
                  }`}
                >
                  <div className={`p-1.5 rounded-xl ${isActive ? 'bg-brand-500/20 text-brand-300' : ''}`}>
                    {item.icon}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
// end of file

