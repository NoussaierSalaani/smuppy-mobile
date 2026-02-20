/**
 * Shared Business Service Constants
 *
 * Validation constants and row-mapping helpers shared by
 * services-create.ts and services-update.ts.
 */

// ── Validation Constants ────────────────────────────────────────────
export const VALID_SERVICE_CATEGORIES = ['drop_in', 'pack', 'membership'] as const;
export const VALID_SUBSCRIPTION_PERIODS = ['weekly', 'monthly', 'yearly'] as const;
export const MAX_SERVICE_NAME_LENGTH = 200;
export const MAX_SERVICE_DESCRIPTION_LENGTH = 2000;

// ── Types ───────────────────────────────────────────────────────────
export type ServiceCategory = (typeof VALID_SERVICE_CATEGORIES)[number];
export type SubscriptionPeriod = (typeof VALID_SUBSCRIPTION_PERIODS)[number];

/** DB row shape returned by INSERT/UPDATE RETURNING on business_services */
export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  duration_minutes: number | null;
  is_subscription: boolean;
  subscription_period: string | null;
  trial_days: number;
  max_capacity: number | null;
  entries_total: number | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

/** camelCase API representation of a business service */
export interface ServiceResponse {
  id: string;
  name: string;
  description: string | null;
  category: string;
  priceCents: number;
  durationMinutes: number | null;
  isSubscription: boolean;
  subscriptionPeriod: string | null;
  trialDays: number;
  maxCapacity: number | null;
  entriesTotal: number | null;
  isActive: boolean;
  createdAt: string;
}

// ── Row Mapper ──────────────────────────────────────────────────────

/** Map a DB row (snake_case) to a camelCase API response object. */
export function mapServiceRow(row: ServiceRow): ServiceResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    priceCents: row.price_cents,
    durationMinutes: row.duration_minutes,
    isSubscription: row.is_subscription,
    subscriptionPeriod: row.subscription_period,
    trialDays: row.trial_days,
    maxCapacity: row.max_capacity,
    entriesTotal: row.entries_total,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
