'use client';

/**
 * Live Event Shield — Real-Time Pirate Stream Radar
 * Monitors YouTube for unauthorized re-streams of protected live events.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface LiveStrike {
  id: number;
  youtube_video_id: string;
  url: string;
  title: string;
  channel_name: string;
  detected_at: string;
  visual_confidence?: number;
  is_visual_match?: boolean;
  detection_method?: string;
}

interface Campaign {
  id: number;
  title: string;
  search_keywords: string;
  official_stream_url?: string;
  visual_patrol_enabled?: boolean;
  status: 'Active' | 'Terminated';
  created_at: string;
  last_scanned_at: string | null;
  strikes: LiveStrike[];
}

export default function LiveShieldPage() {
  const { isAuthenticated, isLoading, accessToken } = useAuth();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [eventTitle, setEventTitle] = useState('');
  const [keywords, setKeywords] = useState('');
  const [officialStreamUrl, setOfficialStreamUrl] = useState('');
  const [visualMode, setVisualMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [newStrikes, setNewStrikes] = useState<Set<number>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${API_BASE}/live/`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.results || data);
      }
    } catch (e) {
      console.error('Failed to fetch campaigns', e);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchCampaigns();
  }, [accessToken]);

  // Auto-scan active campaigns every 45 seconds
  useEffect(() => {
    if (!accessToken) return;
    intervalRef.current = setInterval(async () => {
      const active = campaigns.filter(c => c.status === 'Active');
      for (const campaign of active) {
        await runScan(campaign.id, true);
      }
    }, 45000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [campaigns, accessToken]);

  const createCampaign = async () => {
    if (!eventTitle.trim() || !keywords.trim()) return;
    setIsCreating(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/live/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          title: eventTitle,
          search_keywords: keywords,
          official_stream_url: officialStreamUrl || null,
          visual_patrol_enabled: visualMode,
        }),
      });
      if (!res.ok) throw new Error('Failed to create campaign');
      setEventTitle('');
      setKeywords('');
      await fetchCampaigns();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsCreating(false);
    }
  };

  const autoFillMetadata = async () => {
    if (!officialStreamUrl.trim()) return;
    setIsExtracting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/live/extract_metadata/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: officialStreamUrl }),
      });
      if (!res.ok) throw new Error('Could not extract metadata from this URL');
      const data = await res.json();
      if (data.title) setEventTitle(data.title);
      if (data.keywords) setKeywords(data.keywords);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const runScan = async (id: number, silent = false) => {
    if (!silent) setScanningId(id);
    try {
      const res = await fetch(`${API_BASE}/live/${id}/scan/`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        const updated: Campaign = data.campaign;
        setCampaigns(prev => prev.map(c => c.id === id ? updated : c));

        // Highlight newly detected strikes
        const ids = updated.strikes.map((s: LiveStrike) => s.id);
        setNewStrikes(prev => new Set([...Array.from(prev), ...ids]));
        setTimeout(() => setNewStrikes(prev => {
          const next = new Set(prev);
          ids.forEach(i => next.delete(i));
          return next;
        }), 8000);
      }
    } catch (e) {
      console.error('Scan failed', e);
    } finally {
      if (!silent) setScanningId(null);
    }
  };

  const terminateCampaign = async (id: number) => {
    await fetch(`${API_BASE}/live/${id}/terminate/`, {
      method: 'POST',
      headers: authHeaders,
    });
    fetchCampaigns();
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'Active');
  const totalStrikes = campaigns.reduce((acc, c) => acc + c.strikes.length, 0);

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
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-white">Live Event Shield</h1>
                <span className="px-2 py-0.5 text-[10px] font-black tracking-widest bg-red-500/20 text-red-400 border border-red-500/30 rounded animate-pulse">LIVE</span>
              </div>
              <p className="text-gray-500">Real-time radar that detects unauthorized YouTube re-streams of your protected events</p>
            </div>
            {/* Stats */}
            <div className="hidden md:flex gap-4">
              <div className="glass-card px-5 py-3 text-center">
                <p className="text-2xl font-bold text-green-400">{activeCampaigns.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Active Shields</p>
              </div>
              <div className="glass-card px-5 py-3 text-center">
                <p className="text-2xl font-bold text-red-400">{totalStrikes}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total Strikes</p>
              </div>
            </div>
          </div>

          {/* New Campaign Form */}
          <div className="glass-card p-6 mb-8">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
              Activate New Event Shield
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Event Name</label>
                <input
                  id="live-event-title"
                  type="text"
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  className="input-field"
                  placeholder="e.g. UFC 300, IPL Match, Coldplay Concert"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Search Keywords (comma-separated)</label>
                <input
                  id="live-keywords"
                  type="text"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  className="input-field"
                  placeholder="e.g. ufc 300, makhachev, live fight stream"
                />
              </div>
            </div>

            {/* Official Stream URL — Visual Mode */}
            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">🎯 Visual Fingerprint Mode</p>
                  <p className="text-xs text-gray-500 mt-0.5">TraceDNA will watch your official stream and visually compare frames against suspect streams</p>
                </div>
                <button
                  id="visual-mode-toggle"
                  onClick={() => setVisualMode(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${visualMode ? 'bg-brand-500' : 'bg-white/10'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${visualMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {visualMode && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                    Official Live Stream URL
                    <button
                      onClick={autoFillMetadata}
                      disabled={isExtracting || !officialStreamUrl.trim()}
                      className="text-xs font-bold text-brand-400 hover:text-brand-300 flex items-center gap-1.5 transition-all duration-200 disabled:opacity-30 bg-brand-500/10 hover:bg-brand-500/20 px-3 py-1.5 rounded-full border border-brand-500/20"
                    >
                      {isExtracting ? (
                        <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Magic...</>
                      ) : (
                        <>✨ Magic Auto-Fill</>
                      )}
                    </button>
                  </label>
                  <input
                    id="official-stream-url"
                    type="url"
                    value={officialStreamUrl}
                    onChange={e => setOfficialStreamUrl(e.target.value)}
                    className="input-field"
                    placeholder="https://www.youtube.com/watch?v=YOUR_OFFICIAL_LIVE or HLS/m3u8 URL"
                  />
                  <p className="text-xs text-gray-600 mt-2">⚡ TraceDNA will extract frames from this URL every scan cycle and compare them pixel-by-pixel against each suspect stream</p>
                </div>
              )}
            </div>
            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}
            <button
              id="activate-shield-btn"
              onClick={createCampaign}
              disabled={isCreating || !eventTitle.trim() || !keywords.trim()}
              className="btn-primary mt-5 flex items-center gap-2"
            >
              {isCreating ? (
                <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Activating...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg>Activate Live Shield</>
              )}
            </button>
          </div>

          {/* Active Campaigns */}
          {campaigns.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-5xl mb-4">📡</div>
              <p className="text-gray-400 font-medium">No active shields yet.</p>
              <p className="text-gray-600 text-sm mt-1">Create one above to start monitoring live streams.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {campaigns.map(campaign => (
                <div key={campaign.id} className={`glass-card overflow-hidden border transition-all duration-500 ${campaign.status === 'Active' ? 'border-green-500/20' : 'border-white/5 opacity-60'}`}>
                  {/* Campaign Header */}
                  <div className="p-5 flex items-center justify-between gap-4 border-b border-white/5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${campaign.status === 'Active' ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                      <div className="min-w-0">
                        <p className="text-white font-bold truncate">{campaign.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          Keywords: <span className="text-gray-400">{campaign.search_keywords}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${campaign.status === 'Active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                        {campaign.status}
                      </span>
                      {campaign.status === 'Active' && (
                        <>
                          <button
                            id={`scan-btn-${campaign.id}`}
                            onClick={() => runScan(campaign.id)}
                            disabled={scanningId === campaign.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-colors disabled:opacity-50"
                          >
                            {scanningId === campaign.id ? '⏳ Scanning...' : '🔍 Scan Now'}
                          </button>
                          <button
                            id={`terminate-btn-${campaign.id}`}
                            onClick={() => terminateCampaign(campaign.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                          >
                            ✕ Terminate
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Last Scanned */}
                  <div className="px-5 py-2.5 bg-white/[0.02] text-xs text-gray-600 flex items-center justify-between">
                    <span>
                      Last scan: {campaign.last_scanned_at ? new Date(campaign.last_scanned_at).toLocaleTimeString() : 'Not yet scanned'}
                    </span>
                    <span className="text-red-400 font-bold">{campaign.strikes.length} stream{campaign.strikes.length !== 1 ? 's' : ''} detected</span>
                  </div>

                  {/* Kill Feed - Detected Streams */}
                  {campaign.strikes.length > 0 ? (
                    <div className="divide-y divide-white/5">
                      {campaign.strikes.map(strike => (
                        <div
                          key={strike.id}
                          className={`px-5 py-3.5 flex items-center gap-4 transition-colors duration-700 ${newStrikes.has(strike.id) ? 'bg-red-500/10' : 'hover:bg-white/[0.015]'}`}
                        >
                          {newStrikes.has(strike.id) && (
                            <span className="text-[9px] font-black tracking-widest text-red-400 bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 rounded animate-pulse flex-shrink-0">NEW</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-200 font-medium truncate">{strike.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-xs text-gray-500">{strike.channel_name} · {new Date(strike.detected_at).toLocaleTimeString()}</p>
                              {/* Detection method badge */}
                              {strike.detection_method === 'visual' ? (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                  strike.is_visual_match
                                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                    : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
                                }`}>
                                  🎯 {strike.visual_confidence?.toFixed(0)}% VISUAL {strike.is_visual_match ? 'CONFIRMED' : 'SUSPECTED'}
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-gray-500/10 text-gray-500 border-gray-500/20">
                                  🔍 KEYWORD MATCH
                                </span>
                              )}
                            </div>
                          </div>
                          <a
                            href={strike.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            id={`strike-link-${strike.id}`}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                              strike.is_visual_match
                                ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                                : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                            }`}
                          >
                            🚨 Issue DMCA
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-6 text-center text-sm text-gray-600">
                      {campaign.status === 'Active' ? '✅ No unauthorized streams detected yet. Scanning every 45 seconds.' : 'Campaign terminated.'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
