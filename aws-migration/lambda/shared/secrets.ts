/**
 * Shared Secrets Helper
 * Retrieves secrets from AWS Secrets Manager with in-memory caching
 *
 * SECURITY: Stripe secret key is stored in Secrets Manager, not env vars.
 * Cached for the lifetime of the Lambda execution context to minimize API calls.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

// In-memory cache: secret ARN → value
const cache = new Map<string, string>();

/**
 * Retrieve a secret value by ARN, with in-memory caching.
 * The cache persists across warm Lambda invocations.
 */
async function getSecret(arn: string): Promise<string> {
  const cached = cache.get(arn);
  if (cached) {
    return cached;
  }

  const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = result.SecretString;
  if (!value) {
    throw new Error('Secret value is empty');
  }

  cache.set(arn, value);
  return value;
}

interface StripeSecrets {
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

let stripeSecrets: StripeSecrets | null = null;

async function getStripeSecrets(): Promise<StripeSecrets> {
  if (stripeSecrets) return stripeSecrets;
  const arn = process.env.STRIPE_SECRET_ARN;
  if (!arn) {
    throw new Error('STRIPE_SECRET_ARN environment variable is not set');
  }
  const raw = await getSecret(arn);
  stripeSecrets = JSON.parse(raw) as StripeSecrets;
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

export async function getStripePublishableKey(): Promise<string> {
  const secrets = await getStripeSecrets();
  return secrets.STRIPE_PUBLISHABLE_KEY;
}
