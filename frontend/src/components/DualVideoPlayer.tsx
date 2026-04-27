'use client';

/**
 * DualVideoPlayer — The "Gotcha" Player
 * Side-by-side synchronized video comparison that jumps to the exact match timestamp.
 */
import { useEffect, useRef, useState } from 'react';

import type { PiracyReport } from '@/lib/types';

interface Props {
  report: PiracyReport;
  onClose: () => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function DualVideoPlayer({ report, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLVideoElement>(null);
  const suspectRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [synced, setSynced] = useState(false);
  const seekTarget = report.matched_segment_start ?? 0;

  // Seek both videos to the match timestamp once loaded
  const seekToMatch = () => {
    if (sourceRef.current && suspectRef.current) {
      sourceRef.current.currentTime = seekTarget;
      suspectRef.current.currentTime = seekTarget;
      setSynced(true);
    }
  };

  const togglePlay = () => {
    if (!sourceRef.current || !suspectRef.current) return;
    if (isPlaying) {
      sourceRef.current.pause();
      suspectRef.current.pause();
    } else {
      sourceRef.current.play();
      suspectRef.current.play();
    }
    setIsPlaying((p) => !p);
  };

  const handleReset = () => {
    setIsPlaying(false);
    sourceRef.current?.pause();
    suspectRef.current?.pause();
    seekToMatch();
  };

  // Sync suspect playback to source (keep within 200ms)
  useEffect(() => {
    const src = sourceRef.current;
    const sus = suspectRef.current;
    if (!src || !sus) return;
    const syncHandler = () => {
      if (Math.abs(src.currentTime - sus.currentTime) > 0.2) {
        sus.currentTime = src.currentTime;
      }
    };
    src.addEventListener('timeupdate', syncHandler);
    return () => src.removeEventListener('timeupdate', syncHandler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
    >
      <div className="relative w-full max-w-6xl flex flex-col glass-card border border-white/10 shadow-2xl rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-red-500/10 to-orange-500/5">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-2xl">🕵️</span>
              <h2 className="text-xl font-bold text-white">Gotcha Player</h2>
              <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                PIRACY MATCH
              </span>
            </div>
            <p className="text-sm text-gray-400">
              Side-by-side comparison — seeked to match at
              <span className="text-red-400 font-mono font-semibold mx-1">{formatTime(seekTarget)}</span>
              {report.matched_segment_end && (
                <>— <span className="text-red-400 font-mono font-semibold">{formatTime(report.matched_segment_end)}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Confidence bar */}
        <div className="flex items-center gap-4 px-6 py-2.5 bg-red-500/5 border-b border-white/5 text-xs">
          <span className="text-gray-500">Match Confidence</span>
          <div className="flex-1 h-1.5 bg-red-900/40 rounded-full overflow-hidden max-w-[200px]">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full transition-all"
              style={{ width: `${((report.match_confidence ?? 0) * 100).toFixed(1)}%` }}
            />
          </div>
          <span className="text-red-400 font-mono font-bold">
            {report.match_confidence != null ? `${(report.match_confidence * 100).toFixed(1)}%` : '—'}
          </span>
          {!report.is_fair_use && (
            <span className="text-red-400 border border-red-500/20 bg-red-500/10 px-2 py-0.5 rounded font-semibold">✗ PIRACY</span>
          )}
        </div>

        {/* Dual Video Panel */}
        <div className="grid grid-cols-2 gap-0 bg-black">
          {/* Left — Original */}
          <div className="relative border-r border-white/5">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              OFFICIAL SOURCE
            </div>
            {report.source_video_url ? (
              <video
                ref={sourceRef}
                src={report.source_video_url}
                className="w-full aspect-video object-contain bg-black"
                onLoadedMetadata={seekToMatch}
                controls={false}
                muted
                playsInline
              />
            ) : (
              <div className="w-full aspect-video bg-black flex flex-col items-center justify-center text-gray-600">
                <span className="text-3xl mb-2">🎬</span>
                <p className="text-sm">Video URL not available</p>
                <p className="text-xs mt-1 text-gray-700">Stored in GCS — signed URL may have expired</p>
              </div>
            )}
            <div className="absolute bottom-3 left-3 right-3 z-10 text-xs text-white/70 font-medium bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-lg truncate">
              {report.source_video_title}
            </div>
          </div>

          {/* Right — Suspect */}
          <div className="relative">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              SUSPECT COPY
            </div>
            {report.suspect_video_url ? (
              <video
                ref={suspectRef}
                src={report.suspect_video_url}
                className="w-full aspect-video object-contain bg-black"
                onLoadedMetadata={seekToMatch}
                controls={false}
                muted
                playsInline
              />
            ) : (
              <div className="w-full aspect-video bg-black flex flex-col items-center justify-center text-gray-600">
                <span className="text-3xl mb-2">🚨</span>
                <p className="text-sm">Video URL not available</p>
                <p className="text-xs mt-1 text-gray-700">Stored in GCS — signed URL may have expired</p>
              </div>
            )}
            <div className="absolute bottom-3 left-3 right-3 z-10 text-xs text-white/70 font-medium bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-lg truncate">
              {report.suspect_video_title}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-6 py-4 border-t border-white/5 bg-black/30">
          <button
            onClick={handleReset}
            className="btn-ghost text-sm px-4 py-2 inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Jump to Match
          </button>

          <button
            onClick={togglePlay}
            className={`${isPlaying ? 'btn-ghost' : 'btn-danger'} text-sm px-8 py-2.5 inline-flex items-center gap-2 font-semibold`}
          >
            {isPlaying ? (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Pause Both
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play Both
              </>
            )}
          </button>

          <button onClick={onClose} className="btn-ghost text-sm px-4 py-2">
            Close
          </button>
        </div>

        {/* Sync status */}
        {synced && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-red-500/90 text-white text-xs font-bold rounded-full animate-[fade-out_2s_ease-in-out_forwards]">
            ⏩ Seeked to {formatTime(seekTarget)}
          </div>
        )}
      </div>
    </div>
  );
}
