# Refactor Charter — Phase 0 (API Split, Safe)

## Goal
Split `aws-api.ts` into domain modules while keeping `aws-api.ts` as a facade (barrel re-export).
No behavior change. No screen import changes.

## Hard Rules (Non-negotiable)
1) `aws-api.ts` remains the public entry point.
2) No changes to screens/components imports in Phase 0.
3) Keep identical exported function names + signatures from `aws-api.ts`.
4) Move/split only — no logic changes, no renames.
5) `client.ts` may exist but is OPT-IN only (do not route existing calls through it).
6) Result/ok/err types are NOT part of Phase 0.
7) One commit per step. If gates fail: fix immediately or revert.

## Scope
Phase 0 domains in order (lowest coupling → highest):
AUTH → NOTIFICATIONS → SOCIAL → PROFILE → FEED → POST → UPLOAD → PEAKS → MESSAGING → MAP → EVENTS (PREP-gated)

## Gates (must pass after each commit)
- lint
- typecheck

## Rollback
- `git reset --hard pre-refactor-phase0`
