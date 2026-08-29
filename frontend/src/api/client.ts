import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

export const AUTH_TOKEN_KEY = 'iverto_token';
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

// Response interceptor: intercept 401s, clear tokens, and format error messages
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    const status = error.response?.status;
    const responseData = error.response?.data;

    // Handle 401 Unauthorized: token expired or invalid
    if (status === 401) {
      const isAuthLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isAuthLoginRequest) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_SESSION_KEY);
        // Dispatch custom session expired event for reactive auth listeners
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('iverto:auth:unauthorized'));
        }
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
