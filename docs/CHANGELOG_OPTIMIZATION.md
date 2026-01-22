# Changelog - Performance & Scalability Optimization

## Version 1.5.0 - 22 Janvier 2026

### Smuppy Unique Gestures (LOT R)

**Création de l'empreinte unique Smuppy avec des gestes distinctifs.**

---

#### DoubleTapLike Component (nouveau)

**Fichier:** `src/components/DoubleTapLike.tsx`

Geste signature Smuppy pour liker avec animation heart burst.

| Feature | Description |
|---------|-------------|
| **Double-tap detection** | 300ms timing window |
| **Heart burst** | 6 mini-cœurs explosant en cercle |
| **Directions** | 0°, 60°, 120°, 180°, 240°, 300° |
| **Couleurs** | Alternance primary + #FF8FAB |
| **Haptic** | NotificationFeedbackType.Success |

**Animation sequence:**
```javascript
// 1. Main heart appears and bounces
spring(heartScale, { toValue: 1.2, friction: 3 })
spring(heartScale, { toValue: 1 })

// 2. Heart scales up and fades
parallel([
  timing(heartScale, { toValue: 1.5, duration: 200 }),
  timing(heartOpacity, { toValue: 0, duration: 200 }),
])

// 3. Mini hearts explode outward
miniHearts.forEach((heart, i) => {
  const angle = (i * 60) * Math.PI / 180;
  const distance = 60 + Math.random() * 30;
  // Animate x, y, scale, opacity
})
```

**Usage:**
```jsx
<DoubleTapLike
  onDoubleTap={() => !post.isLiked && toggleLike(post.id)}
  onSingleTap={() => openPost(post.id)}
  showAnimation={!post.isLiked}
>
  <PostImage source={post.media} />
</DoubleTapLike>
```

---

#### SwipeToPeaks Component (nouveau)

**Fichier:** `src/components/SwipeToPeaks.tsx`

Geste unique pour accéder aux Peaks depuis FanFeed.

| Feature | Description |
|---------|-------------|
| **Swipe threshold** | 100px vers le bas |
| **Max drag** | 150px |
| **Indicator** | Pill animé avec progression |
| **Colors** | Gradient primary → vert quand prêt |
| **Haptic** | Medium au seuil, Success au release |

**États visuels:**
```
[Dragging < 100px]  →  "Swipe for Peaks" (gradient primary)
[Dragging >= 100px] →  "Release for Peaks!" (gradient vert)
[Released >= 100px] →  Navigate to Peaks screen
```

**Note:** Uniquement sur FanFeed car VibesFeed a déjà les Peaks visibles.

---

### Advanced AI Mood Detection System (nouveau)

**Architecture multi-composants pour détection d'humeur et recommandations personnalisées.**

#### Nouveaux fichiers créés

| Fichier | Rôle |
|---------|------|
| `src/services/moodDetection.ts` | Moteur multi-signal fusion (600+ lignes) |
| `src/services/moodRecommendation.ts` | Two-tower recommendation engine |
| `src/hooks/useMoodAI.ts` | Hook React pour intégration |

---

#### Multi-Signal Mood Detection

**Fichier:** `src/services/moodDetection.ts`

Le système fusionne **4 types de signaux** avec pondération configurable:

| Signal | Poids | Métriques |
|--------|-------|-----------|
| **Behavioral** | 0.25 | Scroll velocity, pauses, direction, rapid scrolls |
| **Engagement** | 0.30 | Likes, comments, shares, time per post |
| **Temporal** | 0.20 | Time of day, day of week, session duration |
| **Content** | 0.25 | Category preferences, media type preferences |

**Scroll Velocity Tracking:**
```typescript
// Track last 50 scroll positions with timestamps
// Calculate average velocity, pause count, rapid scroll count
// Detect: bored (fast scroll), engaged (slow with pauses), focused (regular)
```

---

#### Two-Tower Recommendation Engine

**Fichier:** `src/services/moodRecommendation.ts`

Architecture inspirée des systèmes ML modernes:

**Mood → Content Mapping:**
| Mood | Catégories | Types |
|------|------------|-------|
| Energetic | Fitness, Workout, Challenges, Motivation | video, carousel |
| Relaxed | Nature, Meditation, Yoga, ASMR | image, video |
| Social | Trending, Viral, Community, Comedy | video, carousel |
| Creative | Art, Design, Photography, Music | image, carousel |
| Focused | Education, Tutorial, Productivity | video, carousel |

**Emotional Uplift Strategy:**
```typescript
// When mood is low, boost positive content
lowEnergy:  +50% boost to Motivation, Comedy, Uplifting
stressed:   +40% boost to Nature, ASMR, Meditation
lonely:     +60% boost to Community, Social, Friends
bored:      +30% boost to Trending, Viral, Surprising
```

**Configuration:**
```typescript
{
  moodWeight: 0.4,           // Mood influence
  diversityWeight: 0.25,     // Content diversity
  freshnessWeight: 0.2,      // Recency preference
  explorationRate: 0.15,     // Serendipity %
  maxSameCreator: 3,         // Limit per creator
  maxSameCategory: 5,        // Limit per category
}
```

---

#### useMoodAI Hook

**Fichier:** `src/hooks/useMoodAI.ts`

Hook React pour intégration dans composants:

```typescript
const {
  mood,                    // Current mood analysis
  isAnalyzing,             // Loading state
  handleScroll,            // Auto scroll tracking
  trackPostView,           // Track post view start
  trackPostExit,           // Track post view end
  trackLike,               // Track like action
  getRecommendations,      // Get AI recommendations
  quickRerank,             // Fast reorder posts
  refreshMood,             // Force mood refresh
} = useMoodAI({
  enableScrollTracking: true,
  moodUpdateInterval: 30000,
  onMoodChange: (mood) => console.log('Mood:', mood.primaryMood),
});
```

---

#### 6 Moods avec Display

| Mood | Emoji | Couleur | Gradient | Description |
|------|-------|---------|----------|-------------|
| `energetic` | ⚡ | #FF6B6B | #FF6B6B → #FF8E53 | Ready to conquer the day |
| `relaxed` | 🌿 | #4CAF50 | #4CAF50 → #8BC34A | Taking it easy |
| `social` | 👋 | #2196F3 | #2196F3 → #03A9F4 | Feeling connected |
| `creative` | 🎨 | #9C27B0 | #9C27B0 → #E040FB | Inspired and imaginative |
| `focused` | 💡 | #FF9800 | #FF9800 → #FFC107 | Deep in concentration |
| `neutral` | ✨ | #607D8B | #607D8B → #90A4AE | Open to discovery |

---

### Advanced Mood Indicator Widget

Widget animé en haut du VibesFeed avec informations détaillées.

**Apparence:**
```
┌─────────────────────────────────────────────────────────────┐
│ [⚡]  Your vibe        [Active]                     75%     │
│       Energetic                                    [████░]  │
│       Ready to conquer the day                              │
└─────────────────────────────────────────────────────────────┘
```

**Animations:**
- Pulse: scale 1 → 1.02 → 1 (2s loop)
- Glow: opacity 0.2 → 0.6 si confidence > 60%
- Tap to refresh mood analysis

**Strategy badges:** Active, Engaged, Exploring

---

### Glassmorphism (VibesFeed)

**Overlay des vibe cards avec effet blur.**

```javascript
import { BlurView } from 'expo-blur';

<BlurView intensity={20} tint="dark" style={styles.vibeBlurOverlay}>
  <Text style={styles.vibeTitle}>{post.title}</Text>
  // ...
</BlurView>
```

**Styles ajoutés:**
- `textShadowColor: rgba(0,0,0,0.5)`
- `borderWidth: 1` sur avatars
- `backgroundColor: rgba(0,0,0,0.3)` comme fallback

---

### Animated Filter Chips

**Animation bounce au tap sur les chips de filtres.**

```javascript
Animated.sequence([
  Animated.timing(scale, { toValue: 0.9, duration: 80 }),
  Animated.spring(scale, { toValue: 1, friction: 3, tension: 200 }),
]).start();
```

**Ajouts visuels:**
- Haptic feedback Light au tap
- Icône X visible sur chips actifs
- Scale animation instantanée

---

### Files Created

| File | Purpose |
|------|---------|
| `src/components/DoubleTapLike.tsx` | Double-tap gesture with heart burst animation |
| `src/components/SwipeToPeaks.tsx` | Swipe down gesture to open Peaks |
| `src/store/engagementStore.ts` | Basic Zustand store for persistence |
| `src/services/moodDetection.ts` | Advanced multi-signal mood detection engine |
| `src/services/moodRecommendation.ts` | Two-tower recommendation architecture |
| `src/hooks/useMoodAI.ts` | React hook for AI integration |

### Files Modified

| File | Changes |
|------|---------|
| `src/screens/home/FanFeed.tsx` | +DoubleTapLike, +SwipeToPeaks |
| `src/screens/home/VibesFeed.tsx` | +useMoodAI, +Advanced MoodIndicator, +Glassmorphism, +AnimatedChips, +Scroll tracking |
| `docs/FEATURES_SPECS.md` | Section 20 major update with advanced AI system |
| `docs/IMPLEMENTATION_LOG.md` | LOT R with advanced details |

---

## Version 1.4.2 - 21 Janvier 2026

### RecordButton - S Logo with Inflate/Deflate Animation

**Remplacement complet du design du bouton d'enregistrement.**

| Ancien design | Nouveau design |
|---------------|----------------|
| 6 triangles blancs (logo Smuppy) | S logo Smuppy avec gradient |
| Animation shutter (cercle blanc) | Animation inflate/deflate |
| Rotation des triangles | Scale avec spring physics |

**Animation:**
```javascript
// Inflate (on press)
logoScale.value = withSpring(1.25, { damping: 12, stiffness: 180 });

// Deflate (on release)
logoScale.value = withSpring(1, { damping: 15, stiffness: 200 });
```

**S Logo gradient:**
- `#0EBF8A` → `#00B3C7` (diagonal)

**Fichier modifié:** `src/components/peaks/RecordButton.tsx`

---

### Badge Components (nouveau)

**Nouveau fichier:** `src/components/Badge.tsx`

| Badge | Icon | Gradient |
|-------|------|----------|
| VerifiedBadge | Checkmark/Shield | Vert → Cyan |
| PremiumBadge | Star/Circle | Or → Orange |
| CreatorBadge | Play/Hexagon | Smuppy gradient |

**Usage:**
```javascript
import { VerifiedBadge, PremiumBadge } from '../components/Badge';

<View style={styles.nameWithBadges}>
  <Text>{user.displayName}</Text>
  {user.isVerified && <VerifiedBadge size={18} />}
  {user.isPremium && <PremiumBadge size={18} />}
</View>
```

---

### Fan Terminology (Branding Update)

**Remplacement de la terminologie "Follow" par "Fan" dans toute l'app.**

| Écran | Changement |
|-------|------------|
| NotificationsScreen | "Follows" → "New Fans", "Follow" → "Fan", "Following" → "Tracking" |
| ProfileScreen (QR) | "Scan to follow on Smuppy" → "Scan to be my fan!" |
| FansListScreen | "Unfollow" → "Unfan" |
| UserProfileScreen | "Unfollow" → "Unfan" |
| VibesFeed | "Follow" → "Fan" |
| AddPostDetailsScreen | Messages mis à jour |

**Fichiers modifiés:**
- `src/screens/notifications/NotificationsScreen.tsx`
- `src/screens/profile/ProfileScreen.tsx`
- `src/screens/profile/FansListScreen.tsx`
- `src/screens/profile/UserProfileScreen.tsx`
- `src/screens/home/VibesFeed.tsx`
- `src/screens/home/AddPostDetailsScreen.tsx`

---

### Profile Screen Enhancements

**Améliorations visuelles du profil:**

1. **Badges** - Affichés à côté du nom (verified + premium)
2. **Glassmorphism Stats** - Effet blur sur les stats Fans/Posts
3. **isVerified/isPremium** - Champs ajoutés au user state

**Fichier modifié:** `src/screens/profile/ProfileScreen.tsx`

---

## Version 1.4.1 - 21 Janvier 2026

### PeakViewScreen - UX/UI Redesign (Phase 1)

**Refonte complète de l'expérience de visualisation des Peaks basée sur les tendances TikTok/Reels/Stories.**

#### Progress Bar (Top)
| Propriété | Valeur |
|-----------|--------|
| Position | Top, sous safe area |
| Hauteur | 3px |
| Animation | Linéaire, synchronisée avec durée Peak |
| Couleur | `#0EBF8A` sur fond `rgba(255,255,255,0.3)` |

#### Action Buttons (Vertical - Right Side)
Boutons d'action style TikTok alignés verticalement à droite:

| Bouton | Icône | Compteur |
|--------|-------|----------|
| Like | `heart` | Oui |
| Reply | `chatbubble` | Oui |
| Share | `paper-plane` | Oui |
| Save | `bookmark` | Non |

**Style:**
```javascript
actionIconContainer: {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: 'rgba(0,0,0,0.3)',
}
```

#### Double-Tap Like Animation (Enhanced)
| Élément | Animation |
|---------|-----------|
| Cœur principal | Scale 0 → 1.2 → 1, spring avec damping |
| 6 particules | Explosion radiale, fade out |
| Haptic | `ImpactFeedbackStyle.Medium` |

**Particules:**
- 6 mini-cœurs
- Angles: 0°, 60°, 120°, 180°, 240°, 300°
- Distance: 80-120px aléatoire

#### Gestures Swipe
| Geste | Threshold | Action |
|-------|-----------|--------|
| **Swipe UP** | dy < -50 | Réponses / Create reply |
| **Swipe DOWN** | dy > 80 | Fermer (go back) |
| **Swipe LEFT** | dx < -50 | Peak suivant |
| **Swipe RIGHT** | dx > 50 | Peak précédent |

#### Long-Press Menu
Menu contextuel avec options:
- Pas intéressé
- Copier le lien
- Signaler (rouge)
- Annuler

**Apparition:** Après 300ms + haptic feedback

#### Avatar avec Gradient Border
```javascript
<LinearGradient
  colors={['#0EBF8A', '#00B5C1', '#0081BE']}
  style={{ width: 46, height: 46, borderRadius: 23, padding: 2 }}
>
  <Image style={{ width: 42, height: 42, borderRadius: 21 }} />
</LinearGradient>
```

#### User Info (Bottom Left)
- Avatar avec gradient Smuppy
- Nom avec text shadow
- Compteur de vues

**Fichier modifié:**
- `src/screens/peaks/PeakViewScreen.tsx`

**Dépendances ajoutées:**
- `expo-haptics` (retour haptique)
- `expo-linear-gradient` (déjà présent)

---

## Version 1.4.0 - 21 Janvier 2026

### Profile Screen Redesign (LOT N)

**Refonte complète de l'écran profil avec design unique Smuppy.**

#### Avatar avec Peaks Indicator
| État | Apparence |
|------|-----------|
| Sans peaks | Bordure blanche simple (4px) |
| Avec peaks | Bordure gradient (vert → cyan → bleu) style Instagram Stories |

**Implémentation:**
```javascript
// Si l'utilisateur a des peaks
<LinearGradient
  colors={['#0EBF8A', '#00B5C1', '#0081BE']}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}
  style={styles.avatarGradientBorder}
>
  <AvatarImage source={avatar} size={88} />
</LinearGradient>
```

#### Stats Cards (nouveau design)
| Card | Icône Gradient | Description |
|------|----------------|-------------|
| Fans | `#0EBF8A → #11E3A3` | Clickable → FansList |
| Posts | `#00B5C1 → #0081BE` | Nombre de posts |

**Style card avec shadow:**
```javascript
{
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
}
```

#### Pills Style Tabs
| Tab | Contenu | Style grille |
|-----|---------|--------------|
| Posts | Posts utilisateur | 3 colonnes, simple |
| Peaks | Peaks utilisateur | 3 colonnes, avec stats |
| Collections | Posts sauvegardés | 2 colonnes, cards détaillées |

**Style pills:**
```javascript
// Container
{ backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 }

// Tab actif
<LinearGradient colors={['#0EBF8A', '#00B5C1']} style={pillActive}>
  // Shadow: #0EBF8A, opacity 0.25, radius 6
</LinearGradient>
```

#### Grilles de contenu

| Type | Colonnes | Hauteur | Stats visibles |
|------|----------|---------|----------------|
| Posts | 3 | 140px | Coeurs uniquement |
| Peaks | 3 | 180px | Coeurs, vues, réponses, partages |
| Collections | 2 | 120px + info | Titre, auteur, coeurs |

#### Stats Visibility Strategy

| Stat | Sur grille | Détail (proprio) | Détail (visiteur) |
|------|------------|------------------|-------------------|
| **Likes** | ✅ | ✅ | ✅ |
| **Vues** | Posts: ❌ / Peaks: ✅ | ✅ | ✅ |
| **Partages** | Peaks: ✅ | ✅ | ❌ |
| **Saves** | ❌ | ✅ | ❌ |
| **Réponses** | Peaks: ✅ | ✅ | ✅ |

> **Raison:** Likes & Vues = social proof public. Partages & Saves = insights privés créateur.

#### Cover Photo avec Gradient
```javascript
<LinearGradient
  colors={['transparent', 'transparent', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.85)', '#FFFFFF']}
  locations={[0, 0.35, 0.55, 0.75, 1]}
/>
```

#### Bio Section
| Propriété | Valeur |
|-----------|--------|
| Lignes collapsed | 2 |
| Lignes expanded | 6 |
| "Voir plus" condition | `bio.length > 80` OU `> 2 lignes` |
| Liens cliquables | URLs, emails, téléphones |

**Fichiers modifiés:**
- `src/screens/profile/ProfileScreen.tsx`
- `src/components/peaks/RecordButton.tsx`

---

### RecordButton Shutter Animation

**Animation d'obturateur pour le bouton d'enregistrement Peaks.**

| Élément | Description |
|---------|-------------|
| Cercle fond | Gris foncé `#2C2C2E` |
| Cercle progression | Vert `#0EBF8A`, se décharge pendant enregistrement |
| 6 triangles | Logo Smuppy blanc au centre |
| Cercle shutter | Blanc, apparaît quand on appuie |

**Animation:**
```javascript
// Fermeture (quand on appuie)
shutterValue.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });

// Ouverture (quand on relâche)
shutterValue.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });

// Style animé
const centerCircleStyle = useAnimatedStyle(() => ({
  opacity: shutterValue.value,
  transform: [{ scale: interpolate(shutterValue.value, [0, 1], [0.5, 1]) }],
}));
```

---

### VideoRecorderScreen (nouveau)

**Nouvel écran d'enregistrement vidéo avec segments de 15 secondes.**

| Fonctionnalité | Description |
|----------------|-------------|
| Segments | Auto-save tous les 15 secondes |
| Progress bar | Animation linéaire synchronisée |
| Camera flip | Avant/arrière |
| Permissions | Camera + Media Library |

**Fichier:** `src/screens/home/VideoRecorderScreen.tsx`

---

### JavaScript → TypeScript Migration

**Migration majeure de 40+ fichiers JS vers TypeScript.**

| Catégorie | Fichiers migrés |
|-----------|-----------------|
| Components | Avatar, BottomNav, Card, Header, HomeHeader, Input, TabBar, Tag, Toggle |
| Auth components | GoogleLogo, authStyles, index |
| Peaks components | PeakCard, PeakCarousel, PeakProgressRing, RecordButton |
| Navigation | AppNavigator, AuthNavigator, MainNavigator |
| Context | TabBarContext, UserContext |
| Config | supabase.ts (nouveau), theme.ts, api.ts |
| Services | database.ts |

**Avantages:**
- ✅ Type safety pour éviter les bugs runtime
- ✅ Meilleure autocomplétion IDE
- ✅ Documentation inline via types
- ✅ Refactoring plus sûr

---

### Spots Feature + Explorer Map

**Ajout de la fonctionnalité Spots pour l'exploration.**

| Élément | Description |
|---------|-------------|
| XplorerFeed | Carte avec markers |
| Filtres | Maximum 3 filtres actifs |
| Permissions | Location demandée |
| Markers | Spots mock vérifiés |

**Commit:** `3305cb4 feat: add spots feature + migrate JS to TypeScript`

---

### Database Migrations

**Nouvelles tables Supabase pour profiles et core.**

| Migration | Tables |
|-----------|--------|
| `20260121_profiles.sql` | profiles (extended) |
| `20260121_core_tables.sql` | posts, peaks, likes, follows, etc. |

**Fichiers:** `supabase/migrations/`

---

### Fans/Tracking Tabs avec Smart Cooldown

**Système de cooldown intelligent pour les actions sociales.**

| Action | Cooldown |
|--------|----------|
| Follow/Unfollow | Visuel immédiat, sync backend |
| Copy link | Toast confirmation |

**Commit:** `fc1ec4e feat: add Fans/Tracking tabs with smart cooldown system`

---

### Profile Connected to Real Database

**Connexion du profil aux données réelles Supabase.**

| Hook | Description |
|------|-------------|
| `useCurrentProfile()` | Profil utilisateur connecté |
| `useUserPosts(userId)` | Posts de l'utilisateur |
| `useSavedPosts()` | Collections (posts sauvegardés) |

**Commit:** `40c9d75 feat: connect profile to real database data`

---

## Version 1.3.1 - 20 Janvier 2026

### State Management - Unified Onboarding Data Flow

**Synchronisation Zustand avec données onboarding pour les 3 types de compte.**

| Type de compte | Champs spécifiques |
|----------------|-------------------|
| `personal` | interests, dateOfBirth, gender |
| `pro_creator` | expertise, bio, website, socialLinks |
| `pro_local` | businessName, businessCategory, businessAddress, businessPhone |

**Problème résolu:**
- L'interface User de Zustand était trop simple (6 champs)
- UserContext avait tous les champs mais Zustand restait désynchronisé
- Les données onboarding n'étaient pas disponibles via Zustand

**Solution implémentée:**
- Interface User étendue dans `src/stores/index.ts` avec 25+ champs
- Synchronisation automatique dans `VerifyCodeScreen.tsx`
- Les deux stores (UserContext + Zustand) reçoivent les mêmes données

**Fichiers modifiés:**
| Fichier | Changements |
|---------|-------------|
| `src/stores/index.ts` | Interface User étendue avec tous les champs onboarding |
| `src/screens/auth/VerifyCodeScreen.tsx` | Ajout synchronisation Zustand après création profil |

**Interface User complète:**
```typescript
interface User {
  // Basic info
  id, firstName, lastName, fullName, displayName, username, email, avatar, coverImage, bio, location,
  // Personal info
  dateOfBirth, gender, accountType, isVerified, isPremium,
  // Onboarding data
  interests: string[], expertise: string[], website, socialLinks,
  // Business data
  businessName, businessCategory, businessAddress, businessPhone, locationsMode,
  // Stats
  stats: { fans, posts, following }
}
```

**Avantages:**
- ✅ État unifié entre UserContext et Zustand
- ✅ Toutes les données onboarding disponibles partout
- ✅ Support complet des 3 types de compte
- ✅ Zustand prêt pour future migration (performance)

---

## Version 1.3.0 - 20 Janvier 2026

### Design System - Unified Colors & Gradient

**Gradient et couleurs unifiés pour cohérence visuelle.**

| Élément | Ancienne Valeur | Nouvelle Valeur |
|---------|-----------------|-----------------|
| Gradient | `['#00B3C7', '#11E3A3', '#7BEDC6']` horizontal | `['#00B3C7', '#0EBF8A', '#72D1AD']` diagonal |
| Accent Color | `#11E3A3` (vif) | `#0EBF8A` (subtil, meilleure lisibilité) |
| Mint | `#7BEDC6` (flashy) | `#72D1AD` (doux) |
| Direction | Horizontal (x:0→1, y:0) | Diagonal (x:0→1, y:0→1) |

**Fichiers modifiés (38 fichiers):**
- `src/config/theme.ts` - GRADIENTS et COLORS
- Tous les écrans auth et onboarding
- Composants: Button, CooldownModal, Tag, Card
- Screens: Settings, Profile, Home

**Avantages:**
- ✅ Meilleure lisibilité texte blanc sur gradient
- ✅ Couleurs plus subtiles et professionnelles
- ✅ Gradient diagonal pour effet de profondeur
- ✅ Cohérence visuelle dans toute l'app

**Usage React Native:**
```javascript
import { GRADIENTS } from '../config/theme';

<LinearGradient
  colors={GRADIENTS.primary}  // ['#00B3C7', '#0EBF8A', '#72D1AD']
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}        // Diagonal!
  style={styles.button}
/>
```

---

## Version 1.2.1 - 12 Janvier 2026

### Sentry Error Tracking - Production Ready

**DSN configuré et activé en production.**

| Paramètre | Valeur |
|-----------|--------|
| Organisation | smuppy-inc |
| Projet | react-native |
| Dashboard | https://smuppy-inc.sentry.io |
| Status | ✅ Actif |

**Fichiers impliqués:**
| Fichier | Rôle |
|---------|------|
| `.env` | `SENTRY_DSN` ajouté |
| `src/lib/sentry.ts` | Configuration et helpers |
| `src/config/env.ts` | Expose `ENV.SENTRY_DSN` |
| `app.config.js` | Charge DSN via `extra.sentryDsn` |

**Fonctionnalités:**
- 📊 Crash reporting automatique
- 🔍 Stack traces avec source maps
- 👤 Contexte utilisateur (id, username)
- 📈 Performance monitoring (20% sampling)
- 🔔 Alertes configurables sur le dashboard
- ⚡ Désactivé automatiquement en Expo Go

**Usage:**
```javascript
import { captureException, setUserContext } from '../lib/sentry';

// Après login
setUserContext({ id: user.id, username: user.username });

// Capturer erreur
captureException(error, { screen: 'Profile', action: 'load' });
```

---

## Version 1.2.0 - 11 Janvier 2026

### Overview
Ajout des Push Notifications et du système de stockage média S3/CloudFront.

---

## New Features

### Push Notifications (Expo Notifications)

**Dependencies Added:**
```json
{
  "expo-notifications": "latest",
  "expo-device": "latest"
}
```

**Files Created:**
| File | Purpose |
|------|---------|
| `src/services/notifications.ts` | Service: permissions, tokens, listeners, badges |
| `src/hooks/useNotifications.ts` | React hook for components |

**Database Table:**
```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Usage:**
```javascript
import { useNotifications } from '../hooks';
const { registerForPushNotifications, sendLocalNotification } = useNotifications();
await registerForPushNotifications();
```

---

### Media Upload (AWS S3 + CloudFront)

**Dependencies Added:**
```json
{
  "expo-image-manipulator": "latest",
  "expo-file-system": "latest"
}
```

**Files Created:**
| File | Purpose |
|------|---------|
| `src/services/mediaUpload.ts` | S3 upload with presigned URLs |
| `src/hooks/useMediaUpload.ts` | React hook for uploads |
| `src/utils/imageCompression.ts` | Image compression presets |
| `supabase/functions/media-presigned-url/index.ts` | Edge Function |

**Compression Presets:**
| Preset | Dimensions | Quality |
|--------|------------|---------|
| avatar | 400x400 | 80% |
| cover | 1200x600 | 85% |
| post | 1080x1350 | 85% |
| thumbnail | 300x300 | 70% |

**Usage:**
```javascript
import { useMediaUpload } from '../hooks';
const { uploadAvatarImage, progress, isUploading } = useMediaUpload();
const result = await uploadAvatarImage();
// result.cdnUrl = CloudFront URL
```

---

### Supabase Edge Functions

**Deployed Functions:**
| Function | Endpoint |
|----------|----------|
| `media-presigned-url` | `POST /functions/v1/media-presigned-url` |

**Secrets Configured:**
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- S3_BUCKET_NAME
- CLOUDFRONT_URL

---

## Files Modified

| File | Changes |
|------|---------|
| `App.js` | Added notification initialization |
| `src/hooks/index.ts` | Exports useMediaUpload, useNotifications |
| `src/config/env.js` | AWS variables |
| `app.config.js` | AWS env vars, notification config |
| `.env` | AWS credentials |

---

## Infrastructure Changes

### AWS S3
- Bucket: `smuppy-media`
- Region: `us-east-1`
- Folders: avatars, covers, posts, messages, thumbnails

### AWS CloudFront
- Distribution URL: `https://dc8kq67t0asis.cloudfront.net`
- Connected to S3 bucket

### Supabase Edge Functions
- Runtime: Deno
- Deployed: `media-presigned-url`

---

## Version 1.1.0 - Janvier 2026

### Overview
Optimisation complète de l'architecture pour supporter 2+ millions d'utilisateurs.

---

## Dependencies Added

```json
{
  "@tanstack/react-query": "^5.x",
  "zustand": "^5.x",
  "immer": "^10.x",
  "@shopify/flash-list": "^1.7.x",
  "expo-image": "^2.x",
  "@sentry/react-native": "^6.x",
  "@react-native-community/netinfo": "^11.x"
}
```

---

## New Files Created

### Library Configuration
| File | Purpose |
|------|---------|
| `src/lib/queryClient.js` | React Query client with caching, retry, offline support |
| `src/lib/sentry.js` | Sentry initialization and error tracking helpers |

### State Management
| File | Purpose |
|------|---------|
| `src/stores/index.js` | Zustand stores: useUserStore, useAppStore, useFeedStore, useAuthStore |

### Data Fetching
| File | Purpose |
|------|---------|
| `src/hooks/queries/index.js` | 20+ React Query hooks for all data operations |

### Optimized Components
| File | Purpose |
|------|---------|
| `src/components/OptimizedImage.js` | expo-image wrapper with 5 variants |
| `src/components/OptimizedList.js` | FlashList wrapper with 4 variants |

### Documentation
| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | Complete architecture documentation |
| `docs/CHANGELOG_OPTIMIZATION.md` | This changelog |

---

## Files Modified

### Core App
| File | Changes |
|------|---------|
| `App.js` | Added QueryClientProvider, NetworkMonitor, Sentry.wrap(), rate limiter init |
| `app.config.js` | Added sentryDsn to expo.extra |

### Configuration
| File | Changes |
|------|---------|
| `src/config/env.js` | Added SENTRY_DSN, APP_VERSION |
| `.env.example` | Added SENTRY_DSN template |

### Services
| File | Changes |
|------|---------|
| `src/utils/apiClient.js` | SSL pinning, retry with exponential backoff, network check |
| `src/utils/rateLimiter.js` | Persistent storage with AsyncStorage, RATE_LIMITS config |

### Components
| File | Changes |
|------|---------|
| `src/components/ErrorBoundary.js` | Sentry.captureException integration |
| `src/components/index.js` | Added exports for OptimizedImage, OptimizedList |
| `src/hooks/index.js` | Added exports for all React Query hooks |

---

## Screen Migrations (FlatList → FlashList + Image → OptimizedImage)

### Profile Screens
| Screen | FlatList | Image | Status |
|--------|----------|-------|--------|
| ProfileScreen.js | ✅ Posts grid | ✅ Avatar, cover, thumbnails | Complete |
| FansListScreen.js | ✅ Fans list | ✅ All avatars | Complete |
| UserProfileScreen.js | - | ✅ Avatar, cover, thumbnails | Complete |
| PostDetailProfileScreen.js | ✅ Posts, comments | ✅ Media, avatars | Complete |

### Home Screens
| Screen | FlatList | Image | Status |
|--------|----------|-------|--------|
| FanFeed.js | ✅ Feed posts | ✅ All images, avatars | Complete |
| CreatePostScreen.js | ✅ Media grid | ✅ Thumbnails, preview | Complete |
| AddPostDetailsScreen.js | ✅ Media thumbnails | ✅ All images, avatars | Complete |
| PostDetailFanFeedScreen.js | ✅ Posts, comments | ✅ Media, avatars | Complete |
| PostDetailVibesFeedScreen.js | ✅ Comments | ✅ Media, grid, avatars | Complete |

### Messages Screens
| Screen | FlatList | Image | Status |
|--------|----------|-------|--------|
| MessagesScreen.js | ✅ Conversations | ✅ All avatars | Complete |
| ChatScreen.js | ✅ Messages | ✅ Avatars, images, links | Complete |

---

## Performance Improvements

### List Rendering
```
Before: FlatList (creates/destroys views on scroll)
After:  FlashList (recycles views, 10x faster)

Key changes:
- Added estimatedItemSize prop (required)
- Replaced columnWrapperStyle with numColumns
- Added recyclingKey for complex items
```

### Image Loading
```
Before: React Native Image (no caching)
After:  expo-image (memory + disk cache)

Key features:
- Blurhash placeholders (smooth loading)
- Priority levels (high/normal/low)
- Memory-disk caching policy
- Automatic format optimization
```

### API Caching
```
Before: No caching, API calls on every render
After:  React Query with intelligent caching

Configuration:
- staleTime: 5 minutes (data considered fresh)
- gcTime: 30 minutes (garbage collection)
- Automatic background refetch
- Optimistic updates for likes/follows
```

### State Management
```
Before: React Context (re-renders entire tree)
After:  Zustand (selective subscriptions)

Stores:
- useUserStore: Profile, preferences
- useAppStore: Online status, loading, errors
- useFeedStore: Scroll position, active tab
- useAuthStore: Authentication state
```

---

## Security Enhancements

### SSL Pinning
```javascript
// Prevents MITM attacks
const SSL_PINS = {
  'api.smuppy.com': ['sha256/...'],
};
```

### Persistent Rate Limiting
```javascript
// Survives app restarts
const RATE_LIMITS = {
  login: { max: 5, window: 15 * 60 * 1000 },
  signup: { max: 3, window: 60 * 60 * 1000 },
  // ... more limits
};
```

### Error Tracking
```javascript
// Sentry integration
Sentry.init({
  dsn: ENV.SENTRY_DSN,
  tracesSampleRate: 0.2, // 20% of transactions
  enableAutoSessionTracking: true,
});
```

---

## API Changes

### New Hooks Available
```javascript
// User
useCurrentProfile()
useProfile(userId)
useUpdateProfile()

// Posts
useFeedPosts(type)
useUserPosts(userId)
useCreatePost()
useDeletePost()

// Social
useIsFollowing(userId)
useFollowers(userId)
useFollowing(userId)
useToggleFollow()

// Engagement
useHasLiked(postId)
useToggleLike()
usePostComments(postId)
useAddComment()

// Reference
useInterests()
useExpertise()
useSaveInterests()

// Utilities
usePrefetchProfile(userId)
useInvalidateUserQueries()
```

### New Components Available
```javascript
// Images
import OptimizedImage, {
  AvatarImage,
  PostImage,
  BackgroundImage,
  ThumbnailImage
} from '../components/OptimizedImage';

// Lists
import OptimizedList, {
  FeedList,
  UserList,
  CommentList,
  GridList
} from '../components/OptimizedList';
```

---

## Breaking Changes

None. All changes are backward compatible.

---

## Migration Guide

### Using New Image Components
```javascript
// Before
import { Image } from 'react-native';
<Image source={{ uri: url }} style={styles.avatar} />

// After
import { AvatarImage } from '../components/OptimizedImage';
<AvatarImage source={url} size={40} />
```

### Using New List Components
```javascript
// Before
import { FlatList } from 'react-native';
<FlatList
  data={posts}
  renderItem={renderPost}
  keyExtractor={(item) => item.id}
/>

// After
import { FlashList } from '@shopify/flash-list';
<FlashList
  data={posts}
  renderItem={renderPost}
  keyExtractor={(item) => item.id}
  estimatedItemSize={200}  // Required!
/>
```

### Using React Query Hooks
```javascript
// Before
const [posts, setPosts] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchPosts().then(setPosts).finally(() => setLoading(false));
}, []);

// After
const { data: posts, isLoading } = useFeedPosts('fan');
```

---

## Testing

### Build Verification
```bash
npx expo export --platform ios
# Success: Bundled 2233 modules in 7474ms
```

### Recommended Tests
1. Scroll performance in long lists
2. Image loading in slow network
3. Offline mode behavior
4. Rate limiting triggers
5. Error boundary catches

---

## Next Steps

1. TypeScript migration (type safety)
2. Unit tests for hooks
3. E2E tests with Detox
4. Performance monitoring dashboard
5. A/B testing framework

---

*Changelog generated: January 2026*
