# Smuppy

A React Native (Expo) social fitness app that connects users through sports, wellness, and healthy lifestyle content.

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| **Framework** | React Native + Expo | SDK 52 |
| **Backend** | Supabase | PostgreSQL + Auth + Realtime |
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
│   React Native App (Expo SDK 52)                               │
│   ├── Zustand (Client State)                                   │
│   ├── React Query (Server State + Cache)                       │
│   └── FlashList + expo-image (Performance)                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                     EXTERNAL SERVICES                           │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│   │  Supabase   │  │    AWS      │  │   Expo Push         │   │
│   │  - Auth     │  │  - S3       │  │   - Notifications   │   │
│   │  - Database │  │  - CloudFrt │  │   - Tokens          │   │
│   │  - Realtime │  │             │  │                     │   │
│   │  - Edge Fn  │  │             │  │                     │   │
│   └─────────────┘  └─────────────┘  └─────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- Supabase CLI (`npm install -g supabase`)

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
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Google APIs
GOOGLE_API_KEY=your-google-api-key

# Backend API
API_URL_DEV=http://localhost:3000/api
API_URL_PROD=https://api.smuppy.com/api
APP_ENV=dev

# AWS S3 & CloudFront (Media Storage)
AWS_REGION=us-east-1
S3_BUCKET_NAME=smuppy-media
CLOUDFRONT_URL=https://your-cloudfront-id.cloudfront.net
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

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
│   ├── env.js           # Environment variables
│   ├── supabase.js      # Supabase client
│   └── api.js           # API endpoints
├── context/             # React Context providers
├── hooks/               # Custom React hooks
│   ├── queries/         # React Query hooks
│   ├── useMediaUpload.ts    # S3 upload hook
│   ├── useNotifications.ts  # Push notifications hook
│   └── index.ts         # Centralized exports
├── navigation/          # React Navigation setup
├── screens/             # Screen components
├── services/            # External services
│   ├── notifications.ts # Push notification service
│   ├── mediaUpload.ts   # S3 upload service
│   └── database.js      # Supabase queries
├── stores/              # Zustand stores
└── utils/               # Utilities
    ├── imageCompression.ts  # Image compression
    ├── validation.js    # Form validation
    └── rateLimiter.js   # API rate limiting

supabase/
├── config.toml          # Supabase CLI config
├── functions/           # Edge Functions
│   └── media-presigned-url/  # S3 presigned URL generator
└── migrations/          # Database migrations
```

## Key Features

### Authentication
- Email/password via Supabase
- Biometric login (Face ID / Touch ID)
- Password reset with email verification
- Session management with secure storage

### Push Notifications
- Expo Push Notifications
- Token storage in Supabase
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
- **XplorerFeed**: Explore new content
- Pull-to-refresh and infinite scroll

### Performance Optimizations
- FlashList for 10x faster lists
- expo-image with memory + disk cache
- React Query caching (5min stale, 30min cache)
- Optimistic updates for likes/follows

## Usage Examples

### Media Upload

```javascript
import { useMediaUpload } from '../hooks';

const { uploadAvatarImage, progress, isUploading } = useMediaUpload();

const handleUpload = async () => {
  const result = await uploadAvatarImage();
  if (result) {
    console.log('URL:', result.cdnUrl);
  }
};
```

### Push Notifications

```javascript
import { useNotifications } from '../hooks';

const { registerForPushNotifications, sendLocalNotification } = useNotifications();

// Register on app start
await registerForPushNotifications();

// Send local notification
sendLocalNotification('Title', 'Body', { screen: 'Profile' });
```

### Data Fetching

```javascript
import { useFeedPosts, useToggleLike } from '../hooks';

// Get feed with caching
const { data, fetchNextPage, isLoading } = useFeedPosts('fan');

// Toggle like with optimistic update
const { mutate: toggleLike } = useToggleLike();
toggleLike({ postId: '123', liked: false });
```

## Scripts

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run web        # Run in web browser
```

## Supabase Edge Functions

### Deploy functions

```bash
# Login to Supabase
supabase login

# Link project
supabase link --project-ref your-project-ref

# Set secrets
supabase secrets set AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=xxx

# Deploy
supabase functions deploy media-presigned-url
```

## Documentation

| Document | Description |
|----------|-------------|
| `docs/TECHNICAL.md` | Detailed technical documentation |
| `docs/ARCHITECTURE.md` | Architecture and infrastructure |
| `docs/CHANGELOG_OPTIMIZATION.md` | Performance optimization changelog |
| `docs/QUICK_REFERENCE.md` | Quick code reference |
| `src/context.md` | Design system (colors, typography) |

## Security

- API keys in environment variables (never committed)
- Secure token storage (expo-secure-store)
- SSL pinning for API calls
- Rate limiting on sensitive operations
- Presigned URLs for S3 (no credentials in app)

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run linting and tests
4. Submit a pull request

## License

Private - All rights reserved
