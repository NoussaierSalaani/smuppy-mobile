/**
 * Shared Constants — centralized magic numbers for Lambda handlers.
 * CLAUDE.md: "No magic numbers: extract to named constants with clear meaning"
 */

// ── Rate Limit Windows (seconds) ──────────────────────────────────────
export const RATE_WINDOW_30S = 30;
export const RATE_WINDOW_1_MIN = 60;
export const RATE_WINDOW_5_MIN = 300;
export const RATE_WINDOW_1_HOUR = 3600;
export const RATE_WINDOW_1_DAY = 86400;

// ── Pagination ────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// ── Presigned URL Expiry (seconds) ────────────────────────────────────
export const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

// ── File Size Limits (bytes) ──────────────────────────────────────────
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;   // 10 MB
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;   // 100 MB
export const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;    // 20 MB
export const MAX_VOICE_SIZE_BYTES = 5 * 1024 * 1024;     // 5 MB

// ── Text Length Limits ────────────────────────────────────────────────
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_POST_CONTENT_LENGTH = 5000;
export const MAX_MEDIA_URL_LENGTH = 2048;
export const MAX_REPORT_REASON_LENGTH = 100;
export const MAX_REPORT_DETAILS_LENGTH = 1000;
export const MAX_SEARCH_QUERY_LENGTH = 100;

// ── Duration Limits ───────────────────────────────────────────────────
export const MAX_VOICE_MESSAGE_SECONDS = 300;   // 5 minutes
export const MAX_PEAK_DURATION_SECONDS = 60;    // 1 minute
export const MIN_SESSION_DURATION_MINUTES = 15;
export const MAX_SESSION_DURATION_MINUTES = 480; // 8 hours

// ── Payment Amounts (cents) ───────────────────────────────────────────
export const MIN_PAYMENT_CENTS = 100;           // $1.00
export const MAX_PAYMENT_CENTS = 5_000_000;     // $50,000
export const MAX_TIP_AMOUNT_CENTS = 50_000;     // $500
export const VERIFICATION_FEE_CENTS = 1490;     // $14.90

// ── Platform Fees (percent) ───────────────────────────────────────────
export const PLATFORM_FEE_PERCENT = 20;
export const APPLE_FEE_PERCENT = 30;
export const GOOGLE_FEE_PERCENT = 30;

// ── Cache TTL (seconds) ──────────────────────────────────────────────
export const CACHE_TTL_SHORT = 15;              // feeds
export const CACHE_TTL_MEDIUM = 30;             // search results
export const CACHE_TTL_LONG = 60;               // post lists
export const CACHE_TTL_TRENDING = 300;          // trending hashtags
export const HSTS_MAX_AGE = 31_536_000;         // 1 year
export const HSTS_MAX_AGE_PRELOAD = 63_072_000; // 2 years

// ── Webhook / Event Handling ──────────────────────────────────────────
export const MAX_WEBHOOK_EVENT_AGE_SECONDS = 300; // 5 minutes

// ── Geographic ────────────────────────────────────────────────────────
export const EARTH_RADIUS_METERS = 6_371_000;
export const MAX_SEARCH_RADIUS_METERS = 50_000;  // 50 km
export const DEFAULT_SEARCH_RADIUS_METERS = 5000; // 5 km

// ── Notification Batching ─────────────────────────────────────────────
export const NOTIFICATION_BATCH_SIZE = 500;
export const NOTIFICATION_BATCH_DELAY_MS = 100;

// ── Battle Limits ─────────────────────────────────────────────────────
export const DEFAULT_BATTLE_DURATION_MINUTES = 10;
export const MIN_BATTLE_DURATION_MINUTES = 1;
export const MAX_BATTLE_DURATION_MINUTES = 120;

// ── Event Limits ──────────────────────────────────────────────────────
export const MIN_EVENT_PARTICIPANTS = 2;
export const MAX_EVENT_PARTICIPANTS = 10_000;
export const MAX_EVENT_TITLE_LENGTH = 200;

// ── Session Price ─────────────────────────────────────────────────────
export const MAX_SESSION_PRICE_CENTS = 10_000;  // $100
