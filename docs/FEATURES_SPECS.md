# Smuppy Mobile - Features & UI Specifications

> Dernière mise à jour: 21 janvier 2026

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
| **Reply** | `chatbubble-outline` | Crée un Peak en réponse |
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
| Commentaires | ❌ Caché | ✅ Visible | ✅ Visible |

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

### 6.2 Éléments visuels

1. **Cercle de fond** (gris foncé `#2C2C2E`)
2. **Cercle de progression** (vert `#0EBF8A`) - se décharge pendant l'enregistrement
3. **6 triangles blancs** (logo Smuppy au centre)
4. **Cercle blanc central** (apparaît quand on appuie = effet shutter)

### 6.3 Animation "Shutter"

Quand on appuie sur le bouton:
- Le cercle blanc central apparaît (scale 0.5 → 1, opacity 0 → 1)
- Simule l'effet d'un obturateur qui se ferme
- Durée animation: 150ms (ouverture), 200ms (fermeture)

```javascript
// Animation shutter close
shutterValue.value = withTiming(1, {
  duration: 150,
  easing: Easing.out(Easing.cubic),
});

// Animation shutter open
shutterValue.value = withTiming(0, {
  duration: 200,
  easing: Easing.out(Easing.cubic),
});
```

### 6.4 Cercle de progression

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

*Documentation générée le: 21 Janvier 2026*
*Version: 1.0.0*
