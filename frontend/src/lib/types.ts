/**
 * TraceDNA TypeScript Type Definitions
 *
 * Strict literal unions and interfaces for all API data shapes.
 */

// --- Status Literal Unions ---
export type ProcessingStatus =
  | 'Pending'
  | 'Processing'
  | 'Awaiting_AI_Review'
  | 'Completed'
  | 'Failed';

export type ReportStatus =
  | 'Pending'
  | 'Takedown_Drafted'
  | 'Takedown_Sent'
  | 'Dismissed'
  | 'Resolved';

// --- Core Interfaces ---
export interface Organization {
  id: number;
  name: string;
  api_key: string;
  contact_email: string;
  created_at: string;
}

export interface VideoAsset {
  id: number;
  title: string;
  organization: number;
  organization_name: string;
  gcs_uri: string | null;
  total_duration: number | null;
  upload_date: string;
  is_source: boolean;
  processing_status: ProcessingStatus;
}

export interface PiracyReport {
  id: number | string;
  source_video: number;
  source_video_title: string;
  source_video_status: ProcessingStatus;
  source_video_url: string | null;
  suspect_video: number;
  suspect_video_title: string;
  suspect_video_status: ProcessingStatus;
  suspect_video_url: string | null;
  original_suspect_url: string;
  match_confidence: number | null;
  gemini_reasoning: GeminiReasoning | null;
  is_fair_use: boolean;
  matched_segment_start: number | null;
  matched_segment_end: number | null;
  dmca_draft: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export interface GeminiReasoning {
  is_match: boolean;
  modifications: string[];
  is_fair_use: boolean;
  explanation: string;
}

// --- Graph Data (React Flow) ---
export interface GraphNodeData {
  [key: string]: unknown;
  label: string;
  status: ProcessingStatus;
  videoId: number;
  matchConfidence?: number;
  isFairUse?: boolean;
  reportStatus?: ReportStatus;
  url?: string;
}

export interface GraphNode {
  id: string;
  type: 'sourceNode' | 'piracyNode' | 'fairUseNode';
  position: { x: number; y: number };
  data: GraphNodeData;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  animated: boolean;
  label?: string;
  style?: Record<string, string | number>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- API Responses ---
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface UploadResponse {
  message: string;
  video_asset: VideoAsset;
}

export interface ScanResponse {
  message: string;
  suspect_asset: VideoAsset;
  source_video_id: number;
}

export interface DMCAResponse {
  message: string;
  report: PiracyReport;
}

// --- Dashboard Metrics ---
export interface DashboardMetrics {
  totalSources: number;
  totalSuspects: number;
  activeScans: number;
  piracyDetected: number;
  fairUseCleared: number;
  pending: number;
}
