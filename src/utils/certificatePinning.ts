/**
 * Host Security & Allowlist for Smuppy Mobile App
 *
 * WHAT THIS MODULE DOES:
 * - Maintains an allowlist of trusted hostnames the app is permitted to contact
 * - Blocks outbound requests to unknown/untrusted domains via `secureFetch`
 * - Logs security-relevant breadcrumbs for host validation events
 *
 * WHAT THIS MODULE DOES NOT DO:
 * - Does NOT perform native TLS certificate pinning (iOS NSURLSession / Android OkHttp)
 * - JavaScript `fetch()` does not expose the server's public key hash, so pin
 *   validation against the SHA-256 hashes below is not possible at the JS layer
 *
 * The SHA-256 pin hashes stored in HOST_SECURITY_CONFIG are retained for:
 * 1. Reference documentation (which root CAs our infra uses)
 * 2. Future native pinning implementation (Expo config plugin + dev build)
 *
 * For true native TLS pinning, see the iOS/Android configuration examples
 * at the bottom of this file (P4 — requires Expo config plugin + dev build).
 */

import { ENV } from '../config/env';
import { captureException, addBreadcrumb } from '../lib/sentry';
import AWS_CONFIG from '../config/aws-config';

// =============================================
// HOST SECURITY CONFIGURATION
// =============================================

/**
 * SHA-256 public key pins for trusted domains.
 * Currently used ONLY as the host allowlist source.
 * Pin hashes are stored for future native pinning implementation.
 *
 * To generate pins from a live domain:
 * openssl s_client -servername domain.com -connect domain.com:443 </dev/null 2>/dev/null \
 *   | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der \
 *   | openssl dgst -sha256 -binary | openssl enc -base64
 */
interface PinConfig {
  primary: string;
  backup: string[];
  warnBeforeExpiry?: number;
}

const HOST_SECURITY_CONFIG: Record<string, PinConfig> = {
  // AWS API Gateway (Smuppy API)
  'bmkd8zayee.execute-api.us-east-1.amazonaws.com': {
    primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=', // Amazon Root CA 1
    backup: [
      'f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=', // Amazon Root CA 2
      'NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=', // Amazon Root CA 3
    ],
  },
  '90pg0i63ff.execute-api.us-east-1.amazonaws.com': {
    primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=',
    backup: [
      'f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=',
      'NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=',
    ],
  },
  'lhvm623909.execute-api.us-east-1.amazonaws.com': {
    primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=',
    backup: [
      'f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=',
      'NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=',
    ],
  },
  '1e2fsip7a4.execute-api.us-east-1.amazonaws.com': {
    primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=',
    backup: [
      'f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=',
      'NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=',
    ],
  },
  // CloudFront CDN
  'dc8kq67t0asis.cloudfront.net': {
    primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=', // Amazon Root CA 1
    backup: [
      'f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=', // Amazon Root CA 2
      'NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=', // Amazon Root CA 3
    ],
  },
  'd3gy4x1feicix3.cloudfront.net': {
    primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=',
    backup: [
      'f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=',
      'NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=',
    ],
  },
  'api.smuppy.com': {
    primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=',
    backup: [
      'f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=',
      'NqvDJlas/GRcYbcWE8S/IceH9cq77kg0jVhZeAPXq8k=',
    ],
  },
  // Expo Push Service
  'exp.host': {
    primary: 'r/mIkG3eEpVdm+u/ko/cwxzOMo1bk4TyHIlByibiA5E=', // Expo root
    backup: [],
  },
  // Sentry
  'o4510698053959680.ingest.us.sentry.io': {
    primary: 'WoiWRyIOVNa9ihaBciRSC7XHjliYS9VwUGOIud4PB18=', // Sentry/GCP
    backup: [],
  },
};

// =============================================
// HOST QUERIES
// =============================================

/**
 * Get all hosts in the security config
 */
export const getPinnedHosts = (): string[] => {
  return Object.keys(HOST_SECURITY_CONFIG);
};

/**
 * Check if a host has a security config entry
 */
export const isHostPinned = (host: string): boolean => {
  return host in HOST_SECURITY_CONFIG;
};

// =============================================
// FETCH WRAPPER WITH HOST ALLOWLIST
// =============================================

/**
 * Secure fetch with host allowlist validation.
 *
 * Blocks requests to hosts not in the allowlist.
 * Does NOT perform native TLS certificate pinning (see module docstring).
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

    if (isHostPinned(host)) {
      addBreadcrumb(`Pinned request to ${host}`, 'http');
    }

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

// =============================================
// HOST ALLOWLIST
// =============================================

const TRUSTED_HOSTS = new Set([
  ...Object.keys(HOST_SECURITY_CONFIG),
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
// NATIVE PINNING REFERENCE (P4 — future)
// =============================================

/**
 * Native pinning configuration for iOS (Info.plist)
 * Requires Expo config plugin to inject NSPinnedDomains into ATS.
 *
 * <key>NSAppTransportSecurity</key>
 * <dict>
 *   <key>NSPinnedDomains</key>
 *   <dict>
 *     <key>bmkd8zayee.execute-api.us-east-1.amazonaws.com</key>
 *     <dict>
 *       <key>NSIncludesSubdomains</key>
 *       <true/>
 *       <key>NSPinnedLeafIdentities</key>
 *       <array>
 *         <dict>
 *           <key>SPKI-SHA256-BASE64</key>
 *           <string>++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=</string>
 *         </dict>
 *       </array>
 *     </dict>
 *   </dict>
 * </dict>
 */

/**
 * Native pinning configuration for Android (network_security_config.xml)
 * Requires Expo config plugin to generate and reference the XML.
 *
 * <?xml version="1.0" encoding="utf-8"?>
 * <network-security-config>
 *   <domain-config>
 *     <domain includeSubdomains="true">bmkd8zayee.execute-api.us-east-1.amazonaws.com</domain>
 *     <pin-set expiration="2027-12-31">
 *       <pin digest="SHA-256">++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=</pin>
 *       <pin digest="SHA-256">f0KW/FtqTjs108NpYj42SrGvOB2PpxIVM8nWxjPqJGE=</pin>
 *     </pin-set>
 *   </domain-config>
 * </network-security-config>
 */

export default {
  getPinnedHosts,
  isHostPinned,
  secureFetch,
};
