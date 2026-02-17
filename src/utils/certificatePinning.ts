/**
 * Host Security & Allowlist for Smuppy Mobile App
 *
 * WHAT THIS MODULE DOES:
 * - Maintains an allowlist of trusted hostnames the app is permitted to contact
 * - Blocks outbound requests to unknown/untrusted domains via `secureFetch`
 * - Logs security-relevant breadcrumbs for host validation events
 *
 * NOTE: JavaScript `fetch()` cannot validate server certificate hashes.
 * For native TLS certificate pinning (iOS NSURLSession / Android OkHttp),
 * an Expo config plugin + dev build would be required (P4 — future).
 */

import { ENV } from '../config/env';
import { captureException, addBreadcrumb } from '../lib/sentry';
import { AWS_CONFIG } from '../config/aws-config';

// =============================================
// HOST ALLOWLIST
// =============================================

/**
 * Static allowlist of trusted hostnames.
 * Only hosts in this set (or dynamically added from AWS_CONFIG) are reachable.
 */
const ALLOWED_HOSTS: string[] = [
  // AWS API Gateway (Smuppy API) — staging fallbacks; runtime endpoints added dynamically below
  'bmkd8zayee.execute-api.us-east-1.amazonaws.com',
  '90pg0i63ff.execute-api.us-east-1.amazonaws.com',
  'lhvm623909.execute-api.us-east-1.amazonaws.com',
  '1e2fsip7a4.execute-api.us-east-1.amazonaws.com',
  // CloudFront CDN — legacy CDK staging distribution (backend may return URLs with this domain)
  // Current CDN domain is added dynamically from AWS_CONFIG.storage.cdnDomain below
  'd3gy4x1feicix3.cloudfront.net',
  'api.smuppy.com',
  // Expo Push Service
  'exp.host',
  // Sentry
  'o4510698053959680.ingest.us.sentry.io',
];

const TRUSTED_HOSTS = new Set([
  ...ALLOWED_HOSTS,
  ...(ENV.isDev ? ['localhost', '127.0.0.1', '10.0.2.2'] : []),
]);

// Dynamically trust hosts from runtime config (API/CDN)
[
  AWS_CONFIG.api.restEndpoint,
  AWS_CONFIG.api.restEndpoint2,
  AWS_CONFIG.api.restEndpoint3,
  AWS_CONFIG.storage.cdnDomain,
].forEach((url) => {
  try {
    const host = new URL(url).host;
    if (host) TRUSTED_HOSTS.add(host);
  } catch {
    // ignore malformed URLs
  }
});

const isHostAllowed = (host: string): boolean => {
  const hostname = host.split(':')[0];
  return TRUSTED_HOSTS.has(hostname) || TRUSTED_HOSTS.has(host);
};

// =============================================
// FETCH WRAPPER WITH HOST ALLOWLIST
// =============================================

/**
 * Secure fetch with host allowlist validation.
 *
 * Blocks requests to hosts not in the allowlist.
 * Adds a Sentry breadcrumb for allowed-host requests.
 */
export const secureFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  try {
    const urlObj = new URL(url);
    const host = urlObj.host;

    if (!isHostAllowed(host)) {
      throw new Error(`Untrusted host: ${host}`);
    }

    addBreadcrumb(`Allowed request to ${host}`, 'http');

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-Requested-With': 'SmuppyApp',
      },
    });

    return response;
  } catch (error) {
    captureException(error as Error, { url, type: 'secure_fetch' });
    throw error;
  }
};
