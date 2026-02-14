/**
 * Shared Secrets Helper
 * Retrieves secrets from AWS Secrets Manager with in-memory caching
 *
 * SECURITY: Stripe secret key is stored in Secrets Manager, not env vars.
 * Cached for the lifetime of the Lambda execution context to minimize API calls.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

// In-memory cache with TTL: secret ARN → { value, expiresAt }
interface CacheEntry {
  value: string;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Retrieve a secret value by ARN, with in-memory caching and TTL.
 * The cache persists across warm Lambda invocations but expires after 30 minutes.
 */
async function getSecret(arn: string): Promise<string> {
  const cached = cache.get(arn);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = result.SecretString;
  if (!value) {
    throw new Error('Secret value is empty');
  }

  cache.set(arn, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

interface StripeSecrets {
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

let stripeSecrets: StripeSecrets | null = null;
let stripeSecretsExpiresAt = 0;

async function getStripeSecrets(): Promise<StripeSecrets> {
  if (stripeSecrets && Date.now() < stripeSecretsExpiresAt) return stripeSecrets;
  const arn = process.env.STRIPE_SECRET_ARN;
  if (!arn) {
    throw new Error('STRIPE_SECRET_ARN environment variable is not set');
  }
  const raw = await getSecret(arn);
  stripeSecrets = JSON.parse(raw) as StripeSecrets;
  stripeSecretsExpiresAt = Date.now() + CACHE_TTL_MS;
  return stripeSecrets;
}

export async function getStripeKey(): Promise<string> {
  const secrets = await getStripeSecrets();
  return secrets.STRIPE_SECRET_KEY;
}

export async function getStripeWebhookSecret(): Promise<string> {
  const secrets = await getStripeSecrets();
  return secrets.STRIPE_WEBHOOK_SECRET;
}

/**
 * Invalidate cached Stripe secrets.
 * Call this when webhook signature validation fails to force a refresh
 * on the next retrieval (handles secret rotation gracefully).
 */
export function invalidateStripeSecrets(): void {
  stripeSecrets = null;
  stripeSecretsExpiresAt = 0;
  // Also invalidate the underlying secret cache entry
  const arn = process.env.STRIPE_SECRET_ARN;
  if (arn) {
    cache.delete(arn);
  }
}

export async function getStripePublishableKey(): Promise<string> {
  const secrets = await getStripeSecrets();
  return secrets.STRIPE_PUBLISHABLE_KEY;
}
