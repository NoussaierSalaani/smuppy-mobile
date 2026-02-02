# Agent Instructions — Smuppy

These rules apply to ALL Claude sessions (Claude Code, Cursor, etc.) working on this project.

## Before Writing Code

1. **Read before modifying** — Never change a file you haven't read first
2. **Understand the full pipeline** — A feature touches frontend (screens, navigation, types) AND backend (Lambda, API Gateway, S3). Both must work.
3. **Check dependencies** — Before adding or upgrading a package, check its changelog for breaking changes

## After Writing Code

### Frontend Changes
1. Run `npx tsc --noEmit` — zero errors required
2. If a new screen was created, verify ALL 3 wiring files:
   - `src/screens/<category>/index.ts` — export added
   - `src/types/index.ts` — route added to `MainStackParamList`
   - `src/navigation/MainNavigator.tsx` — import + `<Stack.Screen>` added
3. Test on simulator before declaring "done"

### Backend Changes (Lambda)
1. Run `cdk deploy` from `aws-migration/infrastructure/`
2. After deploy, verify with `aws lambda invoke` that the function works
3. For presigned URL endpoints: check the URL does NOT contain `x-amz-checksum-crc32`
4. Never declare a backend fix "done" without confirming the Lambda is updated live

### Pushing to TestFlight
- Frontend-only JS changes: `eas update --branch production --message "fix: description"`
- Native changes (new plugin, version bump, permissions): `eas build --platform ios --profile production` then `eas submit --platform ios --latest`
- Backend changes: `cdk deploy --all` from infrastructure directory

## Known Pitfalls — Do NOT Repeat

### AWS SDK v3 CRC32 Checksum (CRITICAL)
- AWS SDK v3 3.700+ adds CRC32 checksums to presigned URLs by default
- Mobile clients don't compute CRC32 → S3 rejects uploads
- Fix: Always use `requestChecksumCalculation: 'WHEN_REQUIRED'` on S3Client
- Fix: Always use `unhoistableHeaders` in `getSignedUrl()` options
- **NEVER** use `^` for AWS SDK versions — use exact versions only

### Screen Not Appearing
- If a screen exists as a file but isn't reachable in the app, check the 3 wiring files above
- Missing ANY of the 3 = the screen is invisible

### Changes Not Appearing on TestFlight
- Simulator uses local code (Metro hot reload)
- TestFlight uses the LAST deployed build or OTA update
- If you didn't run `eas update` or `eas build`, TestFlight has the OLD code
- Backend: simulator AND TestFlight both call the same Lambda — if Lambda isn't deployed, BOTH have the bug

## Dependency Rules

### Lambda (aws-migration/lambda/api/package.json)
- AWS SDK: exact versions only (`"3.975.0"` not `"^3.975.0"`)
- Stripe: exact versions only
- Always commit `package-lock.json`

### Mobile (package.json)
- Expo packages: use `~` (Expo manages compatibility)
- Other packages: prefer exact or `~` over `^`

## Immediate Fix Policy

- If you find a bug while working, fix it NOW — do not leave it for later
- If you caused a bug, fix it before moving to the next task
- Every commit must leave the app in a working state
- "Working state" means: `npx tsc --noEmit` passes, screens are reachable, endpoints return correct data
