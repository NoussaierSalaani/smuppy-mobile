# Smuppy E2E Tests with Maestro

End-to-end tests for the Smuppy mobile app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. Install Maestro CLI:
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

2. iOS Simulator running with Smuppy installed:
```bash
npx expo run:ios
```

## Running Tests

### Quick runner script (recommended)
```bash
# Run all flows
./scripts/test-e2e.sh

# Smoke tests only (fast)
./scripts/test-e2e.sh --smoke

# Specific flow by number
./scripts/test-e2e.sh --flow 02

# Flows by tag
./scripts/test-e2e.sh --tag auth
```

### Direct Maestro commands
```bash
# Run all flows
maestro test .maestro/flows/

# Run specific flow
maestro test .maestro/flows/02-auth-login.yaml

# Interactive studio (element inspector)
maestro studio
```

## Test Flows

### Numbered Flows (`flows/`)

| # | Flow | Tags | What it tests |
|---|------|------|---------------|
| 00 | `app-launch` | smoke, launch | App launch, login, full tab navigation |
| 01 | `auth-signup` | auth | Welcome screen, signup button |
| 02 | `auth-login` | auth, critical | Login with email/password |
| 03 | `feed-navigation` | feed | Fan/Vibes/Xplorer tab switching |
| 04 | `profile-screen` | profile | Profile header, stats, settings |
| 05 | `post-interaction` | posts | Feed scrolling, swipe |
| 06 | `peaks-feed` | peaks | Vertical video feed, swipe, double-tap like |
| 07 | `search` | search | Search UI, query, results |
| 08 | `settings` | settings | Settings menu, sub-screens |
| 09 | `messages` | messages | Conversations, chat, search |
| 10 | `post-like-save` | posts, interactions | Like, scroll, refresh |
| 11 | `notifications` | notifications | Notification screen, scroll |
| 12 | `business-discover` | business | Xplorer map, search |
| 13 | `peaks-create` | peaks, creation | Peaks tab, create screen |
| 14 | `settings-detail` | settings | Edit profile, notifications, blocked, theme |
| 15 | `follow-unfollow` | social | Search users, view profile |
| 16 | `error-states` | validation | Login/signup validation, error messages |
| 17 | `full-regression` | regression, critical | Complete app walkthrough (all screens) |

### Legacy Flows (subdirectories)
- `auth/login.yaml` - Login flow
- `auth/signup.yaml` - Signup flow
- `feed/view-feed.yaml` - Feed viewing
- `feed/create-post.yaml` - Post creation
- `profile/view-profile.yaml` - Profile viewing
- `profile/edit-profile.yaml` - Profile editing

## Configuration

Environment variables in `.maestro/config.yaml`:
- `TEST_EMAIL` - Email for test account
- `TEST_PASSWORD` - Password for test account

## Claude Code Integration

After running tests, feed results to Claude Code for automated fixes:

```bash
# 1. Run tests
./scripts/test-e2e.sh

# 2. Find results directory (printed at end)
# 3. In Claude Code:
#    "Read maestro-results/<timestamp>/summary.txt and the screenshots.
#     Fix all issues found, 100% complete."
```

## Troubleshooting

### App not launching
- Verify app is installed: `xcrun simctl list devices booted`
- Check `appId` matches: `com.nou09.Smuppy`

### Element not found
- Use Maestro Studio to inspect: `maestro studio`
- Check testID props in source code

### Timeouts
- Increase `extendedWaitUntil` timeout
- Add `waitForAnimationToEnd` after navigation
