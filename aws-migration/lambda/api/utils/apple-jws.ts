/**
 * Apple JWS (JSON Web Signature) Verification
 *
 * Verifies Apple-signed JWS tokens by extracting the public key from the x5c
 * certificate chain in the header and verifying the ES256 signature.
 *
 * Used by both iap-verify.ts and iap-notifications.ts.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Verify an Apple JWS token by extracting the public key from the x5c certificate
 * chain in the header and verifying the ES256 signature.
 *
 * @returns The decoded payload on success, or null if verification fails.
 */
export function verifyAppleJWS(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode the header to extract x5c certificate chain
    const headerJson = Buffer.from(parts[0], 'base64url').toString('utf-8');
    const header = JSON.parse(headerJson) as { alg?: string; x5c?: string[] };

    if (header.alg !== 'ES256' || !header.x5c || header.x5c.length === 0) {
      return null;
    }

    // Extract the leaf certificate (first in x5c chain) and convert DER to PEM
    const leafCertDer = header.x5c[0];
    const leafCertPem = `-----BEGIN CERTIFICATE-----\n${leafCertDer}\n-----END CERTIFICATE-----`;

    // Extract the public key from the certificate
    const publicKey = crypto.createPublicKey({
      key: leafCertPem,
      format: 'pem',
    });

    // Verify the JWS signature using the extracted public key
    const exportedKey = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const payload = jwt.verify(token, exportedKey, { algorithms: ['ES256'] });

    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
