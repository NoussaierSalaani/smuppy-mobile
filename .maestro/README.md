# Smuppy E2E Tests with Maestro

End-to-end tests for the Smuppy mobile app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. Install Maestro CLI:
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

2. For iOS simulator:
   - Xcode installed
   - iOS Simulator running

3. For Android emulator:
   - Android Studio installed
   - Android emulator running

## Running Tests

### Run all tests
```bash
maestro test .maestro/
```

### Run specific test flow
```bash
maestro test .maestro/auth/login.yaml
maestro test .maestro/feed/view-feed.yaml
```

### Run with different app ID
```bash
maestro test --app-id com.nou09.Smuppy.dev .maestro/auth/login.yaml
```

## Test Flows

### Authentication (`auth/`)
- **login.yaml** - Tests user login flow
- **signup.yaml** - Tests user registration flow

### Feed (`feed/`)
- **view-feed.yaml** - Tests viewing and scrolling the main feed
- **create-post.yaml** - Tests creating a new post

### Profile (`profile/`)
- **view-profile.yaml** - Tests viewing user profile
- **edit-profile.yaml** - Tests editing profile information

## Configuration

Environment variables can be set in `.maestro/config.yaml`:
- `TEST_EMAIL` - Email for test account
- `TEST_PASSWORD` - Password for test account

## Writing New Tests

### Basic Flow Structure
```yaml
appId: com.nou09.Smuppy

---

- launchApp:
    clearState: true

- waitForAnimationToEnd

- tapOn: "Button Text"

- assertVisible: "Expected Text"
```

### Useful Commands
- `tapOn` - Tap on element by text, id, or accessibility label
- `inputText` - Enter text into focused field
- `assertVisible` - Assert element is visible
- `scroll` - Scroll in direction
- `swipe` - Swipe gesture (pull to refresh)
- `back` - Press back button
- `hideKeyboard` - Hide soft keyboard
- `waitForAnimationToEnd` - Wait for animations
- `extendedWaitUntil` - Wait for element with timeout

### Conditional Flows
```yaml
- runFlow:
    when:
      visible: "Optional Button"
    commands:
      - tapOn: "Optional Button"
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run E2E Tests
  run: |
    maestro test .maestro/ --format junit --output report.xml
```

### Reporting
Generate HTML report:
```bash
maestro test .maestro/ --format html --output report.html
```

## Troubleshooting

### App not launching
- Verify app is installed on simulator/emulator
- Check `appId` matches bundle identifier

### Element not found
- Use Maestro Studio to inspect: `maestro studio`
- Check element visibility and accessibility

### Timeouts
- Increase `extendedWaitUntil` timeout
- Add `waitForAnimationToEnd` after navigation
