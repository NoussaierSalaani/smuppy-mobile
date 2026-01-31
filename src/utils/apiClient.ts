/**
 * API Client with Security Features
 * - SSL Certificate Validation
 * - Certificate Pinning
 * - HTTPS Enforcement
 * - Retry Logic with Exponential Backoff
 * - Request Timeout
 * - Token Injection
 * - Error Tracking
 */

import { storage, STORAGE_KEYS } from './secureStorage';
import { ENV } from '../config/env';
import { captureException, addBreadcrumb } from '../lib/sentry';
import NetInfo from '@react-native-community/netinfo';
import { isHostPinned } from './certificatePinning';

// Configuration
const API_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

// Allowed hosts for SSL (prevent MITM)
// SECURITY: Use exact matching to prevent subdomain bypass attacks
const ALLOWED_HOSTS: string[] = [
  // AWS API Gateway
  'bmkd8zayee.execute-api.us-east-1.amazonaws.com',
  // CloudFront CDN
  'd3gy4x1feicix3.cloudfront.net',
  // Smuppy domains
  'api.smuppy.app',
  'api.smuppy.com',
  'smuppy.app',
  'smuppy.com',
  'www.smuppy.com',
  'app.smuppy.com',
  // External services
  'exp.host', // Expo push notifications
  'cloudflare-dns.com', // DNS validation
];

/**
 * Check if host is allowed (strict exact matching)
 * SECURITY: Uses exact match instead of endsWith() to prevent subdomain bypass
 * e.g., evil-api.smuppy.app would be blocked
 */
const isAllowedHost = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    // SECURITY: Exact match only - no subdomain wildcards
    return ALLOWED_HOSTS.includes(urlObj.host);
  } catch {
    return false;
  }
};

/**
 * SECURITY: Enforce HTTPS in production
 * Returns true if URL uses HTTPS or is allowed HTTP in development
 */
const isSecureUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);

    // HTTPS is always allowed
    if (urlObj.protocol === 'https:') {
      return true;
    }

    // HTTP only allowed in development for localhost
    if (ENV.isDev && (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname === '10.0.2.2')) {
      return true;
    }

    // Block HTTP in production
    return false;
  } catch {
    return false;
  }
};

/**
 * Log pinning status for security monitoring
 */
const logPinningStatus = (host: string): void => {
  if (isHostPinned(host)) {
    addBreadcrumb(`Request to pinned host: ${host}`, 'security');
  }
};

/**
 * Check network connectivity
 */
const checkNetwork = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable);
};

/**
 * Calculate exponential backoff delay
 */
const getRetryDelay = (attempt: number): number => {
  const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, 30000);
};

/**
 * Sleep utility
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface ApiError {
  name?: string;
  timeout?: boolean;
  status?: number;
  message?: string;
  data?: unknown;
}

/**
 * Should retry the request?
 */
const shouldRetry = (error: ApiError, attempt: number): boolean => {
  if (attempt >= MAX_RETRIES) return false;

  // Retry on network errors
  if (error.name === 'AbortError' || error.timeout) return true;

  // Retry on 5xx server errors
  if (error.status && error.status >= 500) return true;

  // Retry on 429 (rate limited)
  if (error.status === 429) return true;

  // Don't retry on 4xx client errors
  if (error.status && error.status >= 400 && error.status < 500) return false;

  // Retry on unknown errors
  return true;
};

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  blocked?: boolean;
  offline?: boolean;
  timeout?: boolean;
}

/**
 * Main request function with retry logic
 */
const request = async <T = unknown>(endpoint: string, options: RequestOptions = {}, attempt: number = 0): Promise<ApiResponse<T>> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

  // Build URL
  const url = endpoint.startsWith('http') ? endpoint : `${ENV.API_URL}${endpoint}`;

  // SECURITY: Enforce HTTPS in production
  if (!isSecureUrl(url)) {
    if (__DEV__) console.warn('HTTPS required. HTTP request blocked:', url);
    captureException(new Error('HTTP request blocked'), { url, reason: 'https_required' });
    return { success: false, error: 'HTTPS required', blocked: true };
  }

  // Validate host for security
  if (url.startsWith('http') && !isAllowedHost(url) && !endpoint.startsWith(ENV.API_URL || '')) {
    if (__DEV__) console.warn('Request to untrusted host blocked:', url);
    return { success: false, error: 'Untrusted host', blocked: true };
  }

  // Log certificate pinning status
  try {
    const urlObj = new URL(url);
    logPinningStatus(urlObj.host);
  } catch {
    // Ignore URL parsing errors
  }

  // Check network before request
  const isOnline = await checkNetwork();
  if (!isOnline) {
    clearTimeout(timeout);
    return { success: false, error: 'No internet connection', offline: true };
  }

  try {
    // Add breadcrumb for debugging
    addBreadcrumb(`API ${options.method || 'GET'} ${endpoint}`, 'http');

    // Get auth token
    const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);

    // Make request
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Client-Version': ENV.APP_VERSION || '1.0.0',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    clearTimeout(timeout);

    // Parse response
    let data: T;
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text() as unknown as T;
    }

    // Handle errors
    if (!res.ok) {
      const error: ApiError = {
        status: res.status,
        message: (data as { message?: string; error?: string })?.message || (data as { error?: string })?.error || 'Request failed',
        data,
      };

      // Retry if appropriate
      if (shouldRetry(error, attempt)) {
        const delay = getRetryDelay(attempt);
        await sleep(delay);
        return request<T>(endpoint, options, attempt + 1);
      }

      throw error;
    }

    return { success: true, data, status: res.status };
  } catch (e) {
    clearTimeout(timeout);
    const err = e as ApiError & Error;

    // Handle timeout
    if (err.name === 'AbortError') {
      const error: ApiError = { timeout: true, message: 'Request timeout' };

      // Retry on timeout
      if (shouldRetry(error, attempt)) {
        const delay = getRetryDelay(attempt);
        await sleep(delay);
        return request<T>(endpoint, options, attempt + 1);
      }

      return { success: false, error: 'Request timeout', timeout: true };
    }

    // Track unexpected errors
    if (!err.status) {
      captureException(e as Error, { endpoint, attempt });
    }

    // Retry on network errors
    if (shouldRetry(err, attempt)) {
      const delay = getRetryDelay(attempt);
      await sleep(delay);
      return request<T>(endpoint, options, attempt + 1);
    }

    return {
      success: false,
      error: err.message || 'Network error',
      status: err.status,
      data: err.data as T,
    };
  }
};

/**
 * API methods
 */
export const api = {
  get: <T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T = unknown>(endpoint: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> =>
    request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options,
    }),

  put: <T = unknown>(endpoint: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...options,
    }),

  patch: <T = unknown>(endpoint: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
      ...options,
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> =>
    request<T>(endpoint, { method: 'DELETE', ...options }),

  // Upload file (multipart/form-data)
  upload: async <T = unknown>(endpoint: string, formData: FormData, options: RequestOptions = {}): Promise<ApiResponse<T>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s for uploads

    const url = endpoint.startsWith('http') ? endpoint : `${ENV.API_URL}${endpoint}`;

    try {
      const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);

      const res = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers,
          // Don't set Content-Type for FormData - browser sets it with boundary
        },
      });

      clearTimeout(timeout);

      const data = await res.json() as T;

      if (!res.ok) {
        throw { status: res.status, message: (data as { message?: string })?.message || 'Upload failed' };
      }

      return { success: true, data };
    } catch (e) {
      clearTimeout(timeout);
      captureException(e as Error, { endpoint, type: 'upload' });
      return { success: false, error: (e as Error).message || 'Upload failed' };
    }
  },
};

/**
 * Check if API is reachable
 */
export const isApiReachable = async (): Promise<boolean> => {
  try {
    const response = await api.get('/health');
    return response.success;
  } catch {
    return false;
  }
};

export default api;
