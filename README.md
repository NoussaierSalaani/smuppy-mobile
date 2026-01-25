# Smuppy

A React Native (Expo) social fitness app that connects users through sports, wellness, and healthy lifestyle content.

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| **Framework** | React Native + Expo | SDK 54 |
| **Backend** | AWS (Cognito + API Gateway + Lambda + DynamoDB) | - |
| **State** | Zustand + React Query | v5 |
| **Media Storage** | AWS S3 + CloudFront | CDN |
| **Notifications** | Expo Notifications | Push |
| **Lists** | @shopify/flash-list | 10x faster |
| **Images** | expo-image | Cached |
| **Monitoring** | Sentry | Error tracking |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SMUPPY MOBILE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   React Native App (Expo SDK 54)                               │
│   ├── Zustand (Client State)                                   │
│   ├── React Query (Server State + Cache)                       │
│   └── FlashList + expo-image (Performance)                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                       AWS BACKEND                               │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│   │  Cognito    │  │ API Gateway │  │   Expo Push         │   │
│   │  - Auth     │  │  + Lambda   │  │   - Notifications   │   │
│   │  - Users    │  │  - REST API │  │   - Tokens          │   │
│   │  - MFA      │  │             │  │                     │   │
│   └─────────────┘  └─────────────┘  └─────────────────────┘   │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐                            │
│   │  DynamoDB   │  │ S3 + CDN   │                             │
│   │  - Data     │  │ CloudFront │                             │
│   │  - Feeds    │  │ - Media    │                             │
│   └─────────────┘  └─────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd smuppy-mobile

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your keys (see Environment Variables below)

# Start the development server
npm start
```

### Environment Variables

Create a `.env` file:

```env
# Google APIs
GOOGLE_API_KEY=your-google-api-key

# Google OAuth Client IDs
GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com

# Backend API
API_URL_DEV=http://localhost:3000/api
API_URL_PROD=https://api.smuppy.com/api
APP_ENV=dev

# AWS Configuration
AWS_REGION=us-east-1
S3_BUCKET_NAME=smuppy-media
CLOUDFRONT_URL=https://your-cloudfront-id.cloudfront.net

# Agora (Live Streaming)
AGORA_APP_ID=your-agora-app-id

# Monitoring (Optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── OptimizedImage.js    # expo-image wrapper
│   ├── OptimizedList.js     # FlashList wrapper
│   └── ...
├── config/              # App configuration
│   ├── theme.js         # Colors, spacing, typography
│   ├── env.ts           # Environment variables
│   └── aws-config.ts    # AWS configuration
├── context/             # React Context providers
├── hooks/               # Custom React hooks
│   ├── queries/         # React Query hooks
│   ├── useMediaUpload.ts    # S3 upload hook
│   ├── useNotifications.ts  # Push notifications hook
│   └── index.ts         # Centralized exports
├── navigation/          # React Navigation setup
├── screens/             # Screen components
├── services/            # External services
│   ├── aws-auth.ts      # AWS Cognito authentication
│   ├── aws-api.ts       # AWS API Gateway client
│   ├── notifications.ts # Push notification service
│   └── socialAuth.ts    # Apple/Google Sign-In
├── stores/              # Zustand stores
└── utils/               # Utilities
    ├── validation.ts    # Form validation
    ├── secureStorage.ts # Secure token storage
    └── rateLimiter.ts   # API rate limiting
```

## Key Features

### Authentication
- Email/password via AWS Cognito
- Apple Sign-In & Google Sign-In
- Biometric login (Face ID / Touch ID)
- Password reset with email verification
- Session management with secure storage

### Push Notifications
- Expo Push Notifications
- Token storage in AWS
- Local and remote notifications
- Badge management

### Media Upload (S3 + CloudFront)
- Direct upload to S3 via presigned URLs
- CloudFront CDN for fast delivery
- Automatic image compression
- Presets: avatar (400x400), cover (1200x600), post (1080x1350)

### Feeds
- **FanFeed**: Posts from followed users
- **VibesFeed**: Discover content by interests
- **XplorerFeed**: Interactive map with search
- Pull-to-refresh and infinite scroll

### Live Streaming
- Go Live with intro and configuration screens
- Real-time chat and viewer count
- Gift system with animations

### Private Sessions (1:1 Video Calls)
- Book sessions with creators
- Multiple duration options (15, 30, 60 min)
- Integrated payment flow (Stripe)
- Agora SDK for video calls

### Performance Optimizations
- FlashList for 10x faster lists
- expo-image with memory + disk cache
- React Query caching (5min stale, 30min cache)
- Optimistic updates for likes/follows

## Scripts

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run typecheck  # TypeScript type check
npm run lint       # ESLint check
```

## AWS Infrastructure

| Service | Purpose |
|---------|---------|
| **Cognito** | User authentication & authorization |
| **API Gateway** | REST API endpoints |
| **Lambda** | Serverless backend functions |
| **DynamoDB** | NoSQL database for feeds, posts |
| **S3** | Media storage |
| **CloudFront** | CDN for media delivery |

## Documentation

| Document | Description |
|----------|-------------|
| `AUDIT_REPORT.md` | Complete audit report |
| `docs/TECHNICAL.md` | Technical documentation |
| `docs/ARCHITECTURE.md` | Architecture details |

## Security

- API keys in environment variables (never committed)
- Secure token storage (expo-secure-store)
- SSL/TLS certificate pinning
- Rate limiting on sensitive operations
- Presigned URLs for S3 (no credentials in app)

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run linting and type check
4. Submit a pull request

## License

Private - All rights reserved
