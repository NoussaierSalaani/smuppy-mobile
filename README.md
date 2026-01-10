# Smuppy

A React Native (Expo) social fitness app that connects users through sports, wellness, and healthy lifestyle content.

## Tech Stack

- **Framework**: React Native with Expo SDK 54
- **Backend**: Supabase (Auth, Database, Storage)
- **Navigation**: React Navigation v7
- **State**: React Context API
- **Styling**: StyleSheet with custom theme system

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Smuppy

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase and Google API keys

# Start the development server
npm start
```

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
GOOGLE_API_KEY=your-google-api-key
API_URL_DEV=http://localhost:3000/api
API_URL_PROD=https://api.smuppy.com/api
APP_ENV=dev
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── auth/           # Auth-specific components (GoogleLogo, authStyles)
│   ├── peaks/          # Peak-related components (PeakCard, RecordButton)
│   ├── Button.js       # Primary button component
│   ├── Input.js        # Form input component
│   ├── ErrorBoundary.js # Error handling wrapper
│   └── index.js        # Component exports
│
├── config/             # App configuration
│   ├── theme.js        # Colors, spacing, typography
│   ├── env.js          # Environment variables
│   ├── supabase.js     # Supabase client
│   └── api.js          # API endpoints
│
├── context/            # React Context providers
│   ├── UserContext.js  # User authentication state
│   └── TabBarContext.js # Bottom tab visibility
│
├── hooks/              # Custom React hooks
│   ├── usePreventDoubleClick.js
│   └── index.js
│
├── navigation/         # React Navigation setup
│   ├── AppNavigator.js # Root navigator
│   ├── AuthNavigator.js # Auth flow
│   └── MainNavigator.js # Main app tabs
│
├── screens/            # Screen components
│   ├── auth/           # Login, Signup, Password reset
│   ├── home/           # Feed screens (FanFeed, VibesFeed)
│   ├── peaks/          # Peak creation and viewing
│   ├── profile/        # User profiles
│   ├── messages/       # Chat and messaging
│   ├── notifications/  # Notification center
│   ├── onboarding/     # User onboarding flow
│   ├── search/         # Search functionality
│   └── settings/       # App settings
│
├── services/           # API and database services
│   └── database.js     # Supabase queries
│
└── utils/              # Utility functions
    ├── validation.js   # Form validation
    ├── biometrics.js   # Face ID / Touch ID
    ├── secureStorage.js # Encrypted storage
    ├── sessionManager.js # Auth session handling
    └── rateLimiter.js  # API rate limiting
```

## Key Features

### Authentication
- Email/password authentication via Supabase
- Biometric login (Face ID / Touch ID)
- Password reset flow with email verification
- Session management with secure token storage

### Feeds
- **FanFeed**: Posts from followed users
- **VibesFeed**: Discover content by interests (masonry layout)
- **XplorerFeed**: Explore new content
- Pull-to-refresh and infinite scroll pagination

### Peaks
- Short-form video content (similar to Stories)
- Record, preview, and share peaks
- View peaks from followed users

### Profiles
- User profiles with posts grid
- Follow/unfollow functionality
- Edit profile settings

## Theme System

The app uses a centralized theme in `src/config/theme.js`:

```javascript
import { COLORS, SPACING, SIZES, GRADIENTS } from './config/theme';

// Dark theme variant for peaks/profile screens
import { DARK_COLORS } from './config/theme';
```

### Colors
- `COLORS.primary` - Main brand color (#00CDB5)
- `COLORS.dark` - Dark text/backgrounds (#0A252F)
- `COLORS.white` - White (#FFFFFF)
- `COLORS.gray` - Muted text (#8E8E93)

### Spacing
- `SPACING.xs` - 4px
- `SPACING.sm` - 8px
- `SPACING.md` - 12px
- `SPACING.base` - 16px
- `SPACING.lg` - 20px
- `SPACING.xl` - 24px

## Components

### Using Shared Auth Styles

```javascript
import { GoogleLogo, AUTH_COLORS, authStyles, getInputIconColor, getButtonGradient } from '../components/auth';

const styles = StyleSheet.create({
  ...authStyles,
  // Screen-specific styles
});
```

### Error Boundary

Wrap screens with ErrorBoundary for crash protection:

```javascript
import { ErrorBoundary } from '../components';

<ErrorBoundary>
  <YourScreen />
</ErrorBoundary>
```

## Scripts

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run web        # Run in web browser
```

## Security

- API keys stored in environment variables (never committed)
- Secure token storage using expo-secure-store
- Biometric authentication with attempt limiting
- Rate limiting on sensitive operations

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run linting and tests
4. Submit a pull request

## License

Private - All rights reserved
