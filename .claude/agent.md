# Agent Instructions — Smuppy (Quick Reference)

Full rules: **CLAUDE.md** | Full workflow: **CLAUDE-WORKFLOW.md**

## Before Writing Code
- Read every file you will modify (see CLAUDE.md > Code Quality Rules)
- Understand the full pipeline: frontend + backend + types + navigation (see CLAUDE-WORKFLOW.md > Work Scope Principle)
- Check dependency compatibility with `npx expo-doctor` (see CLAUDE.md > Expo & React Native Dependency Management)

## After Writing Code

### Frontend
- `npx tsc --noEmit` — zero errors (see CLAUDE.md > Pre-Merge Checklist)
- `npx eslint` on changed files — no lint errors
- New screens: wire all 3 files (see CLAUDE.md > Screen & Navigation Wiring)
- Test on simulator before declaring "done"

### Backend (Lambda)
- `cdk deploy` then `aws lambda invoke` to verify (see CLAUDE.md > Deployment Verification)
- Presigned URLs: no `x-amz-checksum-crc32` (see CLAUDE.md > S3 & Presigned URLs)
- Never declare "done" without live verification

### TestFlight
- JS-only: `eas update --branch production`
- Native changes: `eas build --platform ios` then `eas submit`
- Backend: `cdk deploy --all`

## Key Pitfalls
- AWS SDK CRC32 checksums (see CLAUDE.md > S3 & Presigned URLs)
- Unwired screens (see CLAUDE.md > Screen & Navigation Wiring)
- Undeployed changes (see CLAUDE.md > Feature Completion Policy)

## Dependency Rules
- Lambda: exact versions only, no `^` (see CLAUDE.md > Dependency Safety)
- Mobile: `npx expo install` only, run `npx expo-doctor` after changes
- Always commit `package-lock.json`
