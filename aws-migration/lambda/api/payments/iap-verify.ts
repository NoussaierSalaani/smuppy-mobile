/**
 * IAP Receipt Verification Lambda Handler
 *
 * Verifies In-App Purchase receipts from iOS (App Store) and Android (Google Play).
 * Called after the client completes a store purchase via useIAPCheckout.
 *
 * Flow:
 * 1. Client purchases via StoreKit / Play Billing
 * 2. Client sends receipt/token to this endpoint
 * 3. This handler validates with Apple/Google servers
 * 4. On success: creates entitlement in user_entitlements table
 * 5. Applies entitlement (e.g., upgrades account type)
 * 6. Returns success so client can finishTransaction()
 *
 * Security:
 * - Authenticated via Cognito (withAuthHandler)
 * - Rate limited (10 req/min per user)
 * - Receipt validated server-side with Apple/Google
 * - Transaction deduplication via UNIQUE constraint
 * - Sandbox/production environment isolation
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { GoogleAuth } from 'google-auth-library';
import { withAuthHandler, AuthContext } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { getIAPSecrets, type AppleIAPSecrets, type GooglePlaySecrets } from '../../shared/secrets';

// ────────────────────────────────────────────
// Product ID → product type mapping
// ────────────────────────────────────────────

const APPLE_PRODUCT_MAP: Record<string, string> = {
  'com.nou09.Smuppy.pro_creator_monthly': 'pro_creator',
  'com.nou09.Smuppy.pro_business_monthly': 'pro_business',
  'com.nou09.Smuppy.verified_monthly': 'verified',
  'com.nou09.Smuppy.channel_sub_monthly': 'channel_subscription',
  'com.nou09.Smuppy.tip_200': 'tip',
  'com.nou09.Smuppy.tip_500': 'tip',
  'com.nou09.Smuppy.tip_1000': 'tip',
  'com.nou09.Smuppy.tip_2000': 'tip',
};

const ANDROID_PRODUCT_MAP: Record<string, string> = {
  'com_nou09_smuppy_pro_creator_monthly': 'pro_creator',
  'com_nou09_smuppy_pro_business_monthly': 'pro_business',
  'com_nou09_smuppy_verified_monthly': 'verified',
  'com_nou09_smuppy_channel_sub_monthly': 'channel_subscription',
};

const SUBSCRIPTION_TYPES = new Set(['pro_creator', 'pro_business', 'verified', 'channel_subscription']);

function resolveProductType(platform: string, productId: string): string | null {
  const map = platform === 'ios' ? APPLE_PRODUCT_MAP : ANDROID_PRODUCT_MAP;
  return map[productId] ?? null;
}

// ────────────────────────────────────────────
// Apple App Store Server API v2
// ────────────────────────────────────────────

const APPLE_API_BASE = 'https://api.storekit.itunes.apple.com';
const APPLE_SANDBOX_API_BASE = 'https://api.storekit-sandbox.itunes.apple.com';

async function createAppleJWT(secrets: AppleIAPSecrets): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: secrets.issuerId,
    iat: now,
    exp: now + 3600, // 1 hour
    aud: 'appstoreconnect-v1',
    bid: secrets.bundleId,
  };

  return jwt.sign(payload, secrets.privateKey, {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: secrets.keyId,
      typ: 'JWT',
    },
  });
}

interface AppleValidationResult {
  valid: boolean;
  originalTransactionId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  isTrial?: boolean;
  environment?: string;
}

async function validateAppleReceipt(
  transactionId: string,
  secrets: AppleIAPSecrets,
): Promise<AppleValidationResult> {
  const token = await createAppleJWT(secrets);

  // Try production first, fall back to sandbox
  for (const baseUrl of [APPLE_API_BASE, APPLE_SANDBOX_API_BASE]) {
    const url = `${baseUrl}/inApps/v1/transactions/${transactionId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) continue; // Not found on this environment

    if (!response.ok) {
      continue; // Try sandbox if production fails
    }

    const data = await response.json();
    const signedTransaction = data.signedTransactionInfo;

    if (!signedTransaction) {
      return { valid: false };
    }

    // Decode JWS payload (middle part) — signature verification happens via Apple's server
    const parts = signedTransaction.split('.');
    if (parts.length !== 3) return { valid: false };

    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const txInfo = JSON.parse(payloadJson);

    // Verify bundle ID matches our app
    if (txInfo.bundleId !== secrets.bundleId) {
      return { valid: false };
    }

    const environment = baseUrl === APPLE_API_BASE ? 'production' : 'sandbox';

    return {
      valid: true,
      originalTransactionId: txInfo.originalTransactionId,
      purchaseDate: txInfo.purchaseDate,
      expiresDate: txInfo.expiresDate,
      isTrial: txInfo.offerType === 1, // 1 = introductory offer (free trial)
      environment,
    };
  }

  return { valid: false };
}

// ────────────────────────────────────────────
// Google Play Developer API
// ────────────────────────────────────────────

interface GoogleValidationResult {
  valid: boolean;
  originalTransactionId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  isTrial?: boolean;
  environment?: string;
}

async function validateGoogleReceipt(
  purchaseToken: string,
  productId: string,
  isSubscription: boolean,
  secrets: GooglePlaySecrets,
): Promise<GoogleValidationResult> {
  const auth = new GoogleAuth({
    credentials: secrets.serviceAccount,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  if (!accessToken.token) {
    return { valid: false };
  }

  const packageName = secrets.packageName;

  let url: string;
  if (isSubscription) {
    url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
  } else {
    url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
    },
  });

  if (!response.ok) {
    return { valid: false };
  }

  const data = await response.json();

  if (isSubscription) {
    // Subscriptions v2 API response
    const isActive = data.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE'
      || data.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';

    // Find the latest line item
    const lineItem = data.lineItems?.[0];

    return {
      valid: isActive || data.subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED',
      originalTransactionId: data.latestOrderId,
      purchaseDate: lineItem?.expiryTime
        ? Date.now() // Google doesn't directly expose original purchase time in v2
        : Date.now(),
      expiresDate: lineItem?.expiryTime ? new Date(lineItem.expiryTime).getTime() : undefined,
      isTrial: lineItem?.offerDetails?.basePlanId?.includes('trial') ?? false,
      environment: data.testPurchase != null ? 'sandbox' : 'production',
    };
  }

  // Consumable product response
  return {
    valid: data.purchaseState === 0, // 0 = purchased
    purchaseDate: Number(data.purchaseTimeMillis),
    environment: data.purchaseType === 0 ? 'sandbox' : 'production',
  };
}

// ────────────────────────────────────────────
// Apply entitlement to user account
// ────────────────────────────────────────────

async function applyEntitlement(
  client: import('pg').PoolClient,
  profileId: string,
  productType: string,
): Promise<void> {
  // For subscription types, update the account type in profiles
  if (productType === 'pro_creator' || productType === 'pro_business') {
    await client.query(
      `UPDATE profiles
       SET account_type = $1,
           subscription_source = 'iap',
           updated_at = NOW()
       WHERE id = $2
         AND (account_type = 'personal' OR account_type IS NULL OR subscription_source = 'iap')`,
      [productType, profileId],
    );
  } else if (productType === 'verified') {
    await client.query(
      `UPDATE profiles
       SET is_verified = true,
           verification_source = 'iap',
           updated_at = NOW()
       WHERE id = $1`,
      [profileId],
    );
  }
  // channel_subscription and tip don't need profile updates here —
  // they're handled by specific business logic elsewhere.
}

// ────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────

export const handler = withAuthHandler('iap-verify', async (event, ctx: AuthContext): Promise<APIGatewayProxyResult> => {
  const { headers, log, profileId, db } = ctx;

  // Rate limit: 10 requests per minute per user
  const rateLimitResult = await requireRateLimit(
    { prefix: 'iap-verify', identifier: profileId, maxRequests: 10, windowSeconds: 60 },
    headers,
  );
  if (rateLimitResult) return rateLimitResult;

  // Parse and validate input
  const body = JSON.parse(event.body || '{}');
  const { platform, productId, transactionId, receipt, purchaseToken } = body;

  if (!platform || !productId || !transactionId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Missing required fields: platform, productId, transactionId' }),
    };
  }

  if (platform !== 'ios' && platform !== 'android') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid platform' }),
    };
  }

  if (platform === 'ios' && !receipt) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Missing receipt for iOS' }),
    };
  }

  if (platform === 'android' && !purchaseToken) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Missing purchaseToken for Android' }),
    };
  }

  // Resolve product type
  const productType = resolveProductType(platform, productId);
  if (!productType) {
    log.warn('Unknown product ID', { platform, productId });
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Unknown product' }),
    };
  }

  // Check for duplicate transaction (idempotent)
  const existing = await db.query(
    'SELECT id, profile_id FROM user_entitlements WHERE platform = $1 AND store_transaction_id = $2',
    [platform, transactionId],
  );

  if (existing.rows.length > 0) {
    // Verify the existing entitlement belongs to this user
    if (existing.rows[0].profile_id !== profileId) {
      log.warn('Transaction belongs to different user', {
        transactionId: transactionId.substring(0, 8) + '***',
        existingProfile: existing.rows[0].profile_id.substring(0, 8) + '***',
        requestingProfile: profileId.substring(0, 8) + '***',
      });
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Transaction already claimed' }),
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Already processed', productType }),
    };
  }

  // ──────── Server-side receipt validation ────────
  log.info('Validating IAP receipt', {
    platform,
    productId,
    productType,
    profile: profileId.substring(0, 8) + '***',
  });

  const iapSecrets = await getIAPSecrets(platform);

  let validationResult: AppleValidationResult | GoogleValidationResult;
  if (platform === 'ios') {
    validationResult = await validateAppleReceipt(
      transactionId,
      iapSecrets as AppleIAPSecrets,
    );
  } else {
    validationResult = await validateGoogleReceipt(
      purchaseToken,
      productId,
      SUBSCRIPTION_TYPES.has(productType),
      iapSecrets as GooglePlaySecrets,
    );
  }

  if (!validationResult.valid) {
    log.warn('Receipt validation failed', {
      platform,
      productId,
      profile: profileId.substring(0, 8) + '***',
    });
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, message: 'Receipt validation failed' }),
    };
  }

  // Reject sandbox receipts in production
  const isProduction = process.env.ENVIRONMENT === 'production';
  if (isProduction && validationResult.environment === 'sandbox') {
    log.warn('Sandbox receipt in production', {
      platform,
      productId,
      profile: profileId.substring(0, 8) + '***',
    });
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid purchase environment' }),
    };
  }

  // ──────── Store entitlement in transaction ────────
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO user_entitlements (
        profile_id, product_type, platform, store_transaction_id,
        original_transaction_id, store_product_id, purchase_date,
        expires_date, is_active, is_trial, environment, raw_receipt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (platform, store_transaction_id) DO NOTHING`,
      [
        profileId,
        productType,
        platform,
        transactionId,
        validationResult.originalTransactionId ?? null,
        productId,
        validationResult.purchaseDate ? new Date(validationResult.purchaseDate) : new Date(),
        validationResult.expiresDate ? new Date(validationResult.expiresDate) : null,
        true,
        validationResult.isTrial ?? false,
        validationResult.environment ?? 'production',
        platform === 'ios' ? receipt : purchaseToken,
      ],
    );

    // Apply the entitlement (e.g., upgrade account type)
    await applyEntitlement(client, profileId, productType);

    await client.query('COMMIT');

    log.info('IAP entitlement created', {
      platform,
      productType,
      profile: profileId.substring(0, 8) + '***',
      environment: validationResult.environment,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, productType }),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
