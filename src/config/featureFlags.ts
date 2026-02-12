declare const __DEV__: boolean;

/**
 * Feature Flags — Toggle features on/off before production launch.
 *
 * Set a flag to `false` to hide the feature from the UI entirely.
 * The code stays in place, only entry points are gated.
 *
 * PROD_FEATURES is used in ALL builds (dev + production).
 * Monetization features are disabled for V1 App Store submission.
 */

/**
 * Production flags — only these matter in release builds.
 *
 * V1 Store Submission Strategy:
 * - Keep content creation, social, discovery, peaks — the core value prop
 * - Disable ALL Stripe-dependent monetization (Apple requires IAP for digital goods)
 * - Disable live streaming & battles (require robust moderation for App Store)
 * - Re-enable in V2/V3 updates once IAP is implemented or Apple entitlement granted
 */
const PROD_FEATURES = {
  // ─── Content Creation ────────────────────────────
  CREATE_POST: true,
  CREATE_PEAK: true,

  // ─── Social ──────────────────────────────────────
  MESSAGING: true,
  FOLLOW_SYSTEM: true,
  NOTIFICATIONS: true,
  SEARCH: true,

  // ─── Discovery / Xplorer ─────────────────────────
  XPLORER_MAP: true,
  CREATE_ACTIVITY: true,       // V1: unified event/group creation screen
  SPOTS: true,

  // ─── Live Streaming ──────────────────────────────
  GO_LIVE: false,              // V4: requires content moderation for App Store
  VIEWER_LIVE_STREAM: false,   // V4: requires content moderation for App Store

  // ─── Challenges & Battles ────────────────────────
  CHALLENGES: true,            // Merged into Peaks — no payment involved
  BATTLES: false,              // V4: requires content moderation + live infra

  // ─── Monetization / Sessions ─────────────────────
  PRIVATE_SESSIONS: false,     // V3: Stripe direct — needs Apple IAP
  CHANNEL_SUBSCRIBE: false,    // V3: Stripe direct — needs Apple IAP
  TIPPING: false,              // V3: Stripe direct — needs Apple IAP
  CREATOR_WALLET: false,       // V3: needs backend + IAP
  GIFTING: false,              // V3: needs backend + IAP

  // ─── Business Features ───────────────────────────
  BUSINESS_DISCOVERY: true,    // V1: browsing is free, no payment
  BUSINESS_DASHBOARD: false,   // V2: owner management screens
  BUSINESS_BOOKING: false,     // V3: Stripe Connect — needs Apple IAP
  BUSINESS_SCANNER: false,     // V2: QR scanner, tied to dashboard

  // ─── Account / Settings ──────────────────────────
  UPGRADE_TO_PRO: false,       // V3: Stripe platform subscription — needs Apple IAP
  IDENTITY_VERIFICATION: false, // V3: Stripe Identity — tied to monetization
  PLATFORM_SUBSCRIPTION: false, // V3: Stripe subscription — needs Apple IAP

  // ─── Disputes & Resolution ─────────────────────
  DISPUTES: true,               // V3: ENABLED - deployed 2026-02-09

  // ─── Vibe Ecosystem ────────────────────────────
  VIBE_GUARDIAN: true,            // V1: anti-doom-scroll breathing overlay
  EMOTIONAL_RIPPLE: true,         // V1: positive interaction ripple on profile
  VIBE_PRESCRIPTIONS: true,       // V1: context-aware wellness missions
  VIBE_SCORE: true,               // V1: passive vibe score + levels + badges
} as const;

export type FeatureKey = keyof typeof PROD_FEATURES;

/** Use production flags in all builds — monetization disabled for V1 App Store */
export const FEATURES: Record<FeatureKey, boolean> = { ...PROD_FEATURES };

/** Check if a feature is enabled */
export const isFeatureEnabled = (key: FeatureKey): boolean => FEATURES[key];
