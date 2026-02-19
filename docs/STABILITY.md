# Smuppy — Stability & Anti-Regression Plan

> **Parent**: [CLAUDE.md](../CLAUDE.md) | **Workflow**: [CLAUDE-WORKFLOW.md](../CLAUDE-WORKFLOW.md)
>
> **Status**: Binding. All agents and developers MUST follow this plan.
>
> **Goal**: Bugs become rare, reproducible, and detected before production.
>
> **Principle**: We move from "fix and hope" to "fix and prevent regression."

---

## 1. Environment Determinism (No Phantom Bugs)

If the environment is not deterministic, you are chasing ghosts.

### 1.1 Version Locking (MANDATORY)

| What | How | File |
|------|-----|------|
| **Node.js** | `.nvmrc` with exact version (e.g., `22`) | `.nvmrc` |
| **Package manager** | `packageManager` field in `package.json` | `package.json` |
| **Dependencies** | `npm ci` only (never `npm install` in CI) | `package-lock.json` |
| **Expo SDK** | Exact version in `package.json` (currently SDK 54) | `package.json` |
| **AWS SDK (Lambda)** | Exact versions, no `^` prefix | `aws-migration/lambda/*/package.json` |

### 1.2 Clean Script (Single Source of Truth)

One command to reset to clean state:

```bash
npm run clean
# Clears: node_modules, .expo, metro cache, watchman, pod cache
# Then: npm ci && npx expo-doctor
```

### 1.3 Build Reproducibility

- Local build MUST match CI build (same Node version, same `npm ci`)
- EAS builds use `eas.json` profile — never override versions ad hoc
- Lambda deploys use `cdk deploy` from `aws-migration/infrastructure/` — always

---

## 2. CI Gate — Nothing Merges If Red

The CI pipeline (`.github/workflows/ci.yml`) runs:

| Check | Status | Blocks Merge |
|-------|--------|--------------|
| ESLint | Active | YES |
| TypeScript (`tsc --noEmit`) | Active | YES |
| Unit tests (Jest) + coverage thresholds | Active | YES |
| Build test (iOS + Android) | Active | YES |
| Security scan (gitleaks + npm audit + hardcoded secrets) | Active | YES |
| Lambda tests (Jest + TypeScript + ESLint) | Active | YES |
| CDK synth test | Active | YES |
| SonarCloud Quality Gate | Active | NO (informational — re-enable after hotspot triage) |
| Expo Doctor compatibility check | Active | YES (blocks deploy) |
| Bundle size check | Active | YES (fails if > 15MB) |
| Maestro E2E smoke tests | Active | Warning (non-blocking during rollout) |

### 2.1 Coverage Threshold Roadmap

| Phase | Branch % | Function % | Line % | Statement % | Status |
|-------|----------|------------|--------|-------------|--------|
| Phase 1 (achieved) | 51% | 24% | 2% | 2% | Done |
| Phase 2 (current) | 58% | 29% | 2% | 2% | Active (branches+functions exceeded target) |
| Phase 3 | 60% | 50% | 30% | 30% | After stability sprint |
| Phase 4 | 70% | 60% | 50% | 50% | Before App Store V2 |

**Rule**: Coverage thresholds only go UP, never down. Ratchet pattern.
**Actual coverage** (as of 2026-02-19): branches=58.05%, functions=29.83%, lines=2.69%, statements=2.69%

### 2.2 Local Quality Gates (Git Hooks)

| Hook | When | What it checks | Blocks |
|------|------|----------------|--------|
| **pre-commit** | Before every `git commit` | lint-staged (ESLint + tsc-files), SAST security scan, TypeScript check | YES |
| **pre-push** | Before every `git push` | Full TypeScript check, ESLint, Jest test suite with coverage | YES |

### 2.3 SonarCloud Quality Gate

SonarCloud runs after every PR and reports quality metrics:
- `sonar.qualitygate.wait=false` in `sonar-project.properties` (non-blocking for now)
- CI step `SonarSource/sonarqube-quality-gate-action@v1` reports gate status (informational)
- Coverage report from Jest is uploaded and analyzed
- **TODO**: Re-enable blocking once new code coverage exceeds 80% and security hotspots are triaged on sonarcloud.io

### 2.4 Bundle Size Gate

The CI checks JS bundle size on every PR:
- **Warning threshold**: 10 MB
- **Blocking threshold**: 15 MB
- Prevents accidental inclusion of large dependencies

### 2.5 CI Rule

**If CI is red, no merge. No exceptions.**

---

## 3. Critical Path Test Map (5 Smoke Tests)

These 5 flows represent 80% of user value. Each MUST have:
- A Maestro E2E flow (already partially exists in `.maestro/flows/`)
- A unit test for the core logic

| # | Flow | Maestro File | Unit Test Scope |
|---|------|-------------|-----------------|
| 1 | **Auth**: Login + token refresh + arrive Home | `02-auth-login.yaml` | `authService.login()`, token storage |
| 2 | **Feed**: Load VibesFeed + scroll + pull-to-refresh | `03-feed-navigation.yaml` | `feedStore`, API pagination |
| 3 | **Post**: Create post + upload + visible in feed | `05-post-interaction.yaml` | `awsAPI.createPost()`, optimistic update |
| 4 | **Peaks**: View story circles + open viewer + navigate | `06-peaks-feed.yaml` | Group logic, navigation state |
| 5 | **Profile**: View own profile + edit + save | `04-profile-screen.yaml` | `userStore`, profile API |

### 3.1 Test Writing Priority

1. **Crash / blockers** first
2. **Data inconsistency** (state, cache, optimistic updates)
3. **Navigation** (stack, deep links, back button)
4. **Race conditions** (async, double tap, concurrent requests)
5. **Backend contract** (API shape changes, validation)

---

## 4. Bug Discipline (MANDATORY — Every Bug Becomes a Test)

### 4.1 Bug Fix Process

```
1. Bug reported (or discovered)
   │
2. Write "Steps to Reproduce" + "Expected vs Actual"
   │
3. Write a test that REPRODUCES the bug (test fails = bug confirmed)
   │
4. Fix the bug (test now passes)
   │
5. Commit fix + test together
   │
6. CI passes → merge
```

### 4.2 Rules

- **NEVER** fix a bug without a test that prevents its return
- If the bug is in a Lambda handler: write a unit test for that handler
- If the bug is in frontend state: write a store/hook test
- If the bug is a navigation issue: write a Maestro flow
- If writing a full test is impractical: add a TypeScript type guard or runtime assertion at minimum

### 4.3 Bug Test Naming Convention

```
describe('peaks/list handler', () => {
  it('BUG-2026-02-10: excludes hidden peaks from feed mode', () => {
    // Regression test for: hidden peaks appearing in feed
    // ...
  });
});
```

Date-stamped bug references make regressions traceable.

---

## 5. AI Change Discipline (Minimal Diffs Only)

The #1 cause of regressions is large, multi-purpose diffs generated by AI.

### 5.1 Rules for AI-Generated Changes

| Rule | Detail |
|------|--------|
| **1 PR = 1 purpose** | One bug fix or one feature. Never both. |
| **Max scope** | Ideally < 10 files modified per commit |
| **No cleanup in fix PRs** | Refactors, formatting, dead code removal go in separate commits |
| **No implicit changes** | If AI modifies code outside the bug's scope, reject it |
| **Minimal fix** | The smallest change that fixes the bug. Not the "best" refactor. |
| **Read before write** | AI MUST read all affected files before making changes |
| **Verify after write** | `npx tsc --noEmit` + `npx eslint` + mental walkthrough |

### 5.2 Review Checklist for AI-Generated Code

Before accepting any AI-generated change:

- [ ] Does the diff ONLY touch files related to the stated purpose?
- [ ] Are there any "bonus" refactors or cleanups mixed in?
- [ ] Does the change introduce new dependencies?
- [ ] Is the change reversible (can be reverted without breaking other things)?
- [ ] Does `npx tsc --noEmit` pass with zero new errors?

---

## 6. Observability (Know WHERE It Breaks)

### 6.1 Required Instrumentation

| Layer | Tool | Status |
|-------|------|--------|
| **Mobile crashes** | Sentry (`initSentry()` in App.js) | Implemented |
| **JS errors** | Sentry React Native SDK (`captureException`, `captureMessage`) | Implemented |
| **API errors** | CloudWatch Logs (already via `createLogger`) | Exists |
| **Network failures** | Client-side error boundary + retry logic | Partial |
| **Navigation** | Screen tracking analytics | **TODO** |

### 6.2 Structured Error Logging

Every error log MUST include:
- **Where**: file + function name
- **What**: error message (sanitized, no PII)
- **Context**: request ID, user action that triggered it
- **Severity**: crash / error / warning

Lambda handlers already use `createLogger()`. Frontend needs equivalent structured logging.

### 6.3 When Something Breaks in Production

```
1. Check Sentry/Crashlytics for stack trace
   │
2. Reproduce locally with same data/state
   │
3. Write a failing test
   │
4. Fix + test + deploy
   │
5. Verify fix is live (Lambda invoke or EAS update)
```

---

## 7. Stability Sprint Protocol

When entering a stability period (feature freeze):

### 7.1 Triage

Collect all known bugs and classify:

| Category | Priority | Example |
|----------|----------|---------|
| **Crash** | P0 — fix now | App crashes on peak view with null video |
| **Data loss** | P0 — fix now | Comment posted but lost on refresh |
| **Broken flow** | P1 — fix this sprint | Can't navigate back from settings |
| **Visual glitch** | P2 — fix if time | Avatar flickers on profile load |
| **Edge case** | P3 — backlog | Search returns duplicates on fast scroll |

### 7.2 Fix Order

1. All P0s first (with regression tests)
2. P1s (with regression tests)
3. Raise coverage thresholds
4. Add missing Maestro smoke tests to CI
5. P2s if time permits

### 7.3 Exit Criteria

Stability sprint is DONE when:
- [ ] Zero P0 bugs open
- [ ] Zero P1 bugs open
- [ ] All 5 critical path Maestro flows pass
- [ ] Jest coverage above Phase 1 thresholds (10%)
- [ ] CI pipeline fully green on main
- [ ] Sentry/Crashlytics installed and reporting

---

## 8. Implementation Checklist

### Completed

- [x] Create `.nvmrc` with `22` (match CI)
- [x] Add `"packageManager": "npm@10.9.2"` to `package.json`
- [x] Install Sentry: `npx expo install @sentry/react-native`
- [x] Initialize Sentry in `App.tsx` with DSN from environment
- [x] Add `npm run clean` script to `package.json`
- [x] SonarCloud quality gate set to blocking (2026-02-19)
- [x] Pre-push hook added — runs TypeScript + ESLint + Jest before push (2026-02-19)
- [x] Expo-doctor check added to CI pipeline (2026-02-19)
- [x] Bundle size check added to CI — warns >10MB, blocks >15MB (2026-02-19)
- [x] Maestro E2E smoke test job added to CI (2026-02-19)
- [x] Coverage thresholds ratcheted to match actual values (2026-02-19)

### Next Steps

- [x] Raise Jest coverage thresholds to Phase 2 — branches 58%, functions 29% (2026-02-19)
- [x] Write unit tests for 5 critical services (2026-02-19):
  - `authService` — 68 tests (base64UrlDecode, isTokenExpired, decodeIdToken, smart signup fallback)
  - `awsAPI` — 211 tests (endpoint routing, retry logic, backoff, deduplication, network errors)
  - `feedStore` — 89 tests (cache management, optimistic likes, deletion, pruning, selectors)
  - `userStore` — 72 tests (profile CRUD, getFullName fallback, isPro, isProfileComplete, partialize security)
  - `usePreventDoubleNavigation` — 21 tests (goBack, navigate, replace, reset, double-click prevention)
- [ ] Run existing Maestro flows, fix any that fail
- [ ] Write regression tests for every bug fixed in the past 30 days
- [ ] Make Maestro E2E tests blocking in CI (after stabilization)
- [ ] Set up Sentry alerts for new crash types

---

## 9. File Inventory

| File | Purpose |
|------|---------|
| `docs/STABILITY.md` | This document — stability strategy |
| `CLAUDE.md` | Project rules — references this plan |
| `CLAUDE-WORKFLOW.md` | Dev workflow — includes stability verification |
| `.github/workflows/ci.yml` | CI pipeline (lint, test, SonarCloud, expo-doctor, bundle-size, E2E, security, Lambda, CDK, deploy) |
| `jest.config.js` | Jest configuration + coverage thresholds (ratchet plan) |
| `sonar-project.properties` | SonarCloud config — quality gate blocking enabled |
| `.husky/pre-commit` | Pre-commit hook — lint-staged + SAST + TypeScript |
| `.husky/pre-push` | Pre-push hook — TypeScript + ESLint + Jest full suite |
| `.maestro/` | Maestro E2E test flows (9 scenarios) |
| `e2e/` | E2E test code (Detox-based) |
| `src/__tests__/` | Unit tests (24 suites, 864 tests) |
| `.nvmrc` | Node version lock |
| `.gitleaks.toml` | Secret detection config |
