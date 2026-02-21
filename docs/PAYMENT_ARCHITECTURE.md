# Smuppy — Payment Architecture & Store Compliance

> **Parent**: [CLAUDE.md](../CLAUDE.md) | **Legal**: [APP_STORE_COMPLIANCE.md](./legal/APP_STORE_COMPLIANCE.md) | **Accounts**: [ACCOUNT_TYPES.md](./ACCOUNT_TYPES.md)
>
> Last updated: 2026-02-21

---

## 1. Payment Classification (12 types)

Every payment in Smuppy falls into exactly one of three categories based on its **economic nature** — not its feature area.

### Category A — Digital Entitlements

Rights that unlock features or content consumed **inside the app**.

| # | Product | Price | Recurrence | Beneficiary | iOS | Android | Web |
|---|---------|-------|-----------|-------------|-----|---------|-----|
| A1 | Pro Creator Premium | $99/mo | Monthly | Smuppy 100% | **IAP** | **Play Billing** | Stripe |
| A2 | Pro Business Premium | $49/mo | Monthly | Smuppy 100% | **IAP** | **Play Billing** | Stripe |
| A3 | Verified Badge | $14.90/mo | Monthly | Smuppy 100% | **IAP** | **Play Billing** | Stripe |
| A4 | Channel Subscription | $4.99+/mo | Monthly | Creator (tiered) | **IAP** | **Play Billing** | Stripe |
| A5 | Tips | $1-$500 | One-time | Creator 85% | **IAP** | Stripe | Stripe |

**Why IAP?** Apple Guidelines 3.1.1: "If you want to unlock features or functionality within your app, you must use in-app purchase." These products grant digital access (premium features, exclusive content, verified status, fan-only streams).

**Tips special case:** Apple classifies tips to content creators as digital goods (App Store Guideline 3.1.1). Safest approach: IAP on iOS, Stripe everywhere else.

### Category B — Real-World Services

Services delivered by a **real person** or at a **physical location**. Apple Guidelines 3.1.3(e) explicitly exempts these.

| # | Product | Price | Recurrence | Beneficiary | iOS | Android | Web |
|---|---------|-------|-----------|-------------|-----|---------|-----|
| B1 | 1:1 Session (coaching) | Variable | One-time | Creator 80% | Stripe | Stripe | Stripe |
| B2 | Session Pack (bundle) | Variable | One-time | Creator 80% | Stripe | Stripe | Stripe |
| B3 | Business Drop-in (class) | Variable | One-time | Business 85% | Stripe | Stripe | Stripe |
| B4 | Business Pass (multi-entry) | Variable | One-time | Business 85% | Stripe | Stripe | Stripe |
| B5 | Business Subscription (gym membership) | Variable | Recurring | Business 85% | Stripe | Stripe | Stripe |
| B6 | Event Entry Fee (IRL) | Variable | One-time | Creator 80% | Stripe | Stripe | Stripe |
| B7 | Group Activity Fee (IRL) | Variable | One-time | Creator 80% | Stripe | Stripe | Stripe |

**Why Stripe OK?** Precedents: ClassPass (fitness classes), Cameo (personalized sessions), Uber (services), Airbnb (bookings). All use external payment for real-world services.

### Revenue Split Summary

| Split | Products |
|-------|----------|
| 100% Smuppy | A1, A2, A3 (platform subscriptions + verification) |
| 85% Creator / 15% Smuppy | A5 (tips) |
| 80% Creator / 20% Smuppy | B1, B2, B6, B7 (sessions, packs, events, groups) |
| 60-80% Creator / tiered | A4 (channel subs — scales with fan count) |
| 85% Business / 15% Smuppy | B3, B4, B5 (business services) |

---

## 2. Architecture: Two Payment Engines

```
                         ┌─────────────────────────────────┐
                         │        SMUPPY APP               │
                         │                                 │
                         │   usePayment(type, platform)    │
                         │           │                     │
                         │     ┌─────┴──────┐              │
                         │     │            │              │
                         │  Digital?    Service?           │
                         │     │            │              │
                         └─────┼────────────┼──────────────┘
                               │            │
                    ┌──────────┴──┐   ┌─────┴──────────┐
                    │  ENGINE A   │   │   ENGINE B      │
                    │  IAP        │   │   Stripe        │
                    │             │   │                  │
                    │ iOS: StoreKit   │ Web Checkout     │
                    │ Android: Play   │ PaymentIntent    │
                    │ Web: Stripe │   │ Connect splits   │
                    └──────┬──────┘   └────────┬────────┘
                           │                   │
                    ┌──────┴──────┐   ┌────────┴────────┐
                    │  BACKEND    │   │  BACKEND         │
                    │             │   │                  │
                    │ /iap/verify │   │ /payments/*      │
                    │ receipt     │   │ web-checkout     │
                    │ validation  │   │ webhook          │
                    └──────┬──────┘   └────────┬────────┘
                           │                   │
                    ┌──────┴───────────────────┴────────┐
                    │          UNIFIED DATABASE          │
                    │                                    │
                    │  user_entitlements (digital)       │
                    │  payments (services)               │
                    │  wallet_transactions (payouts)     │
                    └───────────────────────────────────┘
```

### Engine A — Digital Entitlements (IAP)

Handles: A1-A5 (Pro subs, Verified, Channel subs, Tips on iOS)

**iOS:** Apple StoreKit 2 via `expo-in-app-purchases`
**Android:** Google Play Billing via `expo-in-app-purchases`
**Web:** Stripe Checkout (existing `web-checkout.ts`)

**Backend validation required:** Never trust the client. Always verify receipts server-side before granting entitlements.

### Engine B — Service Payments (Stripe)

Handles: B1-B7 (Sessions, Packs, Business services, Events, Groups)

**All platforms:** Stripe Web Checkout via `useStripeCheckout` hook (existing).

No IAP needed — these are real-world services exempt under Apple Guidelines 3.1.3(e).

---

## 3. Current Implementation Status

### Fully implemented (Stripe Web Checkout)

| Product | Backend | Frontend | Webhook | Status |
|---------|---------|----------|---------|--------|
| A1 Pro Creator | `platform-subscription.ts` | `PlatformSubscriptionScreen` | `checkout.session.completed` | **Working** |
| A2 Pro Business | `platform-subscription.ts` | `PlatformSubscriptionScreen` | `checkout.session.completed` | **Working** |
| A3 Verified | `identity.ts` | `IdentityVerificationScreen` | `identity.verification_session.*` | **Working** |
| A4 Channel Sub | `channel-subscription.ts` | `ChannelSubscriptionScreen` | `checkout.session.completed` | **Working** |
| A5 Tips | `tips/send.ts` + `web-checkout.ts` | `TipModal` + `useTipPayment` | `checkout.session.completed` | **Working** |
| B1 1:1 Session | `create-intent.ts` | `SessionPaymentScreen` | `payment_intent.succeeded` | **Working** |
| B2 Session Pack | `create-intent.ts` | `PackPurchaseScreen` | `payment_intent.succeeded` | **Working** |
| B3 Business Drop-in | `business-checkout.ts` | `BusinessBookingScreen` | `checkout.session.completed` | **Working** |
| B4 Business Pass | `business-checkout.ts` | `BusinessBookingScreen` | `checkout.session.completed` | **Working** |
| B5 Business Sub | `business-checkout.ts` | `BusinessSubscriptionScreen` | `checkout.session.completed` | **Working** |

### Not implemented

| Product | What exists | What's missing |
|---------|------------|----------------|
| B6 Event Entry Fee | DB columns (`is_free`, `price`, `currency`), `join.ts` returns `requiresPayment: true` | No payment handler, no webhook, no frontend checkout |
| B7 Group Activity Fee | DB columns (`is_free`, `price`, `currency`), `join.ts` returns `requiresPayment: true` | No payment handler, no webhook, no frontend checkout |
| **IAP (all A products)** | Zero — no `react-native-iap`, no receipt validation endpoint, no product IDs | Everything |

---

## 4. Execution Plan

> **Phase order rationale:** IAP is the #1 blocker for App Store approval.
> Events/Groups Stripe has zero compliance impact and can ship after store validation.
> Order: IAP → Store → Stripe services → Optimize.

### Phase 0 — Documentation & Decisions (this document)

- [x] Classify all 12 payment types
- [x] Decide IAP vs Stripe per type per platform
- [x] Define revenue splits
- [x] Write architecture doc

### Phase 1 — IAP Implementation (Digital Products on iOS/Android)

> **WHY FIRST:** This is the ONLY blocker for App Store approval.
> Without IAP, digital products (Pro, Verified, Channel Sub, Tips) will trigger rejection.
> This is the largest phase. Sub-phases below.

#### 1.1 Install dependencies

```bash
npx expo install expo-in-app-purchases
npx expo-doctor  # verify SDK compatibility
```

Update `app.config.js` plugins:

```javascript
plugins: [
  // ... existing plugins
  'expo-in-app-purchases',
]
```

#### 1.2 Define product IDs

**File to create:** `src/config/iap-products.ts`

```typescript
import { Platform } from 'react-native';

export const IAP_PRODUCTS = {
  PRO_CREATOR: Platform.select({
    ios: 'com.nou09.Smuppy.pro_creator_monthly',
    android: 'com_nou09_smuppy_pro_creator_monthly',
    default: null, // web uses Stripe
  }),
  PRO_BUSINESS: Platform.select({
    ios: 'com.nou09.Smuppy.pro_business_monthly',
    android: 'com_nou09_smuppy_pro_business_monthly',
    default: null,
  }),
  VERIFIED: Platform.select({
    ios: 'com.nou09.Smuppy.verified_monthly',
    android: 'com_nou09_smuppy_verified_monthly',
    default: null,
  }),
  CHANNEL_SUB: Platform.select({
    // Channel sub is per-creator, needs dynamic product ID
    // iOS: create in App Store Connect per creator tier
    // Simplification: use a single $4.99 product, handle tiers server-side
    ios: 'com.nou09.Smuppy.channel_sub_monthly',
    android: 'com_nou09_smuppy_channel_sub_monthly',
    default: null,
  }),
  TIP_SMALL: Platform.select({
    ios: 'com.nou09.Smuppy.tip_200',  // $2
    android: null, // Android uses Stripe for tips
    default: null,
  }),
  TIP_MEDIUM: Platform.select({
    ios: 'com.nou09.Smuppy.tip_500',  // $5
    android: null,
    default: null,
  }),
  TIP_LARGE: Platform.select({
    ios: 'com.nou09.Smuppy.tip_1000', // $10
    android: null,
    default: null,
  }),
  TIP_XL: Platform.select({
    ios: 'com.nou09.Smuppy.tip_2000', // $20
    android: null,
    default: null,
  }),
} as const;

// Route: should this product use IAP on this platform?
export function shouldUseIAP(productCategory: 'digital' | 'service'): boolean {
  if (productCategory === 'service') return false; // Always Stripe
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
```

#### 1.3 Create IAP hook

**File to create:** `src/hooks/useIAPCheckout.ts`

Responsibilities:
- Initialize IAP connection on mount
- Fetch products from Store
- Handle purchase flow (request → verify → grant)
- Send receipt to backend for server-side validation
- Return same result shape as `useStripeCheckout` for uniform handling

```typescript
// Simplified interface — same shape as useStripeCheckout result
type IAPResult =
  | { status: 'success'; transactionId: string }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };
```

#### 1.4 Backend: receipt validation endpoint

**File to create:** `aws-migration/lambda/api/payments/iap-verify.ts`

```
POST /payments/iap/verify
Body: {
  platform: 'ios' | 'android',
  receipt: string,          // iOS: base64 receipt, Android: purchase token
  productId: string,        // e.g. 'com.nou09.Smuppy.pro_creator_monthly'
  transactionId: string,
}
```

**iOS validation:** Call Apple's `verifyReceipt` endpoint (or App Store Server API v2).
**Android validation:** Call Google Play Developer API `purchases.subscriptions.get`.

On success:
- Create/update `user_entitlements` record
- For subscriptions: store `expires_at` from receipt
- For consumables (tips): credit creator wallet immediately
- Return `{ success: true, entitlement: { type, expiresAt } }`

On failure:
- Log fraud attempt
- Return `{ success: false, message: 'Verification failed' }`

**Critical security rules:**
- NEVER trust client-provided receipt without server validation
- Check receipt `bundle_id` matches `com.nou09.Smuppy`
- Check receipt `product_id` matches expected product
- Check transaction hasn't been used before (deduplication)
- For subscriptions: set up Apple App Store Server Notifications v2

#### 1.5 Backend: subscription sync

**Webhook from Apple/Google:**

Apple: App Store Server Notifications v2 → new Lambda endpoint
Google: Real-Time Developer Notifications via Pub/Sub → new Lambda endpoint

These handle:
- Subscription renewal
- Subscription cancellation
- Subscription grace period
- Billing retry
- Refund (initiated by Apple/Google)

#### 1.6 Modify frontend screens to route by platform

**Pattern for every digital product screen:**

```typescript
import { shouldUseIAP } from '../config/iap-products';

// In the payment handler:
if (shouldUseIAP('digital')) {
  // Native IAP flow
  const result = await purchaseIAP(IAP_PRODUCTS.PRO_CREATOR);
  if (result.status === 'success') {
    // Backend verifies receipt, grants entitlement
    await awsAPI.request('/payments/iap/verify', {
      method: 'POST',
      body: { platform: Platform.OS, receipt: result.receipt, ... },
    });
  }
} else {
  // Web: existing Stripe flow
  const response = await awsAPI.request('/payments/platform-subscription', {
    method: 'POST',
    body: { action: 'subscribe', planType: 'pro_creator' },
  });
  const result = await openCheckout(response.checkoutUrl, response.sessionId);
}
```

**Screens to modify:**

| Screen | File | Change |
|--------|------|--------|
| PlatformSubscriptionScreen | `src/screens/payments/PlatformSubscriptionScreen.tsx` | Add `shouldUseIAP` gate for Pro Creator/Business |
| ChannelSubscriptionScreen | `src/screens/payments/ChannelSubscriptionScreen.tsx` | Add `shouldUseIAP` gate for channel subs |
| IdentityVerificationScreen | `src/screens/payments/IdentityVerificationScreen.tsx` | Add `shouldUseIAP` gate for verified badge |
| TipModal | `src/components/tips/TipModal.tsx` | Add `shouldUseIAP` gate (iOS only) |

**Screens that stay Stripe-only (no change):**

| Screen | File | Reason |
|--------|------|--------|
| SessionPaymentScreen | `src/screens/sessions/SessionPaymentScreen.tsx` | Real-world service |
| PackPurchaseScreen | `src/screens/sessions/PackPurchaseScreen.tsx` | Real-world service |
| BusinessBookingScreen | `src/screens/business/BusinessBookingScreen.tsx` | Physical service |
| BusinessSubscriptionScreen | `src/screens/business/BusinessSubscriptionScreen.tsx` | Physical service |

#### 1.7 App Store Connect + Google Play Console setup

**iOS (App Store Connect):**
1. Create app record with bundle ID `com.nou09.Smuppy`
2. Go to Features → In-App Purchases
3. Create subscription group: "Smuppy Premium"
4. Add products: `pro_creator_monthly`, `pro_business_monthly`, `verified_monthly`
5. Create subscription group: "Channel Subscriptions"
6. Add product: `channel_sub_monthly`
7. Create consumables: `tip_200`, `tip_500`, `tip_1000`, `tip_2000`
8. Configure App Store Server Notifications v2 URL
9. Set up sandbox test accounts

**Android (Google Play Console):**
1. Go to Monetize → Products → Subscriptions
2. Create: `com_nou09_smuppy_pro_creator_monthly`, etc.
3. Configure Real-Time Developer Notifications
4. Set up internal testing track

#### 1.8 Database: entitlements table

**Migration:**

```sql
CREATE TABLE IF NOT EXISTS user_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_type VARCHAR(50) NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('ios', 'android', 'web')),
  transaction_id VARCHAR(255),
  original_transaction_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'canceled', 'grace_period')),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_type, source)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON user_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_expires ON user_entitlements(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_entitlements_transaction ON user_entitlements(original_transaction_id);
```

---

### Phase 2 — Store Submission

> **WHY SECOND:** Once IAP is in, you can submit. Don't wait for Events/Groups or Stripe live.

#### 2.1 Pre-submission checklist

**App Store (iOS):**
- [ ] IAP products created and approved in App Store Connect
- [ ] Sandbox testing passes for all IAP flows
- [ ] Receipt validation endpoint deployed and tested
- [ ] App Store Server Notifications v2 configured
- [ ] No mention of external payment for digital goods in iOS UI
- [ ] Service payments (sessions, bookings) use neutral wording: "Book on smuppy.com"
- [ ] External Link Entitlement disclosure text present (if applicable)
- [ ] App description uses "consultation", "coaching", "services" (not "buy", "unlock", "premium content")
- [ ] Screenshots don't show Stripe checkout for digital products on iOS
- [ ] Privacy Policy and Terms of Service URLs configured

**Google Play (Android):**
- [ ] Play Billing products created
- [ ] Real-Time Developer Notifications configured
- [ ] All digital goods use Play Billing
- [ ] Service payments can use Stripe (Google is less strict than Apple)

#### 2.2 Wording rules

| Context | Use | Avoid |
|---------|-----|-------|
| 1:1 Sessions | "Book a consultation", "Reserve a coaching session" | "Buy", "Purchase", "Unlock" |
| Business booking | "Book a class", "Reserve your spot" | "Buy access", "Purchase membership" |
| Events | "Register for event", "Join activity" | "Buy ticket" (triggers digital good flag) |
| Pro upgrade (iOS) | Standard IAP button (system UI) | Custom "Pay $99" button |
| Pro upgrade (Web) | "Upgrade on smuppy.com" | "Pay less on web" (Apple prohibits this) |

#### 2.3 Critical Apple rule

**NEVER display in the iOS app:**
- A lower web price next to a higher IAP price
- A button or link to pay via web for digital goods
- Wording suggesting the user should pay outside the app for digital content

---

### Phase 3 — Deploy Stripe Live + Events/Groups

> **WHY THIRD:** No compliance impact. Can ship after store approval.
> Service payments (sessions, bookings, events) are exempt under Apple 3.1.3(e).

#### 3.1 Stripe Dashboard configuration (live mode)

| Step | Action |
|------|--------|
| 3.1.1 | Activate live mode in Stripe Dashboard |
| 3.1.2 | Create 3 Price IDs (Pro Creator $99/mo, Pro Business $49/mo, Verification $14.90/mo) — used as Stripe-side fallback for web purchases |
| 3.1.3 | Create webhook endpoint → `POST https://<API_GATEWAY>/payments/webhook` |
| 3.1.4 | Select all 16 event types (see list in webhook.ts) |
| 3.1.5 | Copy `whsec_xxx` signing secret |

#### 3.2 AWS Secrets Manager

```bash
aws secretsmanager put-secret-value \
  --secret-id "smuppy/production/stripe-secrets" \
  --secret-string '{
    "STRIPE_SECRET_KEY": "sk_live_...",
    "STRIPE_PUBLISHABLE_KEY": "pk_live_...",
    "STRIPE_WEBHOOK_SECRET": "whsec_..."
  }'
```

#### 3.3 CDK environment variables

**File:** `aws-migration/infrastructure/lib/smuppy-stack.ts`

Add to Lambda environment block:

```typescript
WEB_DOMAIN: 'https://smuppy.com',
DEFAULT_CURRENCY: 'eur',
STRIPE_PRICE_PRO_CREATOR: 'price_xxx',    // from 3.1.2
STRIPE_PRICE_PRO_BUSINESS: 'price_xxx',   // from 3.1.2
STRIPE_VERIFICATION_PRICE_ID: 'price_xxx', // from 3.1.2
```

Then `cdk deploy`.

#### 3.4 Deploy web checkout return pages

**Files exist:** `aws-migration/web/checkout/success.html`, `cancel.html`

Upload to S3/CloudFront or smuppy.com web host:

```bash
aws s3 cp aws-migration/web/checkout/success.html s3://$BUCKET/checkout/success.html \
  --content-type "text/html" --cache-control "no-cache"
aws s3 cp aws-migration/web/checkout/cancel.html s3://$BUCKET/checkout/cancel.html \
  --content-type "text/html" --cache-control "no-cache"
```

Verify: `curl -s -o /dev/null -w "%{http_code}" https://smuppy.com/checkout/success` returns 200.

#### 3.5 Deep links: AASA + Asset Links

**iOS** — Host at `https://smuppy.com/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "<TEAM_ID>.com.nou09.Smuppy",
      "paths": ["/checkout/*", "/profile/*", "/post/*", "/peak/*"]
    }]
  }
}
```

**Android** — Host at `https://smuppy.com/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.nou09.Smuppy",
    "sha256_cert_fingerprints": ["<SHA256>"]
  }
}]
```

#### 3.6 Add `event` and `group` to `web-checkout.ts`

**File:** `aws-migration/lambda/api/payments/web-checkout.ts`

Add two new product types to `buildCheckoutConfig()`:

```typescript
// event: one-time payment for event entry
case 'event': {
  const event = await db.query(
    'SELECT id, title, price, currency, creator_id FROM events WHERE id = $1 AND is_free = false',
    [productId]
  );
  // Verify event exists, is paid, has capacity
  // Get creator's Connect account
  // Build Checkout Session with transfer_data (80% creator)
  // success_url: ${WEB_DOMAIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=event&id=${productId}
}

// group: one-time payment for group activity
case 'group': {
  const group = await db.query(
    'SELECT id, name, price, currency, creator_id FROM groups WHERE id = $1 AND is_free = false',
    [productId]
  );
  // Same pattern as event
}
```

#### 3.7 Add webhook handling for events/groups

**File:** `aws-migration/lambda/api/payments/webhook.ts`

In `handleCheckoutSessionCompleted()`, add cases for `event` and `group` metadata types:

```typescript
case 'event':
  // INSERT INTO event_participants (event_id, user_id, payment_id, amount_paid, status)
  // UPDATE events SET current_participants = current_participants + 1
  // Send notification to event creator
  break;

case 'group':
  // INSERT INTO group_members (group_id, user_id, payment_id, role)
  // UPDATE groups SET current_participants = current_participants + 1
  // Send notification to group creator
  break;
```

#### 3.8 Update `events/join.ts` and `groups/join.ts`

When `requiresPayment: true`, also return data needed by the frontend:

```typescript
return {
  success: true,
  requiresPayment: true,
  price: event.price,
  currency: event.currency,
  eventId: event.id,
  creatorId: event.creator_id,
};
```

#### 3.9 Frontend: handle `requiresPayment` response

In the event/group detail screens, when join returns `requiresPayment: true`:

```typescript
const response = await awsAPI.createWebCheckout({
  productType: 'event',
  productId: event.id,
});
const result = await openCheckout(response.checkoutUrl, response.sessionId);
if (result.status === 'success') {
  // Refresh event detail (participant count updated via webhook)
}
```

No new screens needed — uses existing `useStripeCheckout` hook.

#### 3.10 Smoke tests (per flow)

| Flow | Test card | Verify |
|------|-----------|--------|
| Pro Creator upgrade (web) | `4242 4242 4242 4242` | `profiles.account_type = 'pro_creator'` |
| Channel subscription (web) | `4242 4242 4242 4242` | `channel_subscriptions` row created |
| Identity verification (web) | `4242 4242 4242 4242` | `profiles.is_verified = true` |
| Tip $5 (web) | `4242 4242 4242 4242` | `tips` row + wallet transaction |
| 1:1 Session booking | `4242 4242 4242 4242` | `private_sessions.payment_status = 'paid'` |
| Event entry (paid) | `4242 4242 4242 4242` | `event_participants` row with `payment_id` |
| Group activity (paid) | `4242 4242 4242 4242` | `group_members` row with `payment_id` |
| Connect onboarding | Express KYC | `charges_enabled: true` |

---

### Phase 4 — Marketplace Optimization

> Post-launch. Iterate based on real usage data.

- Refund/cancellation policy for paid events (e.g. >24h before = full refund)
- Creator analytics: revenue by source (IAP vs Stripe vs web)
- Subscription upgrade/downgrade paths (Pro Creator <-> Pro Business)
- Multi-currency support (EUR, USD, GBP)
- Payout scheduling optimization (weekly → daily for high-volume creators)

---

## 5. Temporary Safe Strategy (Before IAP is ready)

If you need to submit to the App Store **before Phase 1 is complete**:

### Option: Hide Digital Purchase Buttons on iOS

1. **Do NOT show** any purchase button for digital products (Pro, Verified, Channel Sub, Tips) in the iOS build
2. Users discover these features exist, but the app says "Manage your account at smuppy.com"
3. App reads entitlements from backend (existing `get-status` endpoints work regardless of payment source)
4. Service payments (sessions, bookings) remain fully functional via Stripe

**Critical wording rules for web-only approach:**
- **DO:** "Manage your subscription at smuppy.com"
- **DO:** Simply hide the purchase button entirely (safest)
- **DON'T:** "Subscribe on web for a better price"
- **DON'T:** "Pay on smuppy.com to avoid App Store fees"
- **DON'T:** Link directly to a checkout page from the iOS app for digital goods
- **DON'T:** Show a comparison between IAP price and web price

**Implementation:**

```typescript
// Feature flag — set to true once IAP is implemented
const IAP_ENABLED = false;

// In each digital product screen:
if (Platform.OS === 'ios' && !IAP_ENABLED) {
  // Option A (safest): hide the purchase entirely
  return null;
  // Option B: neutral manage link (Netflix/Spotify style)
  return <Text>Manage your account at smuppy.com</Text>;
}
```

**Precedent:** Netflix, Spotify, Kindle, Amazon all hide purchase buttons on iOS and manage subscriptions via their website. Apple explicitly allows this (they just can't link to external payment for digital goods).

---

## 6. Security Requirements (MANDATORY)

Every payment engine must satisfy these. Items marked with current status.

### Stripe Engine (Engine B)

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Webhook signature verification | **Done** | `stripe.webhooks.constructEvent()` in `webhook.ts` |
| Webhook idempotency | **Done** | 2-layer dedup: in-memory Map + DB `processed_webhook_events` |
| Webhook replay protection | **Done** | Reject events older than 5 minutes |
| Server-side amount validation | **Done** | Price fetched from DB, never trusted from client |
| Parameterized SQL | **Done** | All queries use `$1, $2, ...` |
| Ownership verification | **Done** | `author_id === profileId` checked before mutations |
| Rate limiting | **Done** | Per-endpoint limits (5-60 req/min) |
| Circuit breaker | **Done** | `stripe-resilience.ts`: 5 failures → open, 60s window |
| Secrets in Secrets Manager | **Done** | `getStripeSecrets()` with 30-min TTL cache |
| Error sanitization | **Done** | Never expose Stripe error details to client |
| Refund handling | **Done** | `refunds.ts` with `charge.refunded` webhook |
| Dispute handling + admin alerts | **Done** | `charge.dispute.*` events → SNS alerts |

### IAP Engine (Engine A) — TO IMPLEMENT

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Server-side receipt validation | **TODO** | `iap-verify.ts` — validate with Apple/Google servers |
| Bundle ID verification | **TODO** | Check receipt `bundle_id` === `com.nou09.Smuppy` |
| Product ID verification | **TODO** | Check receipt `product_id` matches expected SKU |
| Transaction deduplication | **TODO** | Check `original_transaction_id` not already processed |
| Replay attack prevention | **TODO** | Reject receipts with old `purchase_date` |
| Apple App Store Server Notifications v2 | **TODO** | New Lambda endpoint for subscription lifecycle |
| Google Real-Time Developer Notifications | **TODO** | New Lambda endpoint via Pub/Sub |
| Subscription renewal sync | **TODO** | Cron or notification-driven: update `expires_at` |
| Grace period handling | **TODO** | 16-day billing retry window (Apple), 7-day (Google) |
| Refund sync (Apple/Google initiated) | **TODO** | Revoke entitlement when store issues refund |
| Cross-platform entitlement sync | **TODO** | User buys on iOS → entitlement visible on Android/web |
| Upgrade/downgrade detection | **TODO** | Detect plan change (Pro Creator ↔ Pro Business), adjust `product_type` + prorate |
| Environment switching (sandbox vs prod) | **TODO** | Route receipt validation to sandbox or production Apple/Google endpoint based on `ENVIRONMENT` env var |
| Fraud logging | **TODO** | Log failed receipt validations with user ID + IP |

### Cross-Engine Security

| Requirement | Status | Notes |
|-------------|--------|-------|
| Never grant entitlement from client | **Enforced** | Always wait for backend confirmation (webhook or receipt validation) |
| Single source of truth for entitlements | **TODO** | `user_entitlements` table — both engines write here |
| Entitlement expiry check | **TODO** | Query `WHERE status = 'active' AND expires_at > NOW()` |
| No PII in logs | **Done** | User IDs masked to first 8 chars + `***` |
| Audit trail for all payments | **Done** (Stripe) / **TODO** (IAP) | `payments` table + `wallet_transactions` |

---

## 7. Files Reference

### Backend (Lambda handlers)

| File | Handles |
|------|---------|
| `payments/web-checkout.ts` | Unified Stripe Checkout (all types) |
| `payments/platform-subscription.ts` | Pro Creator/Business subs |
| `payments/channel-subscription.ts` | Fan channel subs |
| `payments/identity.ts` | Identity verification + subscription |
| `payments/create-intent.ts` | PaymentIntent (sessions, packs) |
| `payments/business-checkout.ts` | Business services (drop-in, pass, sub) |
| `payments/webhook.ts` | All Stripe event processing |
| `payments/connect.ts` | Creator Connect onboarding |
| `payments/wallet.ts` | Creator earnings + payouts |
| `payments/refunds.ts` | Refund processing |
| `payments/payment-methods.ts` | Saved cards management |
| `payments/iap-verify.ts` | **TO CREATE** — IAP receipt validation |
| `tips/send.ts` | Tip creation |

### Frontend (screens + hooks)

| File | Handles |
|------|---------|
| `hooks/useStripeCheckout.ts` | Web checkout flow (poll + verify) |
| `hooks/useTipPayment.ts` | Tip flow |
| `hooks/useIAPCheckout.ts` | **TO CREATE** — IAP purchase flow |
| `config/iap-products.ts` | **TO CREATE** — Product ID mapping |
| `screens/payments/PlatformSubscriptionScreen.tsx` | Pro upgrade |
| `screens/payments/ChannelSubscriptionScreen.tsx` | Channel sub |
| `screens/payments/IdentityVerificationScreen.tsx` | Verification |
| `components/tips/TipModal.tsx` | Tip UI |

### Infrastructure

| File | Handles |
|------|---------|
| `infrastructure/lib/smuppy-stack.ts` | Lambda env vars, Stripe secret |
| `infrastructure/lib/lambda-stack.ts` | Lambda functions + IAM |
| `infrastructure/lib/api-gateway-2-stack.ts` | Payment API routes |
| `web/checkout/success.html` | Post-checkout return page |
| `web/checkout/cancel.html` | Post-checkout cancel page |

---

## 8. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-21 | Hybrid IAP + Stripe architecture | Apple requires IAP for digital goods; Stripe for services is exempt under 3.1.3(e) |
| 2026-02-21 | Tips use IAP on iOS, Stripe elsewhere | Apple classifies creator tips as digital goods |
| 2026-02-21 | Events/Groups use Stripe (all platforms) | Physical/IRL activities are real-world services |
| 2026-02-21 | Channel subs: single IAP product, tiers server-side | Avoids creating thousands of per-creator IAP products |
| 2026-02-21 | Web-only fallback as temporary safe strategy | Allows App Store submission before IAP implementation |
| 2026-02-21 | Phase order: IAP → Store → Stripe live/Events → Optimize | IAP is the only Store approval blocker; Events/Groups have zero compliance impact |
| 2026-02-21 | Web-only wording: hide buttons, don't link to external payment | Apple rejects apps that actively redirect to web for digital goods, but allows hiding purchase entirely (Netflix model) |
