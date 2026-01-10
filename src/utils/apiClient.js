import { storage, STORAGE_KEYS } from './secureStorage';
import { ENV } from '../config/env';

const API_TIMEOUT = 10000;

const request = async (endpoint, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
  const url = endpoint.startsWith('http') ? endpoint : `${ENV.API_URL}${endpoint}`;

  try {
    const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    const data = await res.json();
    if (!res.ok) throw { status: res.status, message: data?.message || 'Request failed', data };
    return { success: true, data };
  } catch (e) {
    if (e.name === 'AbortError') return { success: false, error: 'Request timeout', timeout: true };
    return { success: false, error: e.message || 'Network error', status: e.status };
  } finally {
    clearTimeout(timeout);
  }
};

export const api = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options) => request(endpoint, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (endpoint, body, options) => request(endpoint, { method: 'PUT', body: JSON.stringify(body), ...options }),
  patch: (endpoint, body, options) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  delete: (endpoint, options) => request(endpoint, { method: 'DELETE', ...options }),
};