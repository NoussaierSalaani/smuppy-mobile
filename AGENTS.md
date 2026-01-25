# AGENTS.md — Smuppy Mobile Rules (Source of Truth)

These rules apply to ALL AI agents (Codex, Claude Code, Cursor agents) and humans.

## 0) Absolute Rules
- NEVER edit files unless explicitly requested by the user.
- Work in SMALL LOTS only (UI-only or backend-only).
- One LOT = one purpose. No opportunistic refactors.
- Always list EXACT files that will be changed before changing anything.
- If unsure, STOP and ask for clarification.

## 1) Safe Workflow (mandatory)
Before any change:
1) Run `git status -sb`
2) Explain what you will do (short)
3) List files to be modified
4) Apply minimal changes only
5) Provide validation steps

## 2) Allowed Change Scope
Allowed:
- Small targeted fixes
- Bug fixes requested explicitly
- Security hardening requested explicitly
- Documentation updates in /architecture only

Not allowed:
- Renaming folders/files without request
- Moving code for "cleanliness"
- Large refactors
- Changing architecture patterns

## 3) Smuppy Style & Consistency
- Mobile is the reference architecture.
- Do NOT invent new patterns.
- Follow existing coding conventions in:
  - architecture/ARCHITECTURE.md
  - architecture/STYLEGUIDE.md
  - architecture/CONTRIBUTING.md

## 4) Security Principles (non-negotiable)
- Generic login errors (anti-enumeration).
- Detailed validation allowed at signup only.
- Always clear tokens on logout.
- Never store tokens manually in AsyncStorage.
- AWS Cognito for authentication.
- API Gateway + WAF for rate limiting.

## 5) Output Format
Every response must include:
- A short summary
- Files changed (exact paths)
- Validation steps (build/lint/typecheck + manual test)
