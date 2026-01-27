# Smuppy Account Types & Features

## Overview

Smuppy supports three account types, each with specific features and capabilities tailored to different user needs.

---

## 1. Personal Account (`personal`)

**Target Users:** Regular users who want to discover content, follow creators, and participate in the community.

### Features

| Feature | Description |
|---------|-------------|
| Feed Access | View Fan Feed and Vibes Feed |
| Peaks | View and create Peaks (stories) |
| Social | Follow creators, like, comment, share |
| Messages | Direct messaging with other users |
| Events | Discover and join events |
| Business Discovery | Find and book at local businesses |
| Subscriptions | Subscribe to creator channels |
| Private Sessions | Book 1-on-1 sessions with creators |

### Limitations
- Cannot create Events
- Cannot create Challenges
- Cannot go Live
- Cannot receive payments

---

## 2. Pro Creator Account (`pro_creator`)

**Target Users:** Content creators, coaches, trainers, and influencers who want to monetize their content and expertise.

### Features

All Personal features plus:

| Feature | Description |
|---------|-------------|
| Channel Subscriptions | Offer paid subscriptions with tiers |
| Private Sessions | Offer 1-on-1 video sessions |
| Session Packs | Sell bundles of sessions |
| Live Streaming | Go live with real-time viewer interaction |
| Challenges | Create and manage challenges |
| Events | Create and manage events |
| Creator Wallet | View earnings and manage payouts |
| Tips | Receive tips from fans |
| Analytics | View engagement and revenue stats |

### Monetization Options

1. **Channel Subscriptions**
   - Multiple tiers (Basic, Premium, VIP)
   - Custom pricing per tier
   - Exclusive content access

2. **Private Sessions**
   - Set availability and pricing
   - 15/30/45/60 minute sessions
   - Video call integration (Agora)

3. **Session Packs**
   - Bundle multiple sessions at discount
   - Validity period (30/60/90 days)

4. **Tips**
   - Real-time tips during lives
   - Tip leaderboards

5. **Events**
   - Free or paid events
   - Fan-only or public access

---

## 3. Pro Business Account (`pro_local`)

**Target Users:** Gyms, studios, wellness centers, sports facilities, and local businesses.

### Features

All Personal features plus:

| Feature | Description |
|---------|-------------|
| Business Profile | Full business page with location, hours, services |
| Business Discovery | Appear on map and in search |
| Services & Products | Manage offerings with pricing |
| Booking System | Accept reservations for sessions/classes |
| Subscription Plans | Offer memberships (weekly/monthly/yearly) |
| QR Access System | Member check-in via QR code |
| Schedule Management | Weekly program with activities |
| AI Schedule Import | Upload PDF/image, AI extracts activities |
| Member Management | View and manage subscribers |
| Dashboard | Stats, revenue, check-ins overview |

### Business Categories

| Category | Icon | Description |
|----------|------|-------------|
| Gym | barbell | Fitness centers & gyms |
| Yoga Studio | body | Yoga & meditation studios |
| CrossFit | fitness | CrossFit boxes |
| Martial Arts | flash | Dojos & fighting gyms |
| Pool | water | Swimming pools & aquatic centers |
| Tennis | tennisball | Tennis clubs & courts |
| Padel | tennisball | Padel clubs |
| Climbing | trending-up | Climbing gyms |
| Spa & Wellness | leaf | Spas & wellness centers |
| Nutrition | nutrition | Nutritionists & dietitians |
| Sports Shop | storefront | Sports equipment stores |

---

## Screen Reference

### Personal Screens
```
src/screens/home/
├── FeedScreen.tsx          # Main feed (Fan + Vibes tabs)
├── FanFeed.tsx             # Fan-only content
├── VibesFeed.tsx           # Public content
└── CreatePostScreen.tsx    # Create new post

src/screens/peaks/
├── PeaksFeedScreen.tsx     # Stories feed
├── PeakViewScreen.tsx      # View single peak
└── CreatePeakScreen.tsx    # Create peak

src/screens/profile/
├── ProfileScreen.tsx       # Own profile
└── UserProfileScreen.tsx   # Other user profile

src/screens/messages/
├── MessagesScreen.tsx      # Conversations list
├── ChatScreen.tsx          # Single conversation
└── NewMessageScreen.tsx    # Start new chat
```

### Pro Creator Screens
```
src/screens/sessions/
├── PrivateSessionsManageScreen.tsx  # Manage availability
├── BookSessionScreen.tsx            # Fan books session
├── SessionPaymentScreen.tsx         # Payment flow
├── SessionBookedScreen.tsx          # Confirmation
├── WaitingRoomScreen.tsx            # Pre-call waiting
├── PrivateCallScreen.tsx            # Video call (Agora)
├── SessionEndedScreen.tsx           # Post-call summary
├── MySessionsScreen.tsx             # Fan's booked sessions
├── CreatorOfferingsScreen.tsx       # View creator's offerings
├── PackPurchaseScreen.tsx           # Buy session pack
├── ChannelSubscribeScreen.tsx       # Subscribe to channel
└── CreatorEarningsScreen.tsx        # Revenue dashboard

src/screens/live/
├── GoLiveIntroScreen.tsx            # Pre-live setup
├── GoLiveScreen.tsx                 # Going live
├── LiveStreamingScreen.tsx          # Live broadcast
├── ViewerLiveStreamScreen.tsx       # Watch live
└── LiveEndedScreen.tsx              # Post-live stats

src/screens/challenges/
├── ChallengeListScreen.tsx          # Browse challenges
├── ChallengeDetailScreen.tsx        # View challenge
└── CreateChallengeScreen.tsx        # Create challenge

src/screens/events/
├── EventListScreen.tsx              # Browse events
├── EventDetailScreen.tsx            # View event
├── CreateEventScreen.tsx            # Create event
└── EventManageScreen.tsx            # Manage event
```

### Pro Business Screens
```
src/screens/business/
├── BusinessDiscoveryScreen.tsx          # Map/list discovery
├── BusinessProfileScreen.tsx            # Public business profile
├── BusinessBookingScreen.tsx            # Book service/session
├── BusinessSubscriptionScreen.tsx       # Subscribe to membership
├── BusinessBookingSuccessScreen.tsx     # Booking confirmation
├── BusinessSubscriptionSuccessScreen.tsx # Subscription confirmation
├── MySubscriptionsScreen.tsx            # User's subscriptions
├── MemberAccessScreen.tsx               # QR code for access
├── BusinessDashboardScreen.tsx          # Owner dashboard
├── BusinessServicesManageScreen.tsx     # Manage services/products
├── BusinessProgramScreen.tsx            # Manage activities/schedule
├── BusinessScheduleUploadScreen.tsx     # AI schedule import
└── BusinessScannerScreen.tsx            # Scan member QR codes
```

---

## API Endpoints Reference

### Business APIs

```typescript
// Discovery & Profiles
GET  /businesses/discover
GET  /businesses/:id
GET  /businesses/:id/services
GET  /businesses/:id/schedule
GET  /businesses/:id/reviews

// Booking Flow
POST /businesses/bookings/create-payment
POST /businesses/bookings/confirm
GET  /businesses/bookings/my
DELETE /businesses/bookings/:id

// Subscription Flow
GET  /businesses/:id/subscription-plans
POST /businesses/subscriptions/create
POST /businesses/subscriptions/confirm
GET  /businesses/subscriptions/my
DELETE /businesses/subscriptions/:id
POST /businesses/subscriptions/:id/reactivate

// QR Access System
GET  /businesses/subscriptions/:id/access-pass
POST /businesses/validate-access
POST /businesses/log-entry

// Owner Dashboard
GET  /businesses/my/dashboard
GET  /businesses/my/services
POST /businesses/my/services
PATCH /businesses/my/services/:id
DELETE /businesses/my/services/:id

// Schedule Management
GET  /businesses/my/program
POST /businesses/my/activities
PATCH /businesses/my/activities/:id
DELETE /businesses/my/activities/:id
POST /businesses/my/schedule-slots
DELETE /businesses/my/schedule-slots/:id

// AI Features
POST /businesses/my/analyze-schedule
POST /businesses/my/import-schedule

// Tags
POST /businesses/my/tags
DELETE /businesses/my/tags/:id
```

---

## Payment Integration

All payments are processed through **Stripe**:

- **Payment Sheet** for one-time payments (bookings, session packs)
- **Subscription API** for recurring payments (channel subscriptions, memberships)
- **Connect** for creator/business payouts

### Payment Flow

1. Client requests payment intent from backend
2. Backend creates Stripe PaymentIntent/Subscription
3. Client presents Stripe Payment Sheet
4. User completes payment
5. Client confirms with backend
6. Backend verifies with Stripe webhook

---

## Upgrade Flow

Users can upgrade their account type:

1. **Personal → Pro Creator**: `UpgradeToProScreen`
   - Double confirmation required
   - Identity verification (optional)
   - Platform fee agreement

2. **Personal → Pro Business**: `BusinessInfoScreen` (onboarding)
   - Business details required
   - Category selection
   - Location setup

---

## Navigation Types

```typescript
type MainStackParamList = {
  // Business Screens
  BusinessDiscovery: undefined;
  BusinessProfile: { businessId: string };
  BusinessBooking: { businessId: string; serviceId?: string };
  BusinessSubscription: { businessId: string; serviceId?: string };
  BusinessBookingSuccess: { bookingId, businessName, serviceName, date, time };
  BusinessSubscriptionSuccess: { subscriptionId, businessName, planName, period, trialDays? };
  MySubscriptions: undefined;
  MemberAccess: { subscriptionId, businessId, businessName };
  BusinessDashboard: undefined;
  BusinessServicesManage: undefined;
  BusinessProgram: { tab?: 'activities' | 'schedule' | 'tags' };
  BusinessScheduleUpload: undefined;
  BusinessScanner: undefined;

  // ... other screens
};
```

---

## Best Practices

### For Pro Creators
1. Set up your channel subscription tiers early
2. Offer session packs for better value
3. Go live regularly to engage fans
4. Create challenges to boost engagement

### For Pro Businesses
1. Keep your schedule updated
2. Use AI import for quick schedule setup
3. Encourage members to use QR check-in
4. Respond to reviews promptly
5. Offer trial periods on memberships

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial account types (Personal, Pro Creator) |
| 2.0.0 | 2024-02 | Added Pro Business account type |
| 2.1.0 | 2024-02 | Added QR access system |
| 2.2.0 | 2024-02 | Added AI schedule import |
