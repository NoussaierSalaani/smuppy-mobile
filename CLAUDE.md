# Smuppy — Project Rules & Conventions

## ABSOLUTE RULES — NEVER VIOLATE

### Destruction Protection (CRITICAL — READ FIRST)
- **NEVER** run `cdk destroy`, `aws cloudformation delete-stack`, or any command that deletes infrastructure
- **NEVER** run `rm -rf`, `rm -r`, or bulk delete on any project files or directories
- **NEVER** drop tables, drop databases, or run destructive SQL (DROP, TRUNCATE, DELETE without WHERE)
- **NEVER** delete S3 buckets, Cognito user pools, RDS clusters, DynamoDB tables, or any AWS resource
- **NEVER** run `git clean -f`, `git checkout .`, `git reset --hard` unless the user explicitly requests it with full awareness
- **NEVER** delete environment files (.env), secrets, credentials, or configuration files
- Before ANY delete/remove operation: explain what will be deleted, ask for explicit confirmation, and suggest a backup first
- If a file or resource must be removed, **rename it** (e.g., `_old_filename`) or **move it to a backup directory** instead of deleting
- AWS stacks: always use `--retain-resources` or `DeletionPolicy: Retain` on stateful resources (DB, S3, Cognito)
- This rule applies to ALL Claude sessions — current and future. No exceptions.

### AWS Infrastructure Protection
- **NEVER** modify IAM policies to add `*` wildcard permissions — always use least-privilege
- **NEVER** make S3 buckets public or change bucket policies to allow public access
- **NEVER** open security groups to `0.0.0.0/0` on database ports (5432, 3306, 6379)
- **NEVER** disable encryption on any resource (RDS, S3, DynamoDB, Secrets Manager)
- **NEVER** remove VPC, subnets, or NAT gateways from existing stacks
- **NEVER** change `DeletionPolicy` from `Retain`/`Snapshot` to `Delete` on stateful resources
- **NEVER** rotate or delete Secrets Manager secrets without explicit user confirmation
- **NEVER** modify Cognito user pool settings that could lock out existing users (password policy, MFA changes)
- All CDK stacks MUST have `DeletionPolicy: Retain` on: RDS clusters, S3 buckets, Cognito user pools, DynamoDB tables
- All CDK stacks MUST have `removalPolicy: cdk.RemovalPolicy.RETAIN` on stateful resources

### Data Protection
- **NEVER** run UPDATE or DELETE SQL without a WHERE clause
- **NEVER** run migrations that drop columns containing user data — always rename to `_deprecated_<name>` first
- **NEVER** truncate or clear tables in staging or production — only in local dev
- **NEVER** export, print, or log full database dumps or user data
- Before any migration that alters data: backup the table first with `CREATE TABLE <name>_backup_<date> AS SELECT * FROM <name>`
- All migrations MUST be idempotent (IF NOT EXISTS, IF EXISTS, ON CONFLICT DO NOTHING)
- All migrations MUST be reversible — include a rollback comment block at the bottom

### Git & Code Protection
- **NEVER** force push (`git push --force` or `git push -f`) to `main` or `master`
- **NEVER** rebase `main` branch
- **NEVER** commit secrets, API keys, tokens, or .env files — verify with `git diff --staged` before every commit
- **NEVER** delete branches that haven't been merged without asking first
- Always create a new branch for risky changes — never experiment directly on `main`

### Confirmation Protocol
- Any command that modifies AWS infrastructure (cdk deploy, aws cli write operations): **state what will change BEFORE running**
- Any command that modifies the database schema: **show the SQL and ask for confirmation**
- Any command that affects more than 5 files: **list the files and ask for confirmation**
- If unsure whether an action is destructive: **ask the user first, don't guess**

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

## Error Handling

- Lambda: every handler has a top-level try/catch returning 500 with generic message
- Frontend: every async function in useEffect has `.catch()` — no unhandled rejections
- Network calls: always handle timeout, 401 (retry with refresh), 429 (show rate limit message), 5xx (show generic error)
- Never swallow errors silently — at minimum `console.error` server-side or report to Sentry client-side
- Transactions: always ROLLBACK in catch, always `client.release()` in finally

## Naming Conventions

- Files: `kebab-case` for Lambda handlers (`create-intent.ts`), `PascalCase` for React components (`LoginScreen.tsx`)
- Variables: `camelCase` in TS/JS, `snake_case` in SQL
- API responses: `camelCase` keys — map from DB `snake_case` explicitly, never use `SELECT *` in production queries (name every column)
- Constants: `UPPER_SNAKE_CASE` (`MAX_FILE_SIZE`, `RATE_LIMIT_WINDOW`)
- Types/Interfaces: `PascalCase`, prefix with `I` only for interfaces that are implemented by classes

## Performance Rules

- Never `SELECT *` — always list exact columns needed
- Always use `LIMIT` on list queries (max 50 per page)
- Use `EXISTS` instead of `COUNT(*)` when checking presence
- Index every column used in `WHERE`, `JOIN ON`, or `ORDER BY`
- Use `getReaderPool()` for read-only queries, `getPool()` for writes
- Frontend: `React.memo()` for list item components, `useCallback` for callbacks passed as props
- Images: always specify dimensions to avoid layout shift
- Avoid re-renders: never create objects/arrays inline in JSX props (`style={{}}` inside render)

## Code Quality Rules

- No dead code: delete unused imports, functions, variables, files — never comment them out
- No `any` type: use proper types. If truly unknown, use `unknown` and narrow with type guards
- No magic numbers: extract to named constants with clear meaning
- No copy-paste: if the same logic appears 3+ times, extract to a shared utility
- No nested ternaries: use early returns or if/else for readability
- Max function length: ~50 lines. If longer, extract sub-functions with clear names
- One responsibility per file: a Lambda handler file does one thing (create, list, update, delete)
- Imports order: 1) node/aws modules, 2) shared/utils, 3) relative imports — separated by blank line

## API Design Rules

- RESTful: `POST /resource` (create), `GET /resource` (list), `GET /resource/:id` (get), `PUT /resource/:id` (update), `DELETE /resource/:id` (delete)
- Always return `{ success: boolean }` in response body
- Pagination: cursor-based with `?cursor=<id>&limit=<n>`, return `{ data: [], nextCursor: string | null }`
- Validation: validate all path params (UUID format), query params (type + range), and body fields (required + type + length) before any DB call
- HTTP status codes: 200 (ok), 201 (created), 400 (bad input), 401 (no auth), 403 (forbidden), 404 (not found), 409 (conflict), 429 (rate limit), 500 (server error)
- Never return database IDs or internal structure in error messages

## Testing Mindset

- Before writing code, identify edge cases: empty input, null, max length, duplicate, concurrent, unauthorized
- After writing code, mentally test: what if the user sends this twice fast? What if the DB is slow? What if the token expires mid-request?
- Validate every code path: happy path, auth failure, validation failure, DB error, external service timeout

## Git Discipline

- Atomic commits: one logical change per commit
- Commit message format: `type(scope): description` — types: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `security`
- Never commit: `.env`, secrets, `node_modules`, build artifacts, `console.log` debug statements
- Branch naming: `feat/feature-name`, `fix/bug-name`, `security/audit-batch-N`

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
- [ ] No `SELECT *` — all columns named explicitly
- [ ] No `any` types — proper TypeScript types used
- [ ] No dead code or commented-out code
- [ ] Error paths tested mentally (null, empty, duplicate, concurrent)
- [ ] `npx tsc --noEmit` passes with zero errors
