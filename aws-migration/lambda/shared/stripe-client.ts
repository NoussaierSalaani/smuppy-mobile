/**
 * Centralized Stripe Client
 * Lazy-initialized singleton — secret fetched from Secrets Manager on first call
 */

import Stripe from 'stripe';
import { getStripeKey } from './secrets';

let stripeInstance: Stripe | null = null;

export async function getStripeClient(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripeInstance;
}
