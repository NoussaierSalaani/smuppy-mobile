# Smuppy — Development Workflow & Feature Blueprint

> **Companion document**: For project rules, conventions, security, and code style,
> see [CLAUDE.md](./CLAUDE.md). This file covers *how* to work; CLAUDE.md covers *what* the rules are.

## Work Scope Principle

A "lot" of work is **one feature or one fix, with all its layers together**.

- **All layers in one pass**: migration + Lambda + CDK + frontend + types + navigation — change them all before committing.
- **One purpose per lot**: don't bundle unrelated changes.
- **No opportunistic refactors**: note them for a separate lot.

Each lot is small in *scope* (one purpose) but complete in *depth* (every layer touched).

## Development Workflow (MANDATORY — READ CAREFULLY)

This is the exact process Claude MUST follow for EVERY task. No shortcuts.

### Phase 1 : Understand (DO NOT write any code yet)

1. **Read the user's request completely** — do not start coding after reading half the message
2. **Identify ALL files that will be affected** — use Glob/Grep to find every file involved
3. **Read every affected file** — understand the existing code, imports, types, styles
4. **Identify dependencies** — if screen A calls service B which calls Lambda C, read all three
5. **List edge cases** — empty input, null, duplicate, concurrent, unauthorized, network error
6. **Present a plan to the user** — "Here's what I'll change: [file list]. Here's my approach: [summary]. OK?"

**STOP HERE. Wait for user confirmation before writing any code.**

### Phase 2 : Code (all changes at once, not piece by piece)

1. **Create a feature branch FIRST** — never code on `main`
   ```bash
   git checkout -b feat/short-description   # or fix/ or chore/
   ```
2. **Make ALL changes in one pass** — frontend + backend + types + navigation + styles
   - If adding a screen: update the screen file + `index.ts` + `types/index.ts` + `MainNavigator.tsx` simultaneously
   - If adding a Lambda: update the handler + `lambda-stack.ts` + `api-gateway-stack.ts` simultaneously
   - If modifying a service: update the service + all screens/hooks that call it
3. **Never leave half-done work** — if a feature needs 5 files changed, change all 5 before moving on
4. **Write the complete implementation** — not a skeleton to "fill in later"

### Phase 3 : Verify (BEFORE any commit)

Run ALL of these checks. If any fails, fix it BEFORE committing:

1. **TypeScript** — `npx tsc --noEmit` must show **zero errors**
2. **Lint** — `npx eslint` on changed files — no ESLint errors
3. **Expo compatibility** — `npx expo-doctor` if any dependency was added or changed
4. **Automated tests** — run existing test suites (`npx jest`, etc.) if available
5. **Review the diff** — `git diff` and read every changed line yourself
6. **Mental testing** — walk through these scenarios mentally:
   - Happy path: does the feature work as expected?
   - Double-tap: what if the user taps twice fast?
   - Empty state: what if data is empty/null/undefined?
   - Error state: what if the API returns 500?
   - Auth state: what if the token expires mid-request?
   - Navigation: can the user get to this screen? Can they go back?
7. **Import check** — no unused imports, no missing imports
8. **Type check** — no `any` types, all function params typed

**If `npx tsc --noEmit` fails, DO NOT commit. Fix ALL errors first.**

### Phase 4 : Commit (one clean commit per feature)

```bash
# Stage only the files for this feature
git add src/screens/xxx.tsx src/types/index.ts ...

# Commit with conventional message
git commit -m "feat(scope): clear description of what this does"

# Verify the commit is clean
npx tsc --noEmit
```

**Rules:**
- One commit = one complete, working feature or fix
- Never: `fix: typo` -> `fix: forgot import` -> `fix: actually fix the thing` -> `fix: fix the fix`
- If you realize you missed something after committing: `git reset --soft HEAD~1`, fix everything, re-commit
- Commit message format: `type(scope): description`
  - Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `security`
  - Scope: the area affected (`auth`, `chat`, `profile`, `payments`, `lambda`, `ci`)

### Phase 5 : Merge to main (squash merge)

```bash
git checkout main
git merge --squash feat/short-description
git commit -m "feat(scope): complete description"
git branch -d feat/short-description        # delete the feature branch
git push origin main
```

This gives `main` exactly ONE clean commit per feature, no matter how many intermediate commits were on the branch.

## Anti-Patterns — NEVER DO THESE

| Anti-Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| Commit on `main` directly | Pollutes history, can't revert cleanly | Feature branch + squash merge |
| Commit after every small change | Creates "fix the fix" chains | One commit when everything works |
| Push before `tsc --noEmit` | Broken code on remote | Always verify before push |
| Fix half a feature, commit, fix the rest | Broken intermediate state | Complete the entire feature first |
| Copy-paste code to "fix it fast" | Creates tech debt | Understand the root cause, fix properly |
| Skip reading existing code | Breaks existing behavior | Read every file you'll modify |
| Ignore edge cases | Bugs in production | Test empty/null/error/concurrent paths |

## Parallel Development (Multiple Tasks at Once)

When multiple independent tasks need to run in parallel:

**Method: Git Worktrees (one terminal per task)**

```bash
# From the main repo, create worktrees for each task
git worktree add ~/smuppy-task-1 -b fix/bug-name
git worktree add ~/smuppy-task-2 -b feat/feature-name

# Terminal 1: work on task 1
cd ~/smuppy-task-1
# ... make changes, test, commit ...

# Terminal 2: work on task 2
cd ~/smuppy-task-2
# ... make changes, test, commit ...

# When both are done, merge back to main
cd ~/smuppy-mobile
git merge --squash fix/bug-name && git commit -m "fix(scope): description"
git merge --squash feat/feature-name && git commit -m "feat(scope): description"

# Clean up
git worktree remove ~/smuppy-task-1
git worktree remove ~/smuppy-task-2
git branch -d fix/bug-name feat/feature-name
```

**Rules for parallel work:**
- Each task gets its own branch and its own worktree directory
- Tasks that touch the SAME files cannot run in parallel — do them sequentially
- Each task follows the full workflow (understand -> code -> verify -> commit)
- Merge conflicts: resolve manually on `main`, never force
- After all merges: run `npx tsc --noEmit` on main to verify everything still works together

## What to Do When Something Breaks

If during development you realize something is broken:

1. **STOP** — do not add more code on top of broken code
2. **Understand the root cause** — read error messages, trace the call stack, check types
3. **Fix the root cause** — not the symptom. If the type is wrong, fix the type, don't cast to `any`
4. **Re-run `npx tsc --noEmit`** — confirm zero errors
5. **Re-test mentally** — walk through all scenarios again
6. **Only then continue** with the rest of the feature

**NEVER:** "I'll fix this later" / "It works for now" / "Let me just push this and fix on the next commit"

## Claude Session Handoff Protocol

When starting a NEW Claude session on this project:

1. Read `CLAUDE.md` and `CLAUDE-WORKFLOW.md` completely
2. Run `git log --oneline -20` to understand recent work
3. Run `git status` and `git branch` to understand current state
4. Ask the user what they want to work on
5. Follow the full workflow above (Understand -> Code -> Verify -> Commit -> Merge)

## Onboarding Flows

### Personal: AccountType -> TellUsAboutYou(1/3) -> Interests(2/3) -> Guidelines(3/3) -> Success
### Creator: AccountType -> CreatorInfo(1/4) -> CreatorOptionalInfo(2/4) -> Expertise(3/4) -> Guidelines(4/4) -> Success
### Business: AccountType -> BusinessCategory(1/3) -> BusinessInfo(2/3) -> Guidelines(3/3) -> Success

## Feature Creation Blueprint (MANDATORY — FOLLOW EXACTLY)

This is the **exact step-by-step process** to create ANY new feature in Smuppy. Every step depends on the previous one. Skip nothing.

### Step 1: Database Migration

**Where**: `aws-migration/scripts/migration-XXX-descriptive-name.sql`

**Rules**:
- `IF NOT EXISTS` / `IF EXISTS` everywhere (idempotent)
- `snake_case` for all column and table names
- FK with `ON DELETE CASCADE` for parent-child relationships
- Index every column used in `WHERE`, `JOIN ON`, or `ORDER BY`
- Rollback block commented at bottom
- Never `SELECT *` — name every column

**How to execute** (DB is in VPC, not directly accessible):
```bash
ADMIN_KEY=$(aws secretsmanager get-secret-value \
  --secret-id smuppy-admin-api-key-staging \
  --region us-east-1 \
  --query SecretString --output text)

curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{"action":"run-ddl","sql":"<SQL HERE>"}'
```

**How to verify**:
```bash
curl -X POST "https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging/admin/migrate" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{"action":"run-sql","sql":"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''<table>'\'' ORDER BY ordinal_position"}'
```

**A migration file sitting in `aws-migration/scripts/` without being deployed is a bug.**

---

### Step 2: Lambda Handlers (Backend API)

**Where**: `aws-migration/lambda/api/<feature>/` — one file per operation

**Standard handlers per feature**:

| File | Method | Route | Purpose |
|------|--------|-------|---------|
| `create.ts` | POST | `/<feature>` | Create resource |
| `list.ts` | GET | `/<feature>` | List/feed with pagination |
| `get.ts` | GET | `/<feature>/{id}` | Get single resource |
| `delete.ts` | DELETE | `/<feature>/{id}` | Delete (with ownership check) |
| `like.ts` | POST | `/<feature>/{id}/like` | Like (if applicable) |
| `unlike.ts` | DELETE | `/<feature>/{id}/like` | Unlike |
| `comment.ts` | POST | `/<feature>/{id}/comments` | Comment |

**Every handler MUST follow this structure**:
1. CORS preflight: `if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }`
2. Auth: `const cognitoSub = event.requestContext.authorizer?.claims?.sub` — return 401 if missing on mutations
3. Rate limit: `checkRateLimit({ prefix, identifier: cognitoSub, maxRequests, windowSeconds })`
4. Parse + validate input (UUID regex, sanitize text, check required fields)
5. DB connection: `const client = await db.connect()` + `BEGIN/COMMIT/ROLLBACK/finally release()`
6. **Resolve cognitoSub -> profile ID**: `SELECT id FROM profiles WHERE cognito_sub = $1` — ALWAYS do this, the Cognito sub is NOT the profile UUID
7. Parameterized SQL: `$1, $2...` — NEVER string interpolation
8. Response mapping: `snake_case` DB -> `camelCase` API
9. Top-level try/catch: return 500 with generic message, log the real error server-side

**Shared utilities**:
- `createHeaders(event)` — CORS headers
- `createLogger('handler-name')` — structured logging
- `checkRateLimit(options)` — DynamoDB-backed rate limiter (failOpen default true, set `failOpen: false` for payments)
- `getPool()` — write connection, `getReaderPool()` — read-only connection

---

### Step 3: CDK Infrastructure (Declare + Route)

The Lambda code exists but AWS doesn't know about it yet. You must **declare** it in CDK and **connect** it to API Gateway.

**3a. Declare Lambda functions**

**Where**: `aws-migration/infrastructure/lib/lambda-stack.ts` (or `lambda-stack-2.ts` if near 500 resource limit)

```typescript
public readonly featureCreateFn: lambda.Function;

// In constructor:
this.featureCreateFn = this.createLambda('FeatureCreateFunction', {
  entry: 'feature/create',     // -> lambda/api/feature/create.ts
  memory: 512,                 // 1024 for list/search endpoints
  timeout: 30,
  reservedConcurrency: 50,     // Only for high-traffic endpoints (feeds)
});
```

Each Lambda automatically gets: VPC, env vars (DB_HOST, S3_BUCKET, CLOUDFRONT_URL), DB credentials, DynamoDB rate-limit table, X-Ray tracing.

**3b. Route in API Gateway**

**Where**: `aws-migration/infrastructure/lib/api-gateway-stack.ts`

```typescript
const feature = api.root.addResource('feature');
feature.addMethod('GET', new apigateway.LambdaIntegration(props.lambdaStack.featureListFn));
feature.addMethod('POST', new apigateway.LambdaIntegration(props.lambdaStack.featureCreateFn), {
  authorizer: cognitoAuthorizer,
  requestValidator: bodyValidator,
});

const featureById = feature.addResource('{id}');
featureById.addMethod('GET', new apigateway.LambdaIntegration(props.lambdaStack.featureGetFn));
featureById.addMethod('DELETE', new apigateway.LambdaIntegration(props.lambdaStack.featureDeleteFn), {
  authorizer: cognitoAuthorizer,
});
```

- Routes WITHOUT auth: `GET` list and `GET` by ID (optional auth for `isLiked` field)
- Routes WITH auth: all mutations (`POST`, `PUT`, `DELETE`) use `cognitoAuthorizer`
- Routes WITH body validation: `POST` create/update use `requestValidator: bodyValidator`

**3c. Deploy**:
```bash
cd aws-migration/infrastructure
npx cdk synth          # Verify compilation
npx cdk deploy --all   # Deploy to AWS (us-east-1, NOT eu-west-3)
```

**3d. Verify**:
```bash
aws lambda invoke \
  --function-name $(aws lambda list-functions --region us-east-1 \
    --query "Functions[?contains(FunctionName, 'FeatureCreate')].FunctionName" \
    --output text) \
  --payload '{}' --region us-east-1 /tmp/test.json
cat /tmp/test.json
# Expected: 401 Unauthorized (no token = working correctly)
```

---

### Step 4: Frontend API Service

**Where**: `src/services/aws-api.ts` — add methods to the `AwsAPI` class

```typescript
async getFeatures(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Feature>> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);
  return this.request(`/feature?${query.toString()}`);
}

async createFeature(data: CreateFeatureInput): Promise<{ success: boolean; feature: Feature }> {
  return this.request('/feature', { method: 'POST', body: data });
}
```

`this.request()` automatically handles: Cognito token in `Authorization` header, token refresh on 401, rate limit on 429, generic error on 5xx.

---

### Step 5: Media Upload (if feature has media)

**Where**: `src/services/mediaUpload.ts`

**Flow**: Mobile -> presigned URL -> PUT directly to S3 -> CDN URL -> pass to createFeature()

```typescript
export const uploadFeatureMedia = (
  userId: string,
  mediaUri: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> => {
  return uploadVideo(userId, mediaUri, { folder: 'feature', onProgress });
};
```

**The `folder` parameter determines the S3 path**:

| Folder | S3 Path | uploadType in upload-url.ts |
|--------|---------|---------------------------|
| `'peaks'` | `peaks/{userId}/{file}` | `peak` |
| `'posts'` | `posts/{userId}/{file}` | `post` |
| `'avatars'` | `users/{userId}/avatar/{file}` | `avatar` |
| `'messages'` | `private/{userId}/messages/{file}` | `message` |

If adding a new folder:
1. Add to `UploadOptions.folder` union type in `mediaUpload.ts`
2. Add `case` in `getUploadPath()` in `aws-migration/lambda/api/media/upload-url.ts`
3. Add prefix detection in `getUploadUrl()` in `src/services/aws-api.ts`

---

### Step 6: TypeScript Types

**Where**: `src/types/index.ts`

**6a. Data model interface**:
```typescript
export interface Feature {
  id: string;
  // ... all fields from API response, camelCase
}
```

**6b. Navigation route params** (in `MainStackParamList`):
```typescript
FeatureView: { features?: Feature[]; initialIndex?: number };
CreateFeature: { someParam?: string } | undefined;
```

**Rule**: Navigation params MUST be serializable (string, number, boolean, plain objects). NEVER functions, Dates, or class instances.

---

### Step 7: Screens (React Native UI)

**Where**: `src/screens/<feature>/`

**Standard screens per feature**:

| Screen | Purpose | Key APIs |
|--------|---------|----------|
| `FeatureFeedScreen.tsx` | List/feed with infinite scroll | `awsAPI.getFeatures()` |
| `CreateFeatureScreen.tsx` | Creation UI (camera, form, etc.) | None (prep only) |
| `FeaturePreviewScreen.tsx` | Review + publish | `uploadMedia()` + `awsAPI.createFeature()` |
| `FeatureViewScreen.tsx` | Detail/viewer | `awsAPI.likeFeature()`, etc. |

**Every screen MUST handle**:
- Loading state (spinner or skeleton)
- Error state (error message + retry)
- Empty state (meaningful message + CTA)
- Pull-to-refresh (if list)
- Business account gating (if feature is user-content)

**Frontend rules**:
- `useCallback` for all handlers passed as props
- `useMemo` for computed values
- `React.memo()` on list item components
- Theme from `useTheme()` — never hardcoded colors
- `usePreventDoubleNavigation` on navigation buttons
- Every async function in `useEffect` has `.catch()`

---

### Step 8: Navigation Wiring (3 files — MANDATORY)

**This is the most commonly forgotten step. An unwired screen is invisible.**

**8a. Export** — `src/screens/<feature>/index.ts`:
```typescript
export { default as FeatureFeedScreen } from './FeatureFeedScreen';
export { default as FeatureViewScreen } from './FeatureViewScreen';
export { default as CreateFeatureScreen } from './CreateFeatureScreen';
```

**8b. Import + Stack.Screen** — `src/navigation/MainNavigator.tsx`:
```typescript
import FeatureViewScreen from '../screens/feature/FeatureViewScreen';
const CreateFeatureScreen = lazyScreen(() => import('../screens/feature/CreateFeatureScreen'));

// Inside <Stack.Navigator>:
<Stack.Screen name="FeatureView" component={FeatureViewScreen} options={{ animation: 'fade' }} />
<Stack.Screen name="CreateFeature" component={CreateFeatureScreen} options={{ animation: 'slide_from_bottom' }} />
```

- Use `lazyScreen()` for screens not needed at startup (creation, preview, settings)
- Import directly for screens needed instantly (viewers, feeds)

**8c. Route params** — already done in Step 6b in `src/types/index.ts`

**All 3 files MUST be updated in the same commit. Never create a screen without wiring it.**

---

### Step 9: Zustand Store (if needed)

**Where**: `src/stores/index.ts`

Only needed for:
- Optimistic updates (instant like before API responds)
- Shared state between screens (e.g., feed filters)
- Cross-navigator communication

```typescript
optimisticFeatureLikes: Record<string, boolean>;
setFeatureLikeOverride: (id: string, liked: boolean) => void;
```

Not every feature needs a store — simple features can use local `useState`.

---

### Step 10: Verification

**10a. TypeScript (zero errors on BOTH)**:
```bash
npx tsc --noEmit                                    # Frontend
cd aws-migration/lambda && npx tsc --noEmit          # Backend
```

**10b. Lint**:
```bash
npx eslint <changed files>                           # No ESLint errors
```

**10c. Expo compatibility** (if any dependency was added/changed):
```bash
npx expo-doctor                                      # Verify SDK compatibility
```

**10d. Automated tests** (if test infrastructure exists):
```bash
npx jest --passWithNoTests                           # Run existing test suites
```

**10e. Mental testing checklist**:
- [ ] Happy path: full flow works end-to-end?
- [ ] Double-tap: user taps action button twice fast?
- [ ] Empty state: no data -> meaningful message shown?
- [ ] Error state: API 500 -> user sees error, can retry?
- [ ] Auth: token expired mid-request -> auto-refresh + retry?
- [ ] Navigation: can reach screen? Can go back?
- [ ] Ownership: can't delete/edit another user's resource?
- [ ] Rate limit: rapid-fire requests -> 429 shown?

**10f. Diff review**: `git diff` — read every changed line

---

### Step 11: Commit + Merge

```bash
git checkout -b feat/feature-name
git add <specific files>  # NEVER git add . or git add -A
git commit -m "feat(scope): description"
git checkout main
git merge --squash feat/feature-name
git commit -m "feat(scope): description"
git branch -d feat/feature-name
git push origin main
```

---

### Step 12: Deploy + TestFlight

**12a. Backend**: `cd aws-migration/infrastructure && npx cdk deploy --all`
**12b. Migrations**: via admin Lambda `run-ddl` (see Step 1)
**12c. Verify Lambdas**: `aws lambda invoke` (expect 401 without token)
**12d. Frontend**: `eas update --branch production` (JS only) or `eas build + eas submit` (native changes)
**12e. Test on TestFlight**: full flow manually on device

**A feature is NOT done until you test it on TestFlight.**

---

### Feature Creation Checklist (copy-paste for each new feature)

```
## Feature: [name]

### Database
- [ ] Migration file created: migration-XXX-name.sql
- [ ] Migration executed via admin Lambda run-ddl
- [ ] Verified with run-sql (columns/tables exist)
- [ ] Indexes on every WHERE/JOIN/ORDER BY column
- [ ] Rollback block at bottom of migration

### Backend (Lambda)
- [ ] Handler files created in aws-migration/lambda/api/<feature>/
- [ ] Every handler: auth check (cognitoSub), validation, parameterized SQL
- [ ] cognitoSub -> profile ID resolution in every handler
- [ ] Rate limiting on create/mutate endpoints
- [ ] snake_case DB -> camelCase API mapping
- [ ] Error handling: try/catch, generic messages to client, log real errors
- [ ] Transactions: BEGIN/COMMIT/ROLLBACK/finally release

### CDK Infrastructure
- [ ] Lambda functions declared in lambda-stack.ts (or lambda-stack-2.ts)
- [ ] API Gateway routes in api-gateway-stack.ts
- [ ] Auth: cognitoAuthorizer on mutations, optional on reads
- [ ] Body validation on POST/PUT routes
- [ ] cdk synth succeeds
- [ ] cdk deploy succeeds
- [ ] Lambda invoke returns expected response (401 without token)

### Frontend Service
- [ ] API methods added to aws-api.ts
- [ ] Media upload function in mediaUpload.ts (if applicable)
- [ ] Upload folder added to UploadOptions type + upload-url.ts + aws-api.ts

### Types
- [ ] Data model interface in types/index.ts
- [ ] Navigation route params in MainStackParamList
- [ ] All params are serializable (no functions, Dates, classes)

### Screens
- [ ] All screens created in src/screens/<feature>/
- [ ] Loading state handled
- [ ] Error state handled
- [ ] Empty state handled
- [ ] Pull-to-refresh (if list)
- [ ] useCallback on handlers, useMemo on computed values
- [ ] Theme from useTheme(), no hardcoded colors
- [ ] Business account gating (if user-content feature)

### Navigation Wiring (ALL 3 FILES)
- [ ] src/screens/<feature>/index.ts — exports added
- [ ] src/types/index.ts — route params added
- [ ] src/navigation/MainNavigator.tsx — import + Stack.Screen added
- [ ] lazyScreen for non-critical screens, direct import for viewers

### Store (if needed)
- [ ] Zustand store slice added for optimistic updates / shared state

### Verification
- [ ] npx tsc --noEmit (frontend) — zero errors
- [ ] npx tsc --noEmit (lambda) — zero errors
- [ ] npx eslint on changed files — no lint errors
- [ ] npx expo-doctor — no SDK compatibility issues (if deps changed)
- [ ] npx jest — existing tests pass (if test infra exists)
- [ ] git diff reviewed — every line checked
- [ ] Mental testing: happy path, double-tap, empty, error, auth, nav, ownership

### Deployment
- [ ] cdk deploy --all (backend)
- [ ] Migrations executed and verified
- [ ] aws lambda invoke (endpoints respond)
- [ ] eas update --branch production (or eas build + submit)
- [ ] Tested on TestFlight — full flow works
- [ ] S3 files visible (if media feature): aws s3 ls s3://smuppy-media/<folder>/
- [ ] DB records visible: run-sql via admin Lambda
```

## AWS Environment Reference

| Resource | Value |
|----------|-------|
| Region | `us-east-1` (NOT eu-west-3) |
| API Gateway 1 (main) | `https://90pg0i63ff.execute-api.us-east-1.amazonaws.com/staging` |
| API Gateway 2 (admin) | `https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging` |
| S3 Media Bucket | `smuppy-media` (production), `smuppy-media-staging-471112656108` (staging) |
| Admin API Key Secret | `smuppy-admin-api-key-staging` |
| Rate Limit Table | `smuppy-rate-limit-{environment}` |
| DB Credentials Secret | Retrieved via `getPool()` / `getReaderPool()` in Lambda runtime |
