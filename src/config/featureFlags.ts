declare const __DEV__: boolean;

/**
 * Feature Flags — Toggle features on/off before production launch.
 *
 * Set a flag to `false` to hide the feature from the UI entirely.
 * The code stays in place, only entry points are gated.
 *
 * In __DEV__ (Expo Go / dev builds), ALL features are enabled for testing.
 * In production builds, only flags set to `true` below are enabled.
 */

/** Production flags — only these matter in release builds */
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
  CREATE_EVENT: true,
  CREATE_GROUP: true,
  SPOTS: true,

  // ─── Live Streaming ──────────────────────────────
  GO_LIVE: false,           // Needs backend: token gen, stream registry, notifications
  VIEWER_LIVE_STREAM: false,

  // ─── Challenges & Battles ────────────────────────
  CHALLENGES: false,        // Needs backend: scoring, voting, moderation
  BATTLES: false,

  // ─── Monetization / Sessions ─────────────────────
  PRIVATE_SESSIONS: false,  // Needs backend: Stripe Connect, booking, availability
  CHANNEL_SUBSCRIBE: false, // Needs backend: Stripe Subscriptions
  TIPPING: false,           // Needs backend: PaymentIntents, creator payouts
  CREATOR_WALLET: false,    // Needs backend: balance, transactions, withdrawals
  GIFTING: false,

  // ─── Business Features ───────────────────────────
  BUSINESS_DISCOVERY: false,
  BUSINESS_DASHBOARD: false,
  BUSINESS_BOOKING: false,
  BUSINESS_SCANNER: false,

  // ─── Account / Settings ──────────────────────────
  UPGRADE_TO_PRO: false,    // Needs backend: Stripe webhook for account upgrade
  IDENTITY_VERIFICATION: false,
  PLATFORM_SUBSCRIPTION: false,
} as const;

export type FeatureKey = keyof typeof PROD_FEATURES;

/** In dev/staging all features are enabled; in prod use the flags above */
export const FEATURES: Record<FeatureKey, boolean> = __DEV__
  ? (Object.fromEntries(Object.keys(PROD_FEATURES).map(k => [k, true])) as Record<FeatureKey, boolean>)
  : { ...PROD_FEATURES };

/** Check if a feature is enabled */
export const isFeatureEnabled = (key: FeatureKey): boolean => FEATURES[key];
