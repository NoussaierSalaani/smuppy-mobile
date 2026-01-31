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
  CHALLENGES: true,         // Merged into Peaks — challenge toggle on peak creation
  BATTLES: false,

  // ─── Monetization / Sessions ─────────────────────
  PRIVATE_SESSIONS: true,   // Backend ready: sessions handlers + Stripe Connect
  CHANNEL_SUBSCRIBE: true,  // Backend ready: channel-subscription handler
  TIPPING: true,            // Backend ready: tips handlers + PaymentIntents
  CREATOR_WALLET: false,    // Needs backend: balance, transactions, withdrawals
  GIFTING: false,

  // ─── Business Features ───────────────────────────
  BUSINESS_DISCOVERY: true,
  BUSINESS_DASHBOARD: true,
  BUSINESS_BOOKING: false,   // Needs backend: Stripe Connect verified
  BUSINESS_SCANNER: true,

  // ─── Account / Settings ──────────────────────────
  UPGRADE_TO_PRO: false,    // Needs backend: Stripe webhook for account upgrade
  IDENTITY_VERIFICATION: false,
  PLATFORM_SUBSCRIPTION: true,

  // ─── Vibe Ecosystem ────────────────────────────
  VIBE_GUARDIAN: true,            // Anti-doom-scroll breathing overlay
  EMOTIONAL_RIPPLE: true,         // Positive interaction ripple on profile
  VIBE_PRESCRIPTIONS: true,       // Context-aware wellness missions
  VIBE_SCORE: true,               // Passive vibe score + levels + badges
} as const;

export type FeatureKey = keyof typeof PROD_FEATURES;

/** In dev/staging all features are enabled; in prod use the flags above */
export const FEATURES: Record<FeatureKey, boolean> = __DEV__
  ? (Object.fromEntries(Object.keys(PROD_FEATURES).map(k => [k, true])) as Record<FeatureKey, boolean>)
  : { ...PROD_FEATURES };

/** Check if a feature is enabled */
export const isFeatureEnabled = (key: FeatureKey): boolean => FEATURES[key];
