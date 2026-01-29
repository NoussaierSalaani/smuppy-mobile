# Smuppy — Project Rules & Conventions

## Architecture

- React Native (Expo) mobile app with AWS Lambda backend
- Auth: AWS Cognito (email + Apple + Google sign-in)
- DB: PostgreSQL via `getPool()` connection pooling
- Payments: Stripe (Connect, Subscriptions, PaymentIntents)
- Navigation: React Navigation (Stack + Tab navigators)
- State: Zustand stores + React Context for cross-navigator callbacks

## Security Rules (MANDATORY)

### Input & Output
- ALL user input is hostile: validate, sanitize, truncate
- Strip HTML tags from all text input (`content.replace(/<[^>]*>/g, '')`)
- Strip control characters from text input
- Never return `error.message`, `error.code`, or stack traces to client — log them server-side, return generic messages
- Cognito `ListUsersCommand` filter: always strip `"` and `\` from email before interpolation

### Auth & Authorization
- Every mutation handler MUST verify `event.requestContext.authorizer?.claims?.sub`
- Never trust client-provided IDs (senderId, userId) without checking against JWT session
- Verify resource ownership before any update/delete (check `author_id === profileId`)
- Account type upgrades (pro_creator, pro_business) can ONLY happen via Stripe webhook — never via direct API call

### Database
- Use parameterized queries ONLY (`$1`, `$2`, ...) — never string interpolation in SQL
- When building dynamic SQL with optional parameters, compute exact `$N` indices — never use `.filter(Boolean)` on parameter arrays
- Transactions: always use `const client = await db.connect()` with `try/BEGIN/COMMIT/catch/ROLLBACK/finally/client.release()`
- Privacy check + data fetch must happen in the same transaction (no race window)

### Rate Limiting
- Rate limit ALL endpoints that create resources or cost money
- WAF handles broad rate limiting; per-endpoint limits via in-memory Map or Redis
- Follow/unfollow: enforce cooldown between cycles to prevent notification spam

### Stripe & Payments
- Webhook handlers MUST check event age (reject > 5 min) and deduplicate by event ID
- Never expose Stripe error details to client
- Stripe secret keys MUST be in environment variables, never in committed files
- `.env` files are in `.gitignore` — use `.env.example` with placeholders

### Logging
- Never log full email, username, or PII — mask to first 2 chars + `***`
- Log security events (invalid tokens, injection attempts, rate limit hits)
- Use `createLogger()` with request ID for traceability

### Mobile (React Native)
- Biometrics: `disableDeviceFallback: true` (no PIN fallback)
- Deep links: validate origin domain before processing
- Navigation callbacks: use React Context, never pass functions as navigation params (causes non-serializable warning)
- Secure storage for sensitive data (tokens, session keys)

## Code Style

### Backend (Lambda)
- TypeScript strict mode
- Every handler returns `APIGatewayProxyResult`
- Use `createHeaders(event)` for CORS
- UUID validation: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- camelCase in API, snake_case in DB — use explicit field mapping

### Frontend (React Native)
- Functional components with hooks
- `useCallback` for event handlers, `useMemo` for computed values
- `usePreventDoubleNavigation` for navigation actions
- Theme constants from `config/theme.ts`
- Component naming: `PascalCase` files, default exports

## Onboarding Flows

### Personal: AccountType -> TellUsAboutYou(1/3) -> Interests(2/3) -> Guidelines(3/3) -> Success
### Creator: AccountType -> CreatorInfo(1/4) -> CreatorOptionalInfo(2/4) -> Expertise(3/4) -> Guidelines(4/4) -> Success
### Business: AccountType -> BusinessCategory(1/3) -> BusinessInfo(2/3) -> Guidelines(3/3) -> Success

## Pre-Merge Checklist

For every endpoint, verify:
- [ ] Auth check (401 without token)
- [ ] Ownership check (403 for other user's resource)
- [ ] Input validation + sanitization
- [ ] Output sanitization (no internal errors leaked)
- [ ] Rate limiting (if resource-creating or costly)
- [ ] SQL uses parameterized queries with correct $N indices
- [ ] No PII in logs
- [ ] Stripe handlers are idempotent
