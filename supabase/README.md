# Supabase Configuration for Smuppy

## Edge Functions

### validate-email
Validates email addresses with:
- Format validation (regex)
- Disposable email blocking (100+ domains)
- MX record verification (domain exists)

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
