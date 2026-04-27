/**
 * TraceDNA API Client
 *
 * Type-safe API functions using the configured Axios instance.
 */
import api from './axios';
import type {
  DMCAResponse,
  GraphData,
  PaginatedResponse,
  PiracyReport,
  ScanResponse,
  UploadResponse,
  VideoAsset,
} from './types';

// --- Auth ---
export async function login(username: string, password: string) {
  const res = await api.post('/api/auth/login', { username, password });
  return res.data;
}

// --- Vault ---
export async function uploadVideo(title: string, file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('video_file', file);

  const res = await api.post<UploadResponse>('/vault/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 min for large uploads
  });
  return res.data;
}

// --- Patrol ---
export async function scanUrl(suspectUrl: string, sourceVideoTitle: string): Promise<ScanResponse> {
  const res = await api.post<ScanResponse>('/patrol/scan-url/', {
    suspect_url: suspectUrl,
    source_video_title: sourceVideoTitle,
  });
  return res.data;
}

// --- Reports ---
export async function fetchReports(page = 1): Promise<PaginatedResponse<PiracyReport>> {
  const res = await api.get<PaginatedResponse<PiracyReport>>('/reports/', {
    params: { page },
  });
  return res.data;
}

export async function fetchGraphData(): Promise<GraphData> {
  const res = await api.get<GraphData>('/reports/graph/');
  return res.data;
}

export async function generateDMCA(reportId: number): Promise<DMCAResponse> {
  const res = await api.post<DMCAResponse>(`/reports/${reportId}/generate-dmca/`);
  return res.data;
}

// --- Video Assets ---
export async function fetchVideoAssets(page = 1): Promise<PaginatedResponse<VideoAsset>> {
  const res = await api.get<PaginatedResponse<VideoAsset>>('/vault/assets/', {
    params: { page },
  });
  return res.data;
}
