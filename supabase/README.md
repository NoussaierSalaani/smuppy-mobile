# Supabase Configuration for Smuppy

## Edge Functions

### validate-email
Validates email addresses with:
- Format validation (regex)
- Disposable email blocking (100+ domains)
- MX record verification (domain exists)

### auth-signup
Creates user account and sends OTP via Resend API:
- Rate limited (3 req/min per email)
- Uses `generateLink` to get OTP from Supabase
- Sends branded HTML email via Resend
- Bypasses Supabase SMTP (uses custom domain smuppy.com)

### auth-login
Handles user login with rate limiting:
- Server-side rate limit enforcement
- Returns session tokens on success

### auth-resend
Resends verification OTP:
- Rate limited (3 req/5min per email)
- Anti-enumeration (always returns 200 except rate limit)

### delete-account (GDPR Compliant)
Soft deletes user account with 30-day grace period:
- Stores account in `deleted_accounts` table
- Deletes user profile and auth record
- Email blocked for 30 days (reactivation possible via support)
- After 30 days: email freed for new signups

### check-deleted-account
Checks if email belongs to a deleted account:
- Returns deletion status, days remaining, reactivation possibility
- Used by LoginScreen to show informative popup

### cleanup-deleted-accounts
Scheduled cleanup for expired deleted accounts:
- Removes entries older than 30 days from `deleted_accounts`
- Frees email addresses for reuse
- Should be called via cron job (daily recommended)

## Deployment Instructions

### Prerequisites
1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Deploy Edge Function
```bash
# From project root
supabase functions deploy validate-email
```

### Test Edge Function
```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/validate-email' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email": "test@gmail.com"}'
```

## Rate Limiting Configuration

Configure in Supabase Dashboard → Authentication → Rate Limits:

| Action | Recommended Limit |
|--------|------------------|
| Sign up | 10/hour per IP |
| Sign in | 30/hour per IP |
| Token refresh | 30/hour |
| Verify (OTP) | 10/hour |
| Password recovery | 5/hour |

## Dashboard Settings

### Authentication → Settings
- [x] Enable email confirmations
- [x] Secure email change (requires confirmation)
- [x] Minimum password length: 8

### Authentication → Email Templates
Customize the verification email template with Smuppy branding.

## Database Tables

### deleted_accounts (GDPR Compliance)
Tracks soft-deleted accounts for 30-day grace period:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Original user ID |
| email | TEXT | User email (unique) |
| full_name | TEXT | User's name |
| deleted_at | TIMESTAMPTZ | Deletion timestamp |
| hard_delete_at | TIMESTAMPTZ | Auto-cleanup date (30 days after deletion) |
| reason | TEXT | Deletion reason (default: 'user_requested') |
| metadata | JSONB | Additional data (username, avatar, provider) |

**RLS:** Service role only (security)

### SQL to create table:
```sql
CREATE TABLE IF NOT EXISTS deleted_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hard_delete_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  reason TEXT DEFAULT 'user_requested',
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT deleted_accounts_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_deleted_accounts_hard_delete_at ON deleted_accounts(hard_delete_at);
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_email ON deleted_accounts(email);
ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON deleted_accounts FOR ALL USING (auth.role() = 'service_role');
```

## Environment Variables

The app expects these in `.env`:
```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

## Fallback Behavior

If the Edge Function is not deployed:
- App falls back to client-side validation
- Format + disposable email checks still work
- MX record check uses Cloudflare DNS-over-HTTPS directly

This ensures the app works even without the Edge Function deployed.
