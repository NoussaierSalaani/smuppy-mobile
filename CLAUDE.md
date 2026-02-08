# Smuppy — Project Rules & Conventions

> **Companion document**: For the development workflow (5 phases), the feature creation
> blueprint (12 steps), and the checklist, see [CLAUDE-WORKFLOW.md](./CLAUDE-WORKFLOW.md).

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
- **NEVER** force push (`git push --force` or `git push -f`) to `main` without explicit user approval and a backup branch
- If force push is needed, always use `--force-with-lease` and create `backup/main-pre-<action>` first
- **NEVER** rebase `main` branch without explicit user approval
- **NEVER** commit secrets, API keys, tokens, or .env files — verify with `git diff --staged` before every commit
- **NEVER** delete branches that haven't been merged without asking first
- **NEVER** commit directly on `main` — always use a feature branch + squash merge (see Git Discipline)

### Expo & React Native Dependency Management (CRITICAL)
- **NEVER** run `npm update`, `yarn upgrade`, or `npm install <package>@latest` — these bypass Expo version constraints
- **NEVER** run `npm install <package>` without `npx expo install` — npm ignores Expo SDK compatibility
- **ALWAYS** use `npx expo install <package>` for adding or updating ANY dependency
- **ALWAYS** run `npx expo-doctor` after any dependency change to verify compatibility
- **ALWAYS** run `npx expo install --fix` if expo-doctor reports version mismatches
- Expo SDK versions are tightly coupled to specific React Native versions — mixing versions causes native/JS mismatches
- Current project: **Expo SDK 54** requires **React Native 0.81.x** — do not upgrade RN without upgrading Expo SDK first
- Before ANY Expo SDK upgrade: create a dedicated PR, test ALL features (camera, auth, payments, notifications, maps)

### Confirmation Protocol
- Any command that modifies AWS infrastructure (cdk deploy, aws cli write operations): **state what will change BEFORE running**
- Any command that modifies the database schema: **show the SQL and ask for confirmation**
- Any command that affects more than 5 files: **list the files and ask for confirmation**
- If unsure whether an action is destructive: **ask the user first, don't guess**

## Work Scope Definition

A "lot" of work is **one feature or one fix, with all its layers together**. This means:

- **All layers in one pass**: if a feature touches migration + Lambda + CDK + frontend + types + navigation, change them all before committing — never leave half-done work.
- **One purpose per lot**: don't bundle unrelated changes. A bug fix is one lot; a new feature is another.
- **No opportunistic refactors**: if you spot unrelated cleanup while working, note it for a separate lot — don't mix it in.

This reconciles "small lots" (AGENTS.md) with "all changes at once" (workflow Phase 2): each lot is small in *scope* (one purpose) but complete in *depth* (every layer touched).

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
- **Automated tests**: when test infrastructure exists (Jest, Detox), run existing tests before committing. When adding complex logic (parsers, validators, state machines), add unit tests. The absence of a full test suite does not excuse skipping verification — always run `npx tsc --noEmit` and mental testing at minimum.

## Git Discipline

### Branch Naming
- `feat/short-description` — new feature
- `fix/short-description` — bug fix
- `refactor/short-description` — code restructure
- `chore/short-description` — deps, config, CI
- `security/short-description` — security fixes
- `perf/short-description` — performance improvements

### Commit Message Format
```
type(scope): short description (imperative mood, max 72 chars)

Optional body: explain WHY, not WHAT (the diff shows WHAT).
```

### What Never Goes Into Git
- `.env`, `.env.local`, `.env.production` — secrets
- `node_modules/` — dependencies (use package-lock.json)
- `build/`, `dist/`, `.expo/` — build artifacts
- `console.log` debug statements — remove before commit
- Commented-out code — delete it, git has history
- `*.swp`, `.DS_Store` — editor/OS files

## Bug Prevention Rules (MANDATORY)

### Dependency Safety
- **NEVER** use `^` for AWS SDK or Stripe versions in Lambda `package.json` — use exact versions (e.g., `"3.975.0"` not `"^3.975.0"`)
- After ANY `npm install` or dependency update in Lambda: test critical endpoints (upload, auth, payments) with `aws lambda invoke` before considering it done
- After ANY `npm install` in the mobile app: run `npx expo-doctor` to verify SDK compatibility, then test on simulator before pushing to TestFlight
- When upgrading AWS SDK: check the changelog for breaking changes, especially around S3 checksums, presigned URLs, and auth flows
- Always commit `package-lock.json` — it locks transitive dependencies

### Screen & Navigation Wiring
- When creating a NEW screen, you MUST update ALL 3 files in a single commit:
  1. `src/screens/<category>/index.ts` — add the export
  2. `src/types/index.ts` — add the route to `MainStackParamList`
  3. `src/navigation/MainNavigator.tsx` — add the import AND the `<Stack.Screen>` route
- **NEVER** create a screen file without wiring it into navigation — an unwired screen is a bug
- After adding a screen: verify with `npx tsc --noEmit` AND visually confirm the screen is reachable

### Deployment Verification
- After EVERY `cdk deploy`: test the modified Lambda(s) with `aws lambda invoke` to confirm the fix is live
- After EVERY frontend change intended for TestFlight: run `eas update --branch production` (or `eas build` + `eas submit` if native changes)
- **NEVER** tell the user "it's fixed" without verifying the deployment is live
- For presigned URL changes: always check that the generated URL does NOT contain unexpected headers (checksums, metadata)

### S3 & Presigned URLs
- Always create S3Client with `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'`
- Always use `unhoistableHeaders: new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm'])` in `getSignedUrl()` options
- Mobile clients (React Native) do NOT compute CRC32 checksums — presigned URLs must not require them

### Immediate Bug Fix Policy
- If you introduce or discover a bug during development, fix it IMMEDIATELY — do not leave it for later
- If a bug is in backend code: fix + `cdk deploy` + verify with `aws lambda invoke`
- If a bug is in frontend code: fix + `npx tsc --noEmit` + test on simulator
- If a bug affects TestFlight users: fix + `eas update --branch production`
- **NEVER** leave broken code in the codebase — every commit must leave the app in a working state

### Feature Completion Policy (CRITICAL — NO HALF-DONE WORK)
A feature is **NOT done** until every layer is implemented, deployed, and verified. Never stop halfway.

**Migrations:**
- If you create a SQL migration file, **deploy it to the database immediately** via `run-ddl` action
- Verify the migration with a `run-sql` query (check columns/tables exist)
- A migration file sitting in `aws-migration/scripts/` without being deployed is a bug

**Backend (Lambda):**
- If you modify a Lambda handler, **`cdk deploy` immediately** after committing
- After deploy, **verify with `aws lambda invoke`** that the endpoint works
- Never tell the user "it's done" if the Lambda hasn't been deployed

**Frontend (Visual):**
- If a feature requires visual rendering (filters, overlays, animations), **implement the actual visual effect**
- Never substitute a badge/indicator/placeholder for actual rendering — that is an incomplete feature
- If Skia shaders can't be applied to `<Video>` in real-time, use the next best approach (color overlays, gradient tints) — do not skip rendering entirely

**End-to-End Rule:**
- A feature is complete ONLY when: code committed -> migrations deployed -> Lambda deployed -> frontend renders correctly -> `npx tsc --noEmit` passes -> `git push origin main`
- If any step is missing, the feature is **not done** — go back and complete it before moving on
- **NEVER** say "it's done" or "everything works" when there are undeployed migrations, undeployed Lambdas, or placeholder UI

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
- [ ] Lint passes (`npx eslint` on changed files) — no ESLint errors
- [ ] New screens wired in all 3 files (index.ts, types/index.ts, MainNavigator.tsx)
- [ ] Lambda changes deployed and verified with `aws lambda invoke`
- [ ] No `^` on AWS SDK or Stripe versions in Lambda package.json
- [ ] Presigned URLs tested — no unexpected checksum headers

## React Native Performance (Callstack Best Practices)

Reference: `~/.claude/skills/react-native-best-practices/`

### Critical Optimizations
- **Lists**: Use FlashList/FlatList instead of ScrollView for large lists
- **Re-renders**: Use React Compiler or manual memoization (useMemo, useCallback, React.memo)
- **State**: Use atomic state (Zustand) to minimize re-renders
- **Bundle**: Avoid barrel imports, enable tree shaking
- **Animations**: Use Reanimated worklets for 60 FPS animations

### Performance Commands
```bash
# Analyze bundle size
npx react-native bundle --entry-file index.js --bundle-output output.js --platform ios --sourcemap-output output.js.map --dev false --minify true
npx source-map-explorer output.js --no-border-checks

# Profile React components (open DevTools: press 'j' in Metro)
```

### Priority Order
1. FPS & Re-renders (CRITICAL)
2. Bundle Size (CRITICAL)
3. TTI/Startup Time (HIGH)
4. Native Performance (HIGH)
5. Memory Management (MEDIUM)
