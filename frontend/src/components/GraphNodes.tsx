'use client';

/**
 * GraphNodes — Custom React Flow Node Components
 * Three visual types: sourceNode (official), piracyNode (pirated), fairUseNode (cleared)
 */
import { Handle, Position } from '@xyflow/react';

import type { GraphNodeData } from '@/lib/types';

function formatConfidence(v?: number) {
  if (v == null) return null;
  return `${(v * 100).toFixed(1)}%`;
}

// ─── Source / Official Content Node ──────────────────────────────────────────
export function SourceNode({ data }: { data: GraphNodeData }) {
  return (
    <div className="relative group">
      {/* Glow ring */}
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-emerald-500/40 to-teal-500/20 blur-sm opacity-80 group-hover:opacity-100 transition-opacity" />
      <div className="relative bg-[#0d1f17] border border-emerald-500/40 rounded-2xl px-5 py-4 min-w-[200px] shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🎬</span>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Official Source</span>
        </div>
        <p className="text-sm font-semibold text-white leading-tight truncate max-w-[180px]" title={data.label}>
          {data.label}
        </p>
        <div className="mt-2 inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Protected
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !border-emerald-600 !w-3 !h-3" />
    </div>
  );
}

// ─── Piracy Node ──────────────────────────────────────────────────────────────
export function PiracyNode({ data }: { data: GraphNodeData }) {
  const conf = formatConfidence(data.matchConfidence);
  return (
    <div className="relative group">
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-red-500/40 to-orange-500/20 blur-sm opacity-70 group-hover:opacity-100 transition-opacity animate-pulse" />
      <div className="relative bg-[#1f0d0d] border border-red-500/40 rounded-2xl px-5 py-4 min-w-[200px] shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🚨</span>
          <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Piracy Detected</span>
        </div>
        <p className="text-sm font-semibold text-white leading-tight truncate max-w-[180px]" title={data.label}>
          {data.label}
        </p>
        {conf && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-red-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full"
                style={{ width: conf }}
              />
            </div>
            <span className="text-xs font-mono text-red-300">{conf}</span>
          </div>
        )}
        {data.url && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-xs text-red-400/70 hover:text-red-300 truncate max-w-[180px] underline underline-offset-2"
          >
            {data.url}
          </a>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-red-400 !border-red-600 !w-3 !h-3" />
    </div>
  );
}

// ─── Fair Use Node ────────────────────────────────────────────────────────────
export function FairUseNode({ data }: { data: GraphNodeData }) {
  const conf = formatConfidence(data.matchConfidence);
  return (
    <div className="relative group">
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-yellow-500/30 to-amber-500/10 blur-sm opacity-70 group-hover:opacity-100 transition-opacity" />
      <div className="relative bg-[#1c1a08] border border-amber-500/30 rounded-2xl px-5 py-4 min-w-[200px] shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">⚖️</span>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Fair Use</span>
        </div>
        <p className="text-sm font-semibold text-white leading-tight truncate max-w-[180px]" title={data.label}>
          {data.label}
        </p>
        {conf && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-amber-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full"
                style={{ width: conf }}
              />
            </div>
            <span className="text-xs font-mono text-amber-300">{conf}</span>
          </div>
        )}
        <div className="mt-2 inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
          ✓ Cleared
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !border-amber-600 !w-3 !h-3" />
    </div>
  );
}
