-- Migration 011: Refunds & Disputes
-- Adds refund tracking and dispute/chargeback handling

-- ============================================
-- ADD DISPUTE STATUS TO PAYMENTS
-- ============================================
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS dispute_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS amount_cents INTEGER; -- Alias for consistency

-- Update amount_cents from existing data if needed
UPDATE payments SET amount_cents = gross_amount WHERE amount_cents IS NULL AND gross_amount IS NOT NULL;

-- ============================================
-- REFUNDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  stripe_refund_id VARCHAR(255) UNIQUE,
  amount_cents INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL, -- duplicate, fraudulent, requested_by_customer, session_cancelled, technical_issue, creator_unavailable, other
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, succeeded, failed
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe ON refunds(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_requested_by ON refunds(requested_by) WHERE requested_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at DESC);

-- ============================================
-- DISPUTES TABLE (Chargebacks)
-- ============================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_charge_id VARCHAR(255),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  reason VARCHAR(100), -- duplicate, fraudulent, subscription_canceled, product_unacceptable, product_not_received, unrecognized, credit_not_processed, general
  status VARCHAR(50) NOT NULL, -- warning_needs_response, warning_under_review, warning_closed, needs_response, under_review, charge_refunded, won, lost
  evidence_due_by TIMESTAMPTZ,
  evidence_submitted BOOLEAN DEFAULT false,
  outcome VARCHAR(50), -- won, lost, pending
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_stripe ON disputes(stripe_dispute_id);
CREATE INDEX IF NOT EXISTS idx_disputes_charge ON disputes(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON disputes(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at trigger for refunds
DROP TRIGGER IF EXISTS refunds_updated_at ON refunds;
CREATE TRIGGER refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Updated_at trigger for disputes
DROP TRIGGER IF EXISTS disputes_updated_at ON disputes;
CREATE TRIGGER disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- Refund summary view
CREATE OR REPLACE VIEW refund_summary AS
SELECT
  DATE_TRUNC('month', r.created_at) as month,
  COUNT(*) as total_refunds,
  COUNT(*) FILTER (WHERE r.status = 'succeeded') as successful_refunds,
  COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status = 'succeeded'), 0) as total_refunded_cents,
  r.reason,
  COUNT(*) as count_by_reason
FROM refunds r
GROUP BY DATE_TRUNC('month', r.created_at), r.reason
ORDER BY month DESC, count_by_reason DESC;

-- Dispute summary view
CREATE OR REPLACE VIEW dispute_summary AS
SELECT
  DATE_TRUNC('month', d.created_at) as month,
  COUNT(*) as total_disputes,
  COUNT(*) FILTER (WHERE d.status = 'won') as disputes_won,
  COUNT(*) FILTER (WHERE d.status = 'lost') as disputes_lost,
  COUNT(*) FILTER (WHERE d.status IN ('needs_response', 'under_review', 'warning_needs_response', 'warning_under_review')) as disputes_pending,
  COALESCE(SUM(d.amount_cents), 0) as total_disputed_cents,
  COALESCE(SUM(d.amount_cents) FILTER (WHERE d.status = 'lost'), 0) as total_lost_cents
FROM disputes d
GROUP BY DATE_TRUNC('month', d.created_at)
ORDER BY month DESC;

-- ============================================
-- GRANTS
-- ============================================
GRANT SELECT, INSERT, UPDATE ON refunds TO smuppy_app;
GRANT SELECT, INSERT, UPDATE ON disputes TO smuppy_app;
GRANT SELECT ON refund_summary TO smuppy_app;
GRANT SELECT ON dispute_summary TO smuppy_app;
