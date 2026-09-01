import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

export const AUTH_TOKEN_KEY = 'iverto_token';
export const AUTH_REFRESH_TOKEN_KEY = 'iverto_refresh_token';
export const AUTH_SESSION_KEY = 'iverto_user';

export interface ApiErrorResponse {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  details?: any;
}

export class ApiError extends Error {
  public status?: number;
  public details?: any;
  public rawMessage?: string | string[];

  constructor(message: string, status?: number, details?: any, rawMessage?: string | string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.rawMessage = rawMessage;
  }
}

/**
 * Global Axios API client configured for iverto platform backend communication.
 * BaseURL falls back to empty string to leverage Vite's local dev proxy (/api).
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30000,
});

// A bare axios instance, deliberately outside apiClient's interceptors — used only for
// the refresh call itself, so a failed refresh can never re-trigger the same 401 →
// refresh → 401 handling that exists to rescue every *other* request.
const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 30000,
});

// Request interceptor: attach bearer token from localStorage
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

/**
 * De-dupes concurrent refresh attempts: if five requests all fail with 401 at once (a
 * page that fires several calls on mount, say), they should share one
 * POST /auth/refresh, not each start their own — the second use of a rotated refresh
 * token is treated server-side as a compromise signal (see backend AuthService), so
 * firing several in parallel would make the *first* one to land invalidate every other
 * in flight.
 */
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const storedRefreshToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  if (!storedRefreshToken) {
    return null;
  }

  try {
    const response = await refreshClient.post('/api/v1/auth/refresh', {
      refreshToken: storedRefreshToken,
    });
    const { accessToken, refreshToken: newRefreshToken } = response.data || {};
    if (!accessToken) {
      return null;
    }

    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    if (newRefreshToken) {
      localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, newRefreshToken);
    }
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    return accessToken;
  } catch {
    return null;
  }
}

// Response interceptor: on 401, try a silent refresh once before giving up. Login,
// refresh, and logout calls are exempt — a 401 from those is a real auth failure
// (wrong password, invalid/expired refresh token), not "this access token expired,"
// and must never itself trigger another refresh attempt.
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError<ApiErrorResponse>) => {
    const status = error.response?.status;
    const responseData = error.response?.data;
    const requestUrl = error.config?.url || '';
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout');

    if (status === 401 && !isAuthEndpoint) {
      const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

      if (originalRequest && !originalRequest._retried) {
        originalRequest._retried = true;

        if (!refreshPromise) {
          refreshPromise = performRefresh().finally(() => {
            refreshPromise = null;
          });
        }

        const newAccessToken = await refreshPromise;
        if (newAccessToken) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return apiClient.request(originalRequest);
        }
      }

      // No refresh token, or the refresh attempt itself failed — same hard sign-out as
      // before.
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
      localStorage.removeItem(AUTH_SESSION_KEY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('iverto:auth:unauthorized'));
      }
    }

    // Extract cleanest user-facing error message
    let errorMessage = 'An unexpected error occurred. Please try again.';
    let rawMsg: string | string[] | undefined = undefined;

    if (responseData) {
      if (typeof responseData.message === 'string') {
        errorMessage = responseData.message;
        rawMsg = responseData.message;
      } else if (Array.isArray(responseData.message)) {
        errorMessage = responseData.message.join(', ');
        rawMsg = responseData.message;
      } else if (responseData.error) {
        errorMessage = responseData.error;
        rawMsg = responseData.error;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    const formattedError = new ApiError(errorMessage, status, responseData, rawMsg);
    return Promise.reject(formattedError);
  },
);

export default apiClient;
