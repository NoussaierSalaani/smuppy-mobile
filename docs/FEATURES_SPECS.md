# Smuppy Mobile - Features & UI Specifications

> Dernière mise à jour: 26 janvier 2026
>
> Documentation liee: [SMUPPY_MASTER_DOC.md](SMUPPY_MASTER_DOC.md) | [README.md](../README.md)

## Table des matières

1. [Profile Screen](#1-profile-screen)
2. [Posts](#2-posts)
3. [Peaks (Stories)](#3-peaks-stories)
4. [Collections](#4-collections)
5. [Stats & Analytics](#5-stats--analytics)
6. [Record Button](#6-record-button)
7. [Navigation & Tabs](#7-navigation--tabs)

---

## 1. Profile Screen

### 1.1 Structure générale

```
┌─────────────────────────────────────────┐
│ [Cover Photo with Gradient Fade]        │
│                              [Settings] │
├─────────────────────────────────────────┤
│ [Avatar]              [Stats Cards]     │
│ (with peaks          [Fans] [Posts]     │
│  indicator)                             │
├─────────────────────────────────────────┤
│ Display Name          [QR Code Button]  │
├─────────────────────────────────────────┤
│ Bio (2 lignes max)                      │
│ [Voir plus]                             │
│ 📍 Location                             │
├─────────────────────────────────────────┤
│ [Posts] [Peaks] [Collections]  ← Pills  │
├─────────────────────────────────────────┤
│ [Content Grid]                          │
└─────────────────────────────────────────┘
```

### 1.2 Cover Photo

| Propriété | Valeur |
|-----------|--------|
| Hauteur | 282px |
| Overlay | Gradient transparent → blanc |
| Gradient locations | [0, 0.35, 0.55, 0.75, 1] |
| Gradient colors | transparent → transparent → rgba(255,255,255,0.5) → rgba(255,255,255,0.85) → #FFFFFF |
| Position | Absolute, s'étend derrière avatar et bio |

**Comportement:**
- Tap sur la cover = options pour changer/supprimer (proprio uniquement)
- Pas de ligne de séparation visible entre cover et contenu

### 1.3 Avatar avec Peaks Indicator

| État | Apparence |
|------|-----------|
| **Sans peaks** | Bordure blanche simple (4px) |
| **Avec peaks** | Bordure gradient (vert → cyan → bleu) comme Instagram Stories |

**Dimensions:**
| Propriété | Valeur |
|-----------|--------|
| Taille avatar | 96px (standard réseaux sociaux) |
| Bordure gradient | 3px |
| Bordure interne blanche | 2px |

**Gradient peaks indicator:**
```javascript
colors: ['#0EBF8A', '#00B5C1', '#0081BE']
start: { x: 0, y: 0 }
end: { x: 1, y: 1 }
```

### 1.4 Stats Cards

Design: **Cards avec shadow** (pas badges inline)

| Card | Icône | Gradient |
|------|-------|----------|
| **Fans** | `people` | #0EBF8A → #11E3A3 |
| **Posts** | `albums-outline` | #00B5C1 → #0081BE |

**Style card:**
```javascript
{
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
}
```

### 1.5 Bio Section

| Propriété | Valeur |
|-----------|--------|
| Lignes visibles (collapsed) | 2 |
| Lignes max (expanded) | 6 |
| Condition "Voir plus" | `bio.length > 80` OU `bio.split('\n').length > 2` |

**Liens cliquables dans bio:**
- URLs (https://...)
- Emails (user@domain.com)
- Numéros de téléphone (10+ chiffres)

### 1.6 Typography

| Élément | Font | Size | Color |
|---------|------|------|-------|
| Display Name | WorkSans-Bold | 28px | #0A252F |
| Bio | Regular | 14px | #0A252F |
| Location | Regular | 13px | #8E8E93 |
| "Voir plus" | SemiBold | 13px | #0EBF8A |

---

## 2. Posts

### 2.1 Affichage sur Profile (Grille simple)

**Layout:** Grille 3 colonnes

| Propriété | Valeur |
|-----------|--------|
| Largeur card | (SCREEN_WIDTH - 48) / 3 |
| Hauteur card | 140px |
| Border radius | 12px |
| Gap | 8px |

**Éléments visibles:**
- Thumbnail (image/vidéo)
- Icône play (si vidéo) - en haut à gauche
- Stats overlay en bas (coeurs uniquement)

**Stats overlay:**
```javascript
{
  position: 'absolute',
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
  flexDirection: 'row',
  padding: 6,
}
```

### 2.2 Affichage détaillé (quand on ouvre le post)

**Stats visibles - selon le viewer:**

| Stat | Proprio | Visiteur |
|------|---------|----------|
| **Likes (coeurs)** | ✅ Visible | ✅ Visible |
| **Vues** | ✅ Visible | ✅ Visible |
| **Partages** | ✅ Visible | ❌ Caché |
| **Saves** | ✅ Visible | ❌ Caché |

**Raison:**
- Likes & Vues = social proof public (comme YouTube, TikTok)
- Partages & Saves = insights privés pour le créateur

---

## 3. Peaks (Stories)

### 3.1 Affichage sur Profile (Grille avec stats)

**Layout:** Grille 3 colonnes

| Propriété | Valeur |
|-----------|--------|
| Largeur card | (SCREEN_WIDTH - 48) / 3 |
| Hauteur card | 180px (plus haute que posts) |
| Border radius | 12px |
| Background | #1C1C1E |
| Gap | 8px |

**Éléments visibles:**
- Thumbnail vidéo
- Badge durée (en haut à droite): `15s`, `10s`, etc.
- Stats overlay en bas

### 3.2 Stats Peaks (visibles sur la grille)

| Stat | Icône | Couleur |
|------|-------|---------|
| **Likes** | `heart` | #FF6B6B (rouge) |
| **Vues** | `eye` | #FFFFFF |
| **Réponses** | `chatbubble` | #FFFFFF |
| **Partages** | `share-outline` | #FFFFFF |

**Note:** Pas de commentaires sur les Peaks, seulement des réponses (replies).

### 3.3 Stats overlay style

```javascript
peakStatsOverlay: {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  flexDirection: 'row',
  flexWrap: 'wrap',
  padding: 6,
  backgroundColor: 'rgba(0,0,0,0.5)',
  gap: 6,
}
```

### 3.4 Création de Peak

**Record Button:** Voir section [6. Record Button](#6-record-button)

**Durées:**
| Propriété | Valeur |
|-----------|--------|
| Durée minimum | 3 secondes |
| Durée maximum | 10 secondes |
| Indicateur | Cercle vert qui se décharge |

### 3.5 PeakViewScreen - Expérience Immersive

**Layout (style TikTok/Reels):**
```
┌────────────────────────────────────────────┐
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬ progress bar (top)         │
│                                             │
│ [←] Header              [+] Create    ❤️    │
│                                        💬   │
│         [VIDEO CONTENT]                📤   │
│          (full screen)                 🔖   │
│                                             │
│ [Avatar] @username                          │
│ 👁 12.5K vues                               │
│ [Text Overlay / CTA]                        │
│ 🔗 5 réponses - Swipe ↑                    │
└────────────────────────────────────────────┘
```

#### 3.5.1 Progress Bar (Top)

| Propriété | Valeur |
|-----------|--------|
| Position | Absolue, top: insets.top + 8px |
| Hauteur | 3px |
| Background | rgba(255,255,255,0.3) |
| Fill color | #0EBF8A (primary) |
| Animation | Linéaire, synchronisée avec durée Peak |

#### 3.5.2 Action Buttons (Vertical - Right Side)

| Bouton | Icône | Fonction |
|--------|-------|----------|
| **Like** | `heart` / `heart-outline` | Double-tap ou tap → animation cœur |
| **Reply** | `videocam-outline` | Crée un Peak en réponse (répondre avec une vidéo) |
| **Share** | `paper-plane-outline` | Partage le Peak |
| **Save** | `bookmark` / `bookmark-outline` | Sauvegarde en collection |

**Style bouton:**
```javascript
actionIconContainer: {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: 'rgba(0,0,0,0.3)',
  justifyContent: 'center',
  alignItems: 'center',
}
```

#### 3.5.3 Double-Tap Like Animation

**Animation cœur central:**
1. Apparition: scale 0 → 1.2 (spring, damping 8)
2. Rebond: scale 1.2 → 1 (spring, damping 10)
3. Disparition: opacity 1 → 0 (200ms)

**Animation particules:**
- 6 mini-cœurs autour du cœur principal
- Directions: 0°, 60°, 120°, 180°, 240°, 300°
- Distance: 80-120px
- Fade out pendant le déplacement

**Haptic feedback:** `Haptics.ImpactFeedbackStyle.Medium`

#### 3.5.4 Gestures (Swipe)

| Geste | Action |
|-------|--------|
| **Swipe UP** | Voir les réponses OU créer un reply Peak |
| **Swipe DOWN** | Fermer PeakView (retour) |
| **Swipe LEFT** | Peak suivant |
| **Swipe RIGHT** | Peak précédent |
| **Tap gauche** | Peak précédent (même user) |
| **Tap droite** | Peak suivant (même user) |
| **Double-tap** | Like avec animation |
| **Long-press** | Pause + menu contextuel |

#### 3.5.5 Long-Press Menu

**Apparition:** Après 300ms de long-press + haptic feedback

**Options:**
| Option | Icône | Action |
|--------|-------|--------|
| Pas intéressé | `eye-off-outline` | Cache ce type de contenu |
| Copier le lien | `link-outline` | Copie URL du Peak |
| Signaler | `flag-outline` (rouge) | Report content |
| Annuler | - | Ferme le menu |

**Style modal:**
```javascript
menuContainer: {
  backgroundColor: '#1C1C1E',
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
}
```

#### 3.5.6 User Info (Bottom Left)

**Avatar avec gradient:**
```javascript
<LinearGradient
  colors={['#0EBF8A', '#00B5C1', '#0081BE']}
  style={styles.avatarGradient}  // 46x46, padding 2
>
  <Image style={styles.avatar} />  // 42x42
</LinearGradient>
```

**Éléments:**
- Avatar avec bordure gradient Smuppy
- Nom d'utilisateur (bold, shadow)
- Nombre de vues avec icône œil

---

## 4. Collections

### 4.1 Affichage sur Profile (Cards détaillées)

**Layout:** Grille 2 colonnes (cards plus larges que posts)

| Propriété | Valeur |
|-----------|--------|
| Largeur card | (SCREEN_WIDTH - 48) / 2 |
| Hauteur thumbnail | 120px |
| Border radius | 14px |
| Gap | 12px |

**Style card:**
```javascript
{
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  overflow: 'hidden',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
}
```

### 4.2 Éléments visibles par card

- Thumbnail
- Icône play (si vidéo) - en haut à gauche
- Icône bookmark vert - en haut (à côté du menu)
- Menu (3 dots) - en haut à droite
- **Section info:**
  - Titre du post (2 lignes max)
  - Avatar auteur
  - Nom auteur
  - Icône coeur + nombre de likes

### 4.3 Visibilité Collections

| Viewer | Accès |
|--------|-------|
| Proprio | ✅ Peut voir ses collections |
| Visiteur | ❌ "Private - Only visible to account owner" |

---

## 5. Stats & Analytics

### 5.1 Stratégie de visibilité

#### Posts

| Stat | Sur grille profile | En détail (proprio) | En détail (visiteur) |
|------|-------------------|---------------------|---------------------|
| Likes | ✅ Visible | ✅ Visible | ✅ Visible |
| Vues | ❌ Caché | ✅ Visible | ✅ Visible |
| Partages | ❌ Caché | ✅ Visible | ❌ Caché |
| Saves | ❌ Caché | ✅ Visible | ❌ Caché |

**Note:** Les posts n'ont PAS de commentaires. Seuls les Peaks ont des réponses (replies).

#### Peaks

| Stat | Sur grille profile | En détail (proprio) | En détail (visiteur) |
|------|-------------------|---------------------|---------------------|
| Likes | ✅ Visible | ✅ Visible | ✅ Visible |
| Vues | ✅ Visible | ✅ Visible | ✅ Visible |
| Réponses | ✅ Visible | ✅ Visible | ✅ Visible |
| Partages | ✅ Visible | ✅ Visible | ❌ Caché |

**Note:** Les Peaks n'ont PAS de commentaires, seulement des réponses (replies).

### 5.2 Comparaison avec autres réseaux

| Réseau | Likes | Vues | Partages | Saves |
|--------|-------|------|----------|-------|
| **Instagram** | Public | Public (vidéos) | Proprio | Proprio |
| **TikTok** | Public | Public | Public | Proprio |
| **YouTube** | Public | Public | - | - |
| **Twitter/X** | Public | Public | Public | - |
| **Smuppy** | Public | Public | Proprio | Proprio |

---

## 6. Record Button

### 6.1 Design

**Composant:** `RecordButton.tsx`

| Propriété | Valeur |
|-----------|--------|
| Taille bouton | 100px |
| Stroke width (cercle) | 4px |
| Rayon | 48px |
| Circonférence | 2 * PI * 48 |
| Taille S logo | 60px |

### 6.2 Éléments visuels

1. **Cercle de fond** (gris foncé `#2C2C2E`)
2. **Cercle de progression** (vert `#0EBF8A`) - se décharge pendant l'enregistrement
3. **S logo Smuppy** au centre avec gradient vert → cyan

### 6.3 Animation "Inflate/Deflate"

Quand on appuie sur le bouton:
- Le S logo **gonfle** (scale 1 → 1.25) avec animation spring
- Quand on relâche, le S logo **dégonfle** (scale 1.25 → 1)
- Animation fluide avec spring physics

```javascript
// Animation inflate (quand on appuie)
logoScale.value = withSpring(1.25, {
  damping: 12,
  stiffness: 180,
});

// Animation deflate (quand on relâche)
logoScale.value = withSpring(1, {
  damping: 15,
  stiffness: 200,
});
```

### 6.4 S Logo Gradient

```javascript
<LinearGradient id="sGradient" x1="18" y1="16" x2="55" y2="58">
  <Stop offset="0" stopColor="#0EBF8A" />
  <Stop offset="1" stopColor="#00B3C7" />
</LinearGradient>
```

### 6.5 Cercle de progression

- Animation linéaire synchronisée avec `maxDuration`
- strokeDashoffset: 0 (plein) → CIRCUMFERENCE (vide)
- Rotation -90° pour démarrer en haut

---

## 7. Navigation & Tabs

### 7.1 Pills Style Tabs (Profile)

**Container:**
```javascript
{
  backgroundColor: '#F3F4F6',
  borderRadius: 12,
  padding: 4,
}
```

**Pill inactive:**
```javascript
{
  paddingHorizontal: 20,
  paddingVertical: 10,
  borderRadius: 10,
  backgroundColor: 'transparent',
}
```

**Pill active:**
```javascript
{
  paddingHorizontal: 20,
  paddingVertical: 10,
  borderRadius: 10,
  // Gradient: #0EBF8A → #00B5C1
  shadowColor: '#0EBF8A',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 6,
  elevation: 4,
}
```

### 7.2 Tabs disponibles sur Profile

| Tab | Contenu | Style grille |
|-----|---------|--------------|
| **Posts** | Posts de l'utilisateur | 3 colonnes, simple |
| **Peaks** | Peaks de l'utilisateur | 3 colonnes, avec stats |
| **Collections** | Posts sauvegardés | 2 colonnes, cards détaillées |

---

## 8. Create Peak Screen

### 8.1 Structure

```
┌─────────────────────────────────────────┐
│ [X Close]              [Flip Camera]    │
├─────────────────────────────────────────┤
│                                         │
│                                         │
│            [Camera Preview]             │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ [Duration Selector: 6s | 10s | 15s | 60s] │
├─────────────────────────────────────────┤
│           [RecordButton]                │
│                                         │
│   (Reply info if replying to a peak)    │
└─────────────────────────────────────────┘
```

### 8.2 Duration Options

| Durée | Label | Icône | Description |
|-------|-------|-------|-------------|
| 6s | `6s` | ⚡ | Rapide |
| 10s | `10s` | - | Par défaut |
| 15s | `15s` | - | Standard |
| 60s | `60s` | 🏆 | Long format |

### 8.3 Enregistrement

| Propriété | Valeur |
|-----------|--------|
| Durée minimum | 3 secondes |
| Auto-stop | À la durée sélectionnée |
| Preview | Après enregistrement |
| Retry | Bouton reset disponible |

### 8.4 Navigation

| Action | Destination |
|--------|-------------|
| Enregistrement terminé | PeakPreviewScreen |
| Annuler | Retour écran précédent |
| Reply mode | Affiche info du peak original |

---

## 9. Video Recorder Screen

### 9.1 Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Segments** | Auto-save tous les 15 secondes |
| **Progress bar** | Animation linéaire sur 15s |
| **Camera flip** | Bouton pour changer de caméra |
| **Save to library** | Chaque segment sauvegardé automatiquement |

### 9.2 Interface

```
┌─────────────────────────────────────────┐
│ [X]    [15s segments badge]    [Flip]   │
├─────────────────────────────────────────┤
│ [Progress bar ████████░░░░░░░░░] 8s/15s │
├─────────────────────────────────────────┤
│           [REC] Recording...            │
├─────────────────────────────────────────┤
│                                         │
│            [Camera Preview]             │
│                                         │
├─────────────────────────────────────────┤
│     "Hold to record. Auto-save 15s"     │
├─────────────────────────────────────────┤
│           [Record Button]               │
│         [Done] (if segments saved)      │
└─────────────────────────────────────────┘
```

### 9.3 Permissions requises

| Permission | Usage |
|------------|-------|
| Camera | Enregistrement vidéo |
| Media Library | Sauvegarde des segments |

### 9.4 États

| État | Affichage |
|------|-----------|
| **Idle** | Bouton blanc avec cercle rouge intérieur |
| **Recording** | Bordure rouge, carré rouge intérieur, badge "REC" |
| **Segments saved** | Badge "X saved", bouton "Done" visible |

---

## 10. Settings Screens

### 10.1 SettingsScreen

| Section | Options |
|---------|---------|
| **Account** | Edit Profile, Edit Interests, Password Manager |
| **Preferences** | Notification Settings, Facial Recognition |
| **Support** | Report Problem, Terms & Policies |
| **Danger Zone** | Delete Account (RGPD 30 jours) |
| **Session** | Logout |

### 10.2 EditProfilScreen

| Champ | Type | Validation |
|-------|------|------------|
| Full Name | TextInput | Required |
| Username | TextInput | Unique, lowercase |
| Bio | TextArea | Max 150 chars |
| Location | TextInput | Optional |
| Website | TextInput | URL format |

### 10.3 EditInterestsScreen

| Type compte | Champs |
|-------------|--------|
| Personal | Interests (multi-select) |
| Pro Creator | Expertise (multi-select) |
| Pro Local | Business Category |

---

## Annexes

### A. Couleurs principales

| Nom | Hex | Usage |
|-----|-----|-------|
| Primary Green | `#0EBF8A` | Actions, liens, accents |
| Cyan | `#00B5C1` | Gradient secondaire |
| Blue | `#0081BE` | Gradient tertiaire |
| Dark | `#0A252F` | Texte principal |
| Gray | `#8E8E93` | Texte secondaire |
| Light Gray | `#F3F4F6` | Backgrounds |
| Red | `#FF6B6B` | Likes, danger |

### B. Gradients

| Nom | Colors | Usage |
|-----|--------|-------|
| Primary | `['#0EBF8A', '#00B5C1']` | Boutons, tabs actifs |
| Peaks Indicator | `['#0EBF8A', '#00B5C1', '#0081BE']` | Bordure avatar |
| Fans Card | `['#0EBF8A', '#11E3A3']` | Icône fans |
| Posts Card | `['#00B5C1', '#0081BE']` | Icône posts |

### C. Fonts

| Font | Weight | Usage |
|------|--------|-------|
| WorkSans-Bold | 700 | Titres, noms |
| WorkSans-SemiBold | 600 | Sous-titres |
| Poppins-Medium | 500 | Boutons |
| Poppins-Regular | 400 | Body text |

---

## 11. Badges (Verification & Premium)

### 11.1 Composants disponibles

**Fichier:** `src/components/Badge.tsx`

| Badge | Description | Couleur |
|-------|-------------|---------|
| **VerifiedBadge** | Compte vérifié (checkmark) | Gradient vert → cyan |
| **PremiumBadge** | Compte premium (étoile) | Gradient or → orange |
| **CreatorBadge** | Créateur de contenu (play) | Gradient Smuppy |

### 11.2 VerifiedBadge

Affiche un bouclier avec checkmark (style Instagram/Twitter).

```javascript
<VerifiedBadge size={18} style={{ marginLeft: 6 }} />
```

**SVG:**
- Background: Bouclier avec gradient `#0EBF8A → #00B3C7`
- Icon: Checkmark blanc

### 11.3 PremiumBadge

Affiche un cercle avec étoile dorée.

```javascript
<PremiumBadge size={18} style={{ marginLeft: 6 }} />
```

**SVG:**
- Background: Cercle avec gradient `#FFD700 → #FFA500 → #FF8C00`
- Icon: Étoile blanche

### 11.4 Utilisation sur Profile

Les badges s'affichent à côté du nom d'utilisateur:

```javascript
<View style={styles.nameWithBadges}>
  <Text style={styles.displayName}>{user.displayName}</Text>
  {user.isVerified && <VerifiedBadge size={18} style={styles.badge} />}
  {user.isPremium && <PremiumBadge size={18} style={styles.badge} />}
</View>
```

---

## 12. Terminologie Fan (Branding)

### 12.1 Remplacement "Follow" → "Fan"

Smuppy utilise une terminologie unique pour se démarquer:

| Ancienne terme | Nouveau terme | Usage |
|----------------|---------------|-------|
| Follow | **Fan** | Devenir fan de quelqu'un |
| Unfollow | **Unfan** | Ne plus être fan |
| Following | **Tracking** | Liste des personnes qu'on suit |
| Followers | **Fans** | Liste des personnes qui nous suivent |
| "started following you" | **"became your fan"** | Notification |

### 12.2 Textes UI mis à jour

| Écran | Ancien texte | Nouveau texte |
|-------|--------------|---------------|
| ProfileScreen (QR) | "Scan to follow on Smuppy" | **"Scan to be my fan!"** |
| NotificationsScreen | "Follows" tab | **"New Fans"** |
| NotificationsScreen | "Follow" button | **"Fan"** |
| NotificationsScreen | "Following" button | **"Tracking"** |
| FansListScreen | "Unfollow" | **"Unfan"** |
| FansListScreen | "wait 7 days before following again" | **"wait 7 days before becoming a fan again"** |
| AddPostDetailsScreen | "You're not following anyone yet" | **"You're not a fan of anyone yet"** |
| VibesFeed | "Follow" | **"Fan"** |

### 12.3 Notes d'implémentation

- Les noms de variables/fonctions internes restent en anglais technique (`followUser`, `unfollowUser`, etc.)
- Seuls les textes visibles par l'utilisateur sont modifiés
- La table `follows` en base de données garde son nom

---

## 13. Stats Cards Glassmorphism (Profile)

### 13.1 Design

Les stats (Fans/Posts) utilisent un effet glassmorphism sur la cover photo.

**Composants:**
- `expo-blur` BlurView
- Border semi-transparente

### 13.2 Style

```javascript
statsGlass: {
  borderRadius: 20,
  overflow: 'hidden',
},
statsBlurContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 6,
  paddingHorizontal: 14,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.7)',
  backgroundColor: 'rgba(255,255,255,0.4)',
},
statGlassValue: {
  fontSize: 15,
  fontWeight: '700',
  color: '#0A252F',
},
statGlassLabel: {
  fontSize: 10,
  fontWeight: '500',
  color: '#555',
},
```

---

## 14. VibesFeed Discovery Algorithm

### 14.1 Concept

Le VibesFeed (onglet "For You") utilise un algorithme de découverte qui priorise le contenu en fonction des intérêts de l'utilisateur tout en garantissant que le feed n'est jamais vide.

### 14.2 Filtres d'intérêts

**Chips scrollables horizontalement:**
- Les chips sont dynamiquement générés depuis les intérêts du profil utilisateur
- Chaque chip a une icône Ionicons correspondante
- Multiple sélection possible
- État actif = background primaire + texte blanc

**Mapping intérêts → icônes:**
```javascript
const INTEREST_ICONS = {
  'Fitness': 'fitness',
  'Yoga': 'body',
  'Running': 'walk',
  'Nutrition': 'nutrition',
  'Camping': 'bonfire',
  'Swimming': 'water',
  'Cycling': 'bicycle',
  'Hiking': 'trail-sign',
  'Gym': 'barbell',
  'Meditation': 'leaf',
  'Dance': 'musical-notes',
  'Climbing': 'trending-up',
  'Tennis': 'tennisball',
  'Basketball': 'basketball',
  'Football': 'football',
  'Golf': 'golf',
};
```

### 14.3 Algorithme de Discovery

**Cas 1: Filtres actifs (chips sélectionnés)**
1. Récupérer posts avec tags correspondant aux intérêts sélectionnés
2. Ordonner par `likes_count` puis `created_at` (popularité puis récence)
3. Si moins de 50% du limit demandé → compléter avec posts populaires
4. Le feed n'est JAMAIS vide grâce au fallback

**Cas 2: Aucun filtre actif (page initiale)**
1. 60% posts des intérêts du profil utilisateur
2. 40% posts populaires généraux (hors doublons)
3. Mélange automatique pour variété

**Cas 3: Pagination (pages suivantes)**
- Posts publics ordonnés par popularité puis récence
- Exclut les posts de l'utilisateur courant

### 14.4 Logique de priorité

```
┌─────────────────────────────────────────────────────────────┐
│ VIBESFEED PRIORITY LOGIC                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Filtres actifs?]                                          │
│         │                                                   │
│    ┌────┴────┐                                              │
│    │ OUI     │ NON                                          │
│    ▼         ▼                                              │
│  Posts      [Page 0?]                                       │
│  filtres        │                                           │
│     │      ┌────┴────┐                                      │
│     │      │ OUI     │ NON                                  │
│     │      ▼         ▼                                      │
│     │   60% intérêts  Posts                                 │
│     │   40% populaire  populaires                           │
│     │                                                       │
│     ▼                                                       │
│  [< 50% limit?]                                             │
│         │                                                   │
│    ┌────┴────┐                                              │
│    │ OUI     │ NON                                          │
│    ▼         ▼                                              │
│  + Posts    Retourner                                       │
│  populaires  directement                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 14.5 Score d'affichage (Future)

**Variables prévues pour le scoring:**
| Variable | Poids (à définir) | Description |
|----------|-------------------|-------------|
| `likes_count` | Élevé | Popularité du post |
| `recency` | Moyen | Fraîcheur (1-7 jours = boost) |
| `interest_match` | Élevé | Correspondance avec intérêts user |
| `creator_verified` | Faible | Créateur vérifié = petit boost |
| `engagement_rate` | Moyen | likes/vues ou comments/vues |
| `diversity` | Variable | Éviter trop du même créateur |

**Note:** Les scores exacts seront définis après collecte de données utilisateur.

### 14.6 API Database

**Fonction: `getDiscoveryFeed`**
```typescript
getDiscoveryFeed(
  selectedInterests: string[], // Filtres actifs des chips
  userInterests: string[],     // Intérêts du profil
  page: number,                // Pagination
  limit: number                // Nombre de posts
): Promise<DbResponse<Post[]>>
```

---

## 15. SmuppyHeartIcon

### 15.1 Design

Icône personnalisée représentant un coeur avec un tracé ECG intégré. Le tracé fait partie de la forme du coeur, créant un design unique fitness-themed.

### 15.2 Variantes

| Variante | Description |
|----------|-------------|
| `outline` | Coeur outline avec ECG |
| `filled` | Coeur plein avec ECG en blanc |

### 15.3 Props

```typescript
interface SmuppyHeartIconProps {
  size?: number;     // default: 24
  color?: string;    // default: '#1A2B3D'
  filled?: boolean;  // default: false
  style?: ViewStyle;
}
```

### 15.4 Utilisation

```jsx
import SmuppyHeartIcon from '@/components/icons/SmuppyHeartIcon';

// Outline
<SmuppyHeartIcon size={24} color="#FF6B6B" />

// Filled (pour état "liké")
<SmuppyHeartIcon size={24} color="#FF6B6B" filled />
```

---

## 16. Share Functionality

### 16.1 Utilitaire de partage

**Fichier:** `src/utils/share.ts`

L'utilitaire centralisé gère le partage de contenu pour toute l'application.

### 16.2 URL Formats

| Type | Format |
|------|--------|
| **Post** | `https://smuppy.app/p/{postId}` |
| **Peak** | `https://smuppy.app/peak/{peakId}` |
| **Profile** | `https://smuppy.app/u/{username}` |

### 16.3 Fonctions disponibles

#### Partage natif
```typescript
// Partager un post
await sharePost(postId: string, caption?: string, authorName?: string)

// Partager un peak
await sharePeak(peakId: string, authorName?: string, authorUsername?: string)

// Partager un profil
await shareProfile(userId: string, fullName?: string, username?: string)
```

#### Copie de lien
```typescript
// Copier le lien d'un post
await copyPostLink(postId: string)

// Copier le lien d'un peak
await copyPeakLink(peakId: string)

// Copier le lien d'un profil
await copyProfileLink(userId: string, username?: string)
```

### 16.4 Messages de partage

**Post avec caption:**
```
{caption truncated to 100 chars}...

Check it out on Smuppy: https://smuppy.app/p/{id}
```

**Post sans caption:**
```
Check out this post on Smuppy!

https://smuppy.app/p/{id}
```

**Peak:**
```
Watch {authorName}'s Peak on Smuppy!

https://smuppy.app/peak/{id}
```

**Profile:**
```
Check out {fullName} on Smuppy!

https://smuppy.app/u/{username}
```

### 16.5 Comportement

| Action | iOS | Android |
|--------|-----|---------|
| Partage | `Share.share({ message, url })` | `Share.share({ message })` (URL dans message) |
| Copie | `Clipboard.setStringAsync(link)` | `Clipboard.setStringAsync(link)` |
| Feedback | Haptic success | Haptic success |

---

## 17. Tag Friends Modal

### 17.1 Structure

**Fichier:** `src/components/TagFriendModal.tsx`

Modal bottom sheet pour taguer des amis dans les Peaks.

### 17.2 Interface

```
┌─────────────────────────────────────────┐
│ ▬▬▬ (handle)                            │
├─────────────────────────────────────────┤
│ [X]      Tag a Friend                   │
│          Challenge them to respond!      │
├─────────────────────────────────────────┤
│ 🔒 Only you, them & mutual friends...   │
├─────────────────────────────────────────┤
│ 🔍 Search friends...                    │
├─────────────────────────────────────────┤
│ [Avatar] Name              [○]          │
│          @username                       │
│ [Avatar] Name (mutual)     [●]          │
│          @username                       │
│ ...                                     │
├─────────────────────────────────────────┤
│ [████ Tag {FirstName} ████]             │
└─────────────────────────────────────────┘
```

### 17.3 Props

```typescript
interface TagFriendModalProps {
  visible: boolean;
  onClose: () => void;
  onTagFriend: (friend: Friend) => void;
  peakId: string;
  existingTags?: string[]; // IDs des amis déjà taggés
}
```

### 17.4 Chargement des amis

**Source des données:**
- `getFollowing()` - Liste des personnes que l'utilisateur suit
- `getFollowers()` - Pour détecter les mutuals

**Logique mutual:**
```typescript
const followerIds = new Set(followers.map(p => p.id));
const isMutual = followerIds.has(followingProfile.id);
```

### 17.5 Tri et filtrage

**Ordre d'affichage:**
1. Mutuals en premier (badge 👥)
2. Puis ordre alphabétique par nom

**Recherche:**
- Filtre par nom OU username
- Case insensitive

### 17.6 États visuels

| État | Apparence |
|------|-----------|
| **Normal** | Cercle vide à droite |
| **Sélectionné** | Cercle gradient avec checkmark |
| **Déjà taggé** | Badge "Tagged" vert, désactivé (opacity 0.5) |

### 17.7 Privacy Note

Message affiché en haut du modal:
> 🔒 Only you, them & mutual friends will see the tag

**Style:**
```javascript
{
  backgroundColor: 'rgba(14, 191, 138, 0.1)',
  borderRadius: 10,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
}
```

---

## 18. Fans List Screen

### 18.1 Structure

**Fichier:** `src/screens/profile/FansListScreen.tsx`

Écran pour afficher les Fans (followers) et Tracking (following) d'un utilisateur.

### 18.2 Tabs

| Tab | Contenu | Label |
|-----|---------|-------|
| **fans** | Personnes qui suivent l'utilisateur | "Fans" |
| **tracking** | Personnes que l'utilisateur suit | "Tracking" |

### 18.3 API Integration

```typescript
// Charger les fans
const { data } = await getFollowers(userId, offset, limit);

// Charger le tracking
const { data } = await getFollowing(userId, offset, limit);

// Follow/Unfollow
await followUser(targetUserId);
await unfollowUser(targetUserId);

// Vérifier si on suit quelqu'un
const following = await isFollowing(targetUserId);
```

### 18.4 États des boutons

| État | Bouton | Action |
|------|--------|--------|
| **Non suivi** | "Fan" (gradient) | `followUser()` |
| **Suivi** | "Unfan" (outline) | `unfollowUser()` |
| **Cooldown** | "7 days" (désactivé) | Aucune |

### 18.5 Cooldown System

Après unfollow, l'utilisateur doit attendre 7 jours avant de pouvoir re-follow.

**Message d'erreur:**
> You must wait 7 days before becoming a fan again

---

## 19. Smuppy Unique Gestures

### 19.1 Double-Tap to Like (Smuppy Style)

**Fichier:** `src/components/DoubleTapLike.tsx`

Geste unique Smuppy avec animation de burst de cœurs.

#### Animation Heart Burst

| Élément | Description |
|---------|-------------|
| **Cœur principal** | Scale 0 → 1.2 → 1 → 1.5 (disparition) |
| **6 mini-cœurs** | Explosion en cercle (0°, 60°, 120°, 180°, 240°, 300°) |
| **Couleurs** | Alternance COLORS.primary et #FF8FAB |
| **Distance** | 60-90px du centre |
| **Haptic** | `Haptics.NotificationFeedbackType.Success` |

#### Props

```typescript
interface DoubleTapLikeProps {
  children: React.ReactNode;
  onDoubleTap: () => void;      // Action quand double-tap
  onSingleTap?: () => void;     // Action quand simple tap
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  showAnimation?: boolean;       // Afficher l'animation cœur
}
```

#### Usage

```jsx
<DoubleTapLike
  onDoubleTap={() => toggleLike(post.id)}
  onSingleTap={() => openPost(post.id)}
  showAnimation={!post.isLiked}
>
  <PostMedia post={post} />
</DoubleTapLike>
```

#### Écrans utilisant DoubleTapLike

| Écran | Usage |
|-------|-------|
| FanFeed | Sur les images de posts |
| VibesFeed | Sur les vibe cards |
| PeakViewScreen | Sur la vidéo |

---

### 19.2 Swipe Down → Peaks (FanFeed uniquement)

**Fichier:** `src/components/SwipeToPeaks.tsx`

Geste unique permettant d'accéder aux Peaks en swipant vers le bas depuis FanFeed.

#### Comportement

| Geste | Seuil | Action |
|-------|-------|--------|
| Swipe bas | 100px | Ouvre l'écran Peaks |
| Drag max | 150px | Limite du déplacement |

#### Indicateur visuel

- Apparaît pendant le drag
- Change de couleur quand le seuil est atteint
- Barre de progression animée
- Texte: "Swipe for Peaks" → "Release for Peaks!"

#### Props

```typescript
interface SwipeToPeaksProps {
  children: React.ReactNode;
  onOpenPeaks: () => void;
  enabled?: boolean;
}
```

#### Style indicateur

```javascript
indicator: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 25,
  gap: 8,
  // Gradient: primary quand non-atteint, vert quand atteint
}
```

**Note:** Ce geste n'est PAS sur VibesFeed car les Peaks sont déjà affichés en haut de cet écran.

---

## 20. AI Mood-Based Recommendations (Advanced System)

### 20.1 Architecture Overview

Le système AI de Smuppy utilise une **architecture multi-composants** pour la détection d'humeur et les recommandations personnalisées.

**Fichiers du système:**
| Fichier | Rôle |
|---------|------|
| `src/services/moodDetection.ts` | Moteur de détection d'humeur multi-signal |
| `src/services/moodRecommendation.ts` | Moteur de recommandation two-tower |
| `src/hooks/useMoodAI.ts` | Hook React pour intégration dans les composants |
| `src/store/engagementStore.ts` | Store Zustand pour persistence |

---

### 20.2 Multi-Signal Mood Detection

**Fichier:** `src/services/moodDetection.ts`

Le système fusionne **4 types de signaux** pour détecter l'humeur avec précision.

#### Signal Types & Weights

| Signal | Poids | Description |
|--------|-------|-------------|
| **Behavioral** | 0.25 | Patterns de scroll, vitesse, pauses |
| **Engagement** | 0.30 | Likes, comments, shares, time on post |
| **Temporal** | 0.20 | Heure du jour, jour de semaine |
| **Content** | 0.25 | Catégories préférées, types de média |

#### Scroll Velocity Tracking

Le système analyse la vitesse de défilement pour détecter l'état d'esprit:

```typescript
interface ScrollTracking {
  positions: number[];          // Dernières 50 positions
  timestamps: number[];         // Timestamps correspondants
  averageVelocity: number;      // Vitesse moyenne
  scrollDirection: 'up' | 'down' | 'idle';
  pauseCount: number;           // Nombre de pauses
  rapidScrollCount: number;     // Nombre de scrolls rapides
}
```

| Comportement | Indicateur |
|--------------|------------|
| Scroll rapide | Bored, searching |
| Scroll lent avec pauses | Engaged, relaxed |
| Beaucoup de retours | Interested in specific content |
| Scroll régulier | Focused exploration |

#### 6 Moods Détectables

| Mood | Emoji | Couleur | Gradient | Description |
|------|-------|---------|----------|-------------|
| `energetic` | ⚡ | #FF6B6B | #FF6B6B → #FF8E53 | Ready to conquer the day |
| `relaxed` | 🌿 | #4CAF50 | #4CAF50 → #8BC34A | Taking it easy |
| `social` | 👋 | #2196F3 | #2196F3 → #03A9F4 | Feeling connected |
| `creative` | 🎨 | #9C27B0 | #9C27B0 → #E040FB | Inspired and imaginative |
| `focused` | 💡 | #FF9800 | #FF9800 → #FFC107 | Deep in concentration |
| `neutral` | ✨ | #607D8B | #607D8B → #90A4AE | Open to discovery |

#### Mood Analysis Result

```typescript
interface MoodAnalysisResult {
  primaryMood: MoodType;
  probabilities: {
    energetic: number;
    relaxed: number;
    social: number;
    creative: number;
    focused: number;
    neutral: number;
  };
  confidence: number;         // 0-1
  signals: {
    behavioral: number;
    engagement: number;
    temporal: number;
    content: number;
  };
  timestamp: number;
}
```

---

### 20.3 Two-Tower Recommendation Engine

**Fichier:** `src/services/moodRecommendation.ts`

Architecture inspirée des systèmes de recommandation modernes avec **User Tower** et **Content Tower**.

#### Mood → Content Mapping

| Mood | Catégories Recommandées | Types de Media |
|------|-------------------------|----------------|
| Energetic | Fitness, Workout, Running, Sports, Challenges, Dance, Motivation | video, carousel |
| Relaxed | Nature, Meditation, Yoga, ASMR, Wellness, Travel, Photography | image, video |
| Social | Trending, Viral, Community, Collabs, Challenges, Comedy, Lifestyle | video, carousel |
| Creative | Art, Design, Photography, Music, DIY, Crafts, Fashion | image, carousel |
| Focused | Education, Tutorial, HowTo, Productivity, Tips, Tech, Science | video, carousel |
| Neutral | Any category (exploration mode) | all types |

#### Emotional Uplift Strategy

Quand l'humeur est détectée comme basse, le système applique un **boost** aux contenus positifs:

```typescript
const UPLIFT_CONTENT = {
  lowEnergy: {
    boost: 1.5,
    categories: ['Motivation', 'Fitness', 'Challenges', 'Comedy', 'Uplifting'],
  },
  stressed: {
    boost: 1.4,
    categories: ['Nature', 'ASMR', 'Meditation', 'Cute', 'Animals', 'Relaxation'],
  },
  lonely: {
    boost: 1.6,
    categories: ['Community', 'Social', 'Collabs', 'Challenges', 'Friends'],
  },
  bored: {
    boost: 1.3,
    categories: ['Trending', 'Viral', 'New', 'Surprising', 'Creative'],
  },
};
```

#### Recommendation Configuration

```typescript
interface RecommendationConfig {
  moodWeight: number;           // 0.4 - How much mood affects selection
  diversityWeight: number;      // 0.25 - How much diversity matters
  freshnessWeight: number;      // 0.2 - How much recency matters
  explorationRate: number;      // 0.15 - % of unexpected content
  maxSameCreator: number;       // 3 - Max posts from same creator
  maxSameCategory: number;      // 5 - Max posts from same category
  minEngagementScore: number;   // 0.1 - Minimum quality threshold
  enableUplift: boolean;        // true - Enable emotional uplift
  upliftThreshold: number;      // 0.4 - Mood confidence below this triggers uplift
}
```

#### Strategy Selection

| Condition | Strategy | Description |
|-----------|----------|-------------|
| confidence < 0.3 | `default` | Standard recommendations |
| needs uplift | `uplift` | Boost positive content |
| neutral > 0.4 | `exploration` | Diverse discovery mode |
| otherwise | `mood_based` | Match content to mood |

---

### 20.4 useMoodAI Hook

**Fichier:** `src/hooks/useMoodAI.ts`

Hook React pour intégrer le système AI dans les composants.

#### API

```typescript
const {
  // Current mood state
  mood,                    // MoodAnalysisResult | null
  isAnalyzing,             // boolean

  // Scroll tracking (automatic)
  handleScroll,            // (event) => void

  // Engagement tracking
  trackPostView,           // (postId, category, creatorId, contentType) => void
  trackPostExit,           // (postId, timeSpentSeconds) => void
  trackLike,               // (postId, category) => void
  trackComment,            // (postId, category) => void
  trackShare,              // (postId, category) => void
  trackSave,               // (postId, category) => void

  // Recommendations
  getRecommendations,      // (posts, userProfile, limit) => Promise<RecommendationResult>
  quickRerank,             // (posts) => Post[]

  // Manual controls
  refreshMood,             // () => void
  startSession,            // () => void
  endSession,              // () => void
} = useMoodAI(options);
```

#### Options

```typescript
interface UseMoodAIOptions {
  enableScrollTracking?: boolean;    // default: true
  moodUpdateInterval?: number;       // default: 30000 (30s)
  onMoodChange?: (mood: MoodAnalysisResult) => void;
}
```

#### Usage in VibesFeed

```typescript
const {
  mood,
  handleScroll: handleMoodScroll,
  trackPostView,
  trackPostExit,
  trackLike,
  refreshMood,
} = useMoodAI({
  enableScrollTracking: true,
  moodUpdateInterval: 30000,
  onMoodChange: (newMood) => {
    console.log('Mood changed to:', newMood.primaryMood);
  },
});

// Combine with tab bar scroll handler
<ScrollView
  onScroll={(event) => {
    handleTabBarScroll(event);
    handleMoodScroll(event);
  }}
/>
```

---

### 20.5 Advanced Mood Indicator (VibesFeed)

Widget animé avec informations détaillées sur l'humeur.

#### Apparence

```
┌─────────────────────────────────────────────────────────────┐
│ [⚡]  Your vibe        [Active]                     75%     │
│       Energetic                                    [████░]  │
│       Ready to conquer the day                              │
└─────────────────────────────────────────────────────────────┘
```

#### Éléments

| Élément | Description |
|---------|-------------|
| Emoji avec glow | Représente le mood actuel, glow animé si confidence > 0.6 |
| Label | "Your vibe" |
| Strategy Badge | "Active", "Engaged", ou "Exploring" |
| Mood Value | Nom du mood en couleur |
| Description | Texte explicatif du mood |
| Confidence % | Niveau de confiance en chiffres |
| Confidence Bar | Barre visuelle colorée |

#### Animations

- **Pulse:** Scale 1 → 1.02 → 1 (2s loop)
- **Glow:** Opacity 0.2 → 0.6 → 0.2 (1.5s loop, si confidence > 0.6)
- **Tap to refresh:** Permet de forcer une nouvelle analyse

---

### 20.6 Mission Smuppy: Apporter de la joie

Le système AI est conçu avec la mission de Smuppy au cœur:

#### Principes

1. **Détection intelligente** - Multi-signal fusion pour comprendre l'état émotionnel
2. **Adaptation proactive** - Contenu ajusté automatiquement selon l'humeur
3. **Uplift émotionnel** - Boost des contenus positifs quand l'humeur est basse
4. **Respect des préférences** - Catégories favorites toujours prioritaires
5. **Exploration encouragée** - 15% de contenu inattendu pour la découverte
6. **Diversité garantie** - Limites sur créateurs/catégories identiques

#### Métriques de Session

```typescript
interface MoodMetrics {
  sessionJoyScore: number;      // -1 to 1: mood improvement during session
  engagementQuality: number;    // 0 to 1: quality of engagement
  discoveryRate: number;        // 0 to 1: % new content explored
}
```

#### Content Types par Mood

| Mood | Content Primaire | Content Secondaire |
|------|------------------|-------------------|
| Energetic | Motivational, Fitness | Educational |
| Relaxed | Calming, Nature | Entertaining |
| Social | Trending, Community | Comedy |
| Creative | Art, Design | Music, DIY |
| Focused | Educational, Tutorial | Tips, Tech |

---

## 21. Glassmorphism Design (VibesFeed)

### 21.1 Vibe Card Overlay

Les vibe cards utilisent un effet glassmorphism sur l'overlay d'informations.

#### Implémentation

```javascript
import { BlurView } from 'expo-blur';

<View style={styles.vibeOverlayContainer}>
  <BlurView intensity={20} tint="dark" style={styles.vibeBlurOverlay}>
    <Text style={styles.vibeTitle}>{post.title}</Text>
    <View style={styles.vibeMeta}>
      <Image source={{ uri: post.user.avatar }} style={styles.vibeAvatar} />
      <Text style={styles.vibeUserName}>{post.user.name}</Text>
      <SmuppyHeartIcon filled={post.isLiked} />
      <Text>{formatNumber(post.likes)}</Text>
    </View>
  </BlurView>
</View>
```

#### Style

```javascript
vibeOverlayContainer: {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  borderBottomLeftRadius: SIZES.radiusMd,
  borderBottomRightRadius: SIZES.radiusMd,
  overflow: 'hidden',
},
vibeBlurOverlay: {
  padding: SPACING.sm,
  paddingTop: SPACING.md,
  backgroundColor: 'rgba(0,0,0,0.3)',
},
vibeTitle: {
  textShadowColor: 'rgba(0,0,0,0.5)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
},
```

### 21.2 Animated Filter Chips

Les chips de filtres ont une animation bounce au tap.

#### Animation

```javascript
const toggleInterest = useCallback((interestName: string) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  Animated.sequence([
    Animated.timing(scale, { toValue: 0.9, duration: 80 }),
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 200 }),
  ]).start();

  // Toggle logic...
}, []);
```

#### Feedback visuel

| État | Apparence |
|------|-----------|
| Inactif | Border primary, fond blanc |
| Actif | Fond primary, icône X visible |
| Tap | Scale 0.9 → 1 avec spring |

---

## 22. Account Types & Permissions

### 22.1 Types de compte

Smuppy supporte 3 types de comptes avec des permissions différentes:

| Type | Description | Usage |
|------|-------------|-------|
| `personal` | Compte utilisateur standard | Consommation de contenu, interaction sociale |
| `pro_creator` | Créateur de contenu professionnel | Streaming live, sessions privées, subscriptions |
| `pro_local` | Business/commerce local | Profil business, location-based features |

### 22.2 Matrice des permissions

| Feature | personal | pro_creator | pro_local |
|---------|:--------:|:-----------:|:---------:|
| **Contenu** | | | |
| Créer des posts | ✅ | ✅ | ✅ |
| Créer des Peaks | ✅ | ✅ | ✅ |
| Upload photos/vidéos | ✅ | ✅ | ✅ |
| **Live Streaming** | | | |
| Lancer un live | ❌ | ✅ | ❌ |
| Regarder un live (viewer) | ✅ | ✅ | ✅ |
| Envoyer des cadeaux | ✅ | ✅ | ✅ |
| Recevoir des cadeaux | ❌ | ✅ | ❌ |
| **Sessions Privées** | | | |
| Gérer ses sessions | ❌ | ✅ | ❌ |
| Réserver une session | ✅ | ✅ | ✅ |
| **Subscriptions** | | | |
| S'abonner à une chaîne | ✅ | ✅ | ✅ |
| Recevoir des abonnés | ❌ | ✅ | ❌ |
| **Social** | | | |
| Follow/Fan | ✅ | ✅ | ✅ |
| Messages privés | ✅ | ✅ | ✅ |

### 22.3 Route Protection Pattern

Les écrans réservés aux pro_creator utilisent ce pattern:

```typescript
const user = useUserStore((state) => state.user);

// Alert + redirect si non autorisé
useEffect(() => {
  if (user?.accountType !== 'pro_creator') {
    Alert.alert(
      'Pro Creator Feature',
      'This feature is only available for Pro Creator accounts.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  }
}, [user?.accountType, navigation]);

// Render guard (évite le flash d'écran)
if (user?.accountType !== 'pro_creator') {
  return <SafeAreaView style={styles.container} />;
}
```

### 22.4 Écrans protégés

| Écran | Requis | Fichier |
|-------|--------|---------|
| GoLiveIntroScreen | pro_creator | `src/screens/live/GoLiveIntroScreen.tsx` |
| GoLiveScreen | pro_creator | `src/screens/live/GoLiveScreen.tsx` |
| PrivateSessionsManageScreen | pro_creator | `src/screens/sessions/PrivateSessionsManageScreen.tsx` |

---

## 23. Viewer Live Stream Screen

### 23.1 Structure

**Fichier:** `src/screens/live/ViewerLiveStreamScreen.tsx`

Écran immersif full-screen pour regarder un live stream en tant que viewer.

### 23.2 Layout

```
┌────────────────────────────────────────────────────────────┐
│ [×]  [Avatar] CreatorName  LIVE  Title...   [👁 127]       │
│                                                             │
│                                                             │
│                    VIDEO STREAM                             │
│                   (placeholder)                             │
│                                                       ❤️    │
│                                                       🔥    │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ Comments area (scrolling)                            │    │
│ │ [Avatar] User_123: Great energy! 🔥                 │    │
│ │ [Avatar] YogaLover: Can you show that again?        │    │
│ │ [Avatar] FitFan: This is amazing!                   │    │
│ └─────────────────────────────────────────────────────┘    │
│                                                             │
│ ┌─────────────────────────────────┐ [❤️] [🎁] [↗️]         │
│ │ Say something...               │                         │
│ └─────────────────────────────────┘                         │
└────────────────────────────────────────────────────────────┘
```

### 23.3 Props (Route Params)

```typescript
interface RouteParams {
  creatorId?: string;
  creatorName?: string;
  creatorAvatar?: string;
  liveTitle?: string;
  viewerCount?: number;
}
```

### 23.4 Features

#### Top Bar
- Bouton close (×) → Modal "Leave Live?"
- Avatar créateur + nom
- Badge LIVE (rouge pulsant)
- Titre du stream (truncated)
- Compteur de viewers (eye icon)

#### Comments Section
- FlatList scrollable
- Commentaires avec avatar, username, texte
- Badge "Creator" pour les messages du streamer
- Simulation de nouveaux commentaires (demo)

#### Actions Row
- Input pour envoyer un commentaire
- Bouton réactions (❤️) → Popup avec 6 emojis
- Bouton gift (🎁) → Modal de cadeaux
- Bouton share (↗️)

### 23.5 Système de Réactions

**Emojis disponibles:**
```typescript
const REACTIONS = ['❤️', '🔥', '💪', '👏', '😍', '🎉'];
```

**Animation floating:**
- Position initiale: bas-droite de l'écran
- Animation: translateY -200px, translateX random ±50px
- Scale: 0.5 → 1.2 → 1
- Opacity: 1 → 0 (fade out)
- Durée: 2000ms

### 23.6 Système de Cadeaux

**Modal bottom-sheet avec 6 cadeaux:**

| Gift | Emoji | Prix |
|------|-------|------|
| Coffee | ☕ | $2.99 |
| Star | 🌟 | $4.99 |
| Gift Box | 🎁 | $9.99 |
| Diamond | 💎 | $19.99 |
| Trophy | 🏆 | $49.99 |
| Rocket | 🚀 | $99.99 |

**Comportement:**
1. Tap sur gift → close modal + Alert "Gift Sent!"
2. Animation côté streamer (à implémenter avec Realtime)

### 23.7 Modal "Leave Live?"

```
┌────────────────────────────────────┐
│        Leave Live?                  │
│                                     │
│  Are you sure you want to leave     │
│  {creatorName}'s live stream?       │
│                                     │
│  [Stay]              [Leave]        │
└────────────────────────────────────┘
```

---

## 24. Channel Subscription Modal

### 24.1 Structure

**Fichier:** `src/components/SubscribeChannelModal.tsx`

Modal bottom-sheet pour s'abonner à la chaîne d'un pro_creator.

### 24.2 Layout

```
┌────────────────────────────────────────────────────────────┐
│ [×]               Subscribe                                 │
├────────────────────────────────────────────────────────────┤
│                    [Avatar]                                 │
│                   CreatorName                               │
│                   @username                                 │
├────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [○] Fan                                    $4.99/month │ │
│ │     ✓ Access to exclusive posts                        │ │
│ │     ✓ Join live streams                                │ │
│ │     ✓ Fan badge on comments                            │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [●] Super Fan                     POPULAR  $9.99/month │ │
│ │     ✓ All Fan benefits                                 │ │
│ │     ✓ Access to exclusive videos                       │ │
│ │     ✓ Priority in live chat                            │ │
│ │     ✓ Monthly 1-on-1 Q&A                               │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [○] VIP                                   $24.99/month │ │
│ │     ✓ All Super Fan benefits                           │ │
│ │     ✓ Private Discord access                           │ │
│ │     ✓ Early access to content                          │ │
│ │     ✓ Personal shoutouts                               │ │
│ │     ✓ 10% off private sessions                         │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ [███████ Subscribe for $9.99/month ███████]                │
│                                                             │
│ Cancel anytime. Subscription auto-renews monthly.          │
└────────────────────────────────────────────────────────────┘
```

### 24.3 Props

```typescript
interface SubscribeChannelModalProps {
  visible: boolean;
  onClose: () => void;
  creatorName: string;
  creatorAvatar: string;
  creatorUsername: string;
  onSubscribe?: (tierId: string) => void;
}
```

### 24.4 Tiers de Subscription

```typescript
const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'basic',
    name: 'Fan',
    price: 4.99,
    period: 'month',
    features: [
      'Access to exclusive posts',
      'Join live streams',
      'Fan badge on comments',
    ],
  },
  {
    id: 'premium',
    name: 'Super Fan',
    price: 9.99,
    period: 'month',
    features: [
      'All Fan benefits',
      'Access to exclusive videos',
      'Priority in live chat',
      'Monthly 1-on-1 Q&A',
    ],
    popular: true,  // Badge "POPULAR"
  },
  {
    id: 'vip',
    name: 'VIP',
    price: 24.99,
    period: 'month',
    features: [
      'All Super Fan benefits',
      'Private Discord access',
      'Early access to content',
      'Personal shoutouts',
      '10% off private sessions',
    ],
  },
];
```

### 24.5 États visuels

| État | Apparence |
|------|-----------|
| Non sélectionné | Border grise, texte normal |
| Sélectionné | Border primary, fond léger primary, indicator gradient |
| Popular | Badge vert "POPULAR" en haut à droite |

### 24.6 Flow d'abonnement

1. User tap "Subscribe" sur UserProfile
2. Modal s'ouvre avec tier "Super Fan" présélectionné
3. User peut changer de tier
4. Tap "Subscribe for $X/month"
5. Alert confirmation avec prix
6. Confirmation → `onSubscribe(tierId)` appelé
7. Modal se ferme + Alert success

---

*Documentation générée le: 24 Janvier 2026*
*Version: 1.7.0 - Account Types & Viewer Features*
