/**
 * TraceDNA Axios Instance
 *
 * Configured with:
 * - Base URL pointing to Next.js API proxy
 * - Request interceptor to attach access token from auth context
 * - Response interceptor with 401 retry logic + _retry flag to prevent infinite loops
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Custom config type to track retry state
interface RetryableAxiosConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 minutes for large uploads
});

// --- Token management (set by AuthContext) ---
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// --- Request Interceptor: Attach access token ---
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response Interceptor: 401 retry with _retry flag ---
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableAxiosConfig;

    // CRITICAL: Check _retry flag to prevent infinite loops
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Call the Next.js refresh proxy
        const refreshResponse = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true,
        });

        const newAccessToken = refreshResponse.data.access;
        setAccessToken(newAccessToken);

        // Retry the original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed — clear token and redirect to login
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
