# SMUPPY - Mobile App Context Document

## Project Overview

**App Name:** SMUPPY  
**Type:** Social Mobile Application  
**Platform:** Mobile (iOS/Android)  
**Figma Design:** [SMUPPY MVP - MUP](https://www.figma.com/design/4tOh6P8HhNvl7qcHhDBpU7/SMUPPY-MVP---MUP)

---

## Design System

### Color Palette

#### Primary Colors (Gradient Spectrum)
| Color | Hex Code | Usage |
|-------|----------|-------|
| Primary Teal | `#11E3A3` | Primary accent, buttons, active states |
| Teal Secondary | `#00CDB5` | Gradient transitions |
| Cyan | `#00B5C1` | Gradient midpoint, secondary buttons |
| Cyan Blue | `#28B7D4` | Gradient start, headers |
| Blue | `#009BC5` | Extended palette |
| Blue Medium | `#0081BE` | Extended palette |
| Blue Dark | `#0066AC` | Extended palette |
| Dark Navy | `#0A252F` | Primary text, dark UI elements |

#### Neutral Colors
| Color | Hex Code | Usage |
|-------|----------|-------|
| Dark Gray | `#393C43` | Secondary text |
| Medium Gray | `#676C75` | Body text, descriptions |
| Gray Secondary | `#6C7C82` | Metadata, timestamps |
| Gray Muted | `#9CADBC` | Disabled states, placeholders |
| Light Gray | `#CED3D5` | Borders, dividers |
| White | `#FFFFFF` | Backgrounds, cards |

#### Semantic Colors
| Color | Hex Code | Usage |
|-------|----------|-------|
| Error Red | `#EF4444` | Error states, cancel buttons |
| Error Light | `#FFCECE` | Error disabled states |
| Mint Light | `#E7FCF6` | Focus states background |
| Disabled BG | `#EFF1F2` | Disabled input background |
| Disabled Teal | `#CCF0F3` | Primary button disabled |
| Border Green | `#A6D7C8` | Secondary button borders |
| Section Title | `#08363B` | Section headers |

### Gradients

```css
/* Primary Horizontal Gradient */
background: linear-gradient(90deg, #00B3C7 1.44%, #11E3A3 100%);
background: linear-gradient(90deg, #28B7D4 -0.13%, #11E3A3 97.18%);

/* Diagonal Gradient */
background: linear-gradient(143.19deg, #28B7D4 0%, #11E3A3 100%);

/* Menu/Navigation Gradient */
background: linear-gradient(319.45deg, rgba(33, 171, 182, 0.6) 0%, rgba(17, 227, 163, 0.8) 94.14%);

/* Background Overlay */
background: linear-gradient(323.45deg, #28B7D4 1.86%, #11E3A3 100%);

/* Logo Gradient */
background: linear-gradient(88.32deg, #134456 -38.13%, #0A252F 47.8%);
background: linear-gradient(117deg, #11E3A3 41.03%, #00B3C7 87.29%);

/* Live Button Gradient */
background: linear-gradient(90deg, #FF5E57 1.44%, #FA6B65 100%);

/* Reminder Button Gradient */
background: linear-gradient(90deg, #0081BE 0%, #00B5C1 100%);
```

### Typography

#### Primary Font: Work Sans
| Style | Weight | Size | Line Height | Usage |
|-------|--------|------|-------------|-------|
| Page Title | 800 ExtraBold | 48px | 56px | Main page headers |
| Section Header | 300 Light | 35px | 41px | Section titles |
| Title 1 | 700 Bold | 30px | 35px | Card titles |
| Title 2 | 700 Bold | 28px | 33px | Secondary titles |
| Title 3 | 700 Bold | 18px | 21px | Small titles |
| Body | 400 Regular | 16px | 19px | Body text |
| Caption | 700 Bold | 12px | 14px | Small labels |
| Semibold | 600 | 16px | 19px | Emphasized text |

#### Secondary Font: Poppins
| Style | Weight | Size | Line Height | Usage |
|-------|--------|------|-------------|-------|
| Button Large | 500 Medium | 18px | 24px | Primary buttons |
| Button Medium | 500 Medium | 16px | 24px | Secondary buttons |
| Body | 400 Regular | 16px | 22px | Form inputs, descriptions |
| Label | 700 Bold | 12px | 18px | Input labels, nav items |
| Small | 500 Medium | 12px | 18px | Small buttons, badges |
| Tiny | 500 Medium | 10px | 16px | Card metadata |

### Border Radius

| Element | Radius |
|---------|--------|
| Buttons (Primary) | 20px |
| Buttons (Small) | 8px |
| Buttons (Medium) | 12px |
| Buttons (Live) | 17px |
| Cards | 16px, 20px |
| Input Fields | 20px |
| Avatars | 8px |
| Icon Containers | 8px |
| Bottom Navigation | 20px |
| Tabs | 16px |

### Shadows & Effects

```css
/* Card Shadow */
box-shadow: 0px 4px 4px -4px rgba(0, 0, 0, 0.03);

/* Button Shadow */
box-shadow: 0px 0px 0px rgba(0, 0, 0, 0.25), 
            0px -1px 4px rgba(0, 0, 0, 0.05), 
            0px 4px 4px rgba(10, 136, 98, 0.1);

/* App Bar Shadow */
box-shadow: 0px 12px 12px -4px rgba(0, 0, 0, 0.08), 
            0px 8px 8px -4px rgba(0, 0, 0, 0.03);

/* Bottom Navigation Shadow */
box-shadow: 0px 5px 15px -4px rgba(10, 37, 47, 0.2), 
            0px 8px 8px -4px rgba(0, 0, 0, 0.03);

/* Floating Button Shadow */
box-shadow: 0px 3px 2px rgba(0, 0, 0, 0.1);

/* Glassmorphism */
backdrop-filter: blur(10px);
background: rgba(255, 255, 255, 0.9);
```

### Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon padding |
| sm | 8px | Component gaps |
| md | 10px | List gaps |
| base | 12px | Button padding |
| lg | 16px | Input padding |
| xl | 20px | Section gaps |
| 2xl | 24px | Component spacing |
| 3xl | 26px | Form gaps |
| 4xl | 30px | Section spacing |
| 5xl | 34px | Large gaps |
| section | 80px | Between major sections |

---

## Component Specifications

### Buttons

#### Primary Button
```css
/* Active */
display: flex;
justify-content: center;
align-items: center;
padding: 16px 24px;
gap: 8px;
width: 320px;
height: 56px;
background: linear-gradient(90deg, #00B3C7 1.44%, #11E3A3 100%);
border-radius: 20px;
font-family: 'Poppins';
font-weight: 500;
font-size: 18px;
color: #0A252F;

/* Disabled */
background: #CCF0F3;
color: #9CADBC;
```

#### Secondary Button
```css
/* Active */
background: #FFFFFF;
border-radius: 20px;
font-family: 'Poppins';
font-weight: 500;
font-size: 18px;
color: #0A252F;

/* Disabled */
border: 2px solid #A6D7C8;
color: #9CADBC;
```

#### Tertiary Button
```css
/* Active */
background: #FFFFFF;
color: #0A252F;

/* Disabled */
border: 2px solid #CED3D5;
color: #9CADBC;
```

#### Cancel Button
```css
/* Active */
background: #FFFFFF;
color: #EF4444;

/* Disabled */
border: 2px solid #FFCECE;
color: #FFCECE;
```

#### Live Button
```css
/* Active */
padding: 12px 24px;
height: 48px;
background: linear-gradient(90deg, #FF5E57 1.44%, #FA6B65 100%);
border-radius: 17px;
color: #FFFFFF;

/* Disabled */
background: linear-gradient(90deg, #FFDFDE 1.44%, #FFE8E6 100%);
color: #FFA7A3;
```

#### Small Button
```css
padding: 6px 16px;
height: 28px;
background: linear-gradient(90deg, #00B3C7 0%, #11E3A3 100%);
border-radius: 8px;
font-size: 10px;
```

#### Medium Button
```css
padding: 10px;
gap: 5px;
height: 38px;
background: linear-gradient(270deg, #11E3A3 0%, #01B6C6 100%);
border-radius: 12px;
font-size: 12px;
```

### Input Fields

#### Default State
```css
display: flex;
padding: 16px;
gap: 10px;
min-height: 56px;
background: #FFFFFF;
border: 1px solid #11E3A3;
border-radius: 20px;
```

#### Focus State
```css
background: #E7FCF6;
border: 1px solid #11E3A3;
box-shadow: 0px 0px 0px 4px rgba(231, 252, 246, 0.4);
```

#### Error State
```css
background: #FFFFFF;
border: 1px solid #EF4444;
color: #EF4444;
```

#### Disabled State
```css
background: #EFF1F2;
color: #CED3D5;
/* Label color: #6C7C82 */
```

#### Input Label
```css
font-family: 'Poppins';
font-weight: 700;
font-size: 12px;
line-height: 18px;
color: #0A252F;
margin-bottom: 8px;
```

### Navigation

#### Top Navigation Bar
```css
display: flex;
flex-direction: column;
align-items: center;
width: 390px;
height: 111.56px;
background: rgba(255, 255, 255, 0.9);
backdrop-filter: blur(10px);
```

#### Tab Navigation
```css
/* Container */
display: flex;
padding: 2px 32px 1px;
gap: 20px;
height: 33px;
background: rgba(255, 255, 255, 0.04);
backdrop-filter: blur(10px);

/* Active Tab */
border-bottom: 2px solid #11E3A3;
color: #11E3A3;

/* Inactive Tab */
color: #0A252F;
```

#### Bottom Navigation
```css
/* Container */
display: flex;
padding: 0px;
width: 300px;
height: 52px;
background: linear-gradient(0deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.9)), 
            rgba(206, 210, 217, 0.1);
box-shadow: 0px 5px 15px -4px rgba(10, 37, 47, 0.2), 
            0px 8px 8px -4px rgba(0, 0, 0, 0.03);
backdrop-filter: blur(10px);
border-radius: 20px;

/* Active State Indicator */
width: 21px;
height: 3px;
background: #0A252F;
border-radius: 4px;

/* Green Variant */
background: rgba(17, 227, 163, 0.9);
border: 1px solid rgba(10, 37, 47, 0.18);
```

### Cards

#### Suggestion Card
```css
display: flex;
flex-direction: column;
justify-content: flex-end;
align-items: center;
width: 106px;
height: 148px;
border-radius: 16px;

/* Avatar */
width: 100px;
height: 100px;
border: 2px solid #11E3A3;
border-radius: 16px;

/* Name */
font-family: 'Poppins';
font-weight: 500;
font-size: 10px;
text-align: center;
```

#### Post Card
```css
display: flex;
flex-direction: column;
width: 186px;
background: #FFFFFF;
border: 1px solid #B5C9C3;
border-radius: 20px;

/* Image Area */
height: 120px; /* or 278px for tall cards */
border-radius: 18px;

/* Content Area */
padding: 4px 10px 10px;
gap: 4px;

/* Title */
font-family: 'Poppins';
font-weight: 700;
font-size: 12px;
line-height: 18px;

/* Metadata */
font-family: 'Poppins';
font-weight: 400;
font-size: 12px;
color: #6C7C82;

/* Duration Badge */
padding: 2px 6px;
background: #FFFFFF;
opacity: 0.8;
box-shadow: 0px 12px 12px -4px rgba(0, 0, 0, 0.08);
backdrop-filter: blur(10px);
border-radius: 8px;
```

### Icon Containers
```css
display: flex;
padding: 4px;
gap: 8px;
width: 32px;
height: 32px;
background: rgba(255, 255, 255, 0.2);
border: 1px solid rgba(255, 255, 255, 0.2);
backdrop-filter: blur(10px);
border-radius: 8px;

/* Icon */
width: 24px;
height: 24px;
color: #0A252F;
```

### Toggle Switch
```css
/* Container */
width: 42px;
height: 22px;
border-radius: 18px;

/* On State */
background: #11E3A3;
border: 1px solid #11E3A3;

/* Off State */
background: #FFFFFF;
border: 1px solid #CED3D5;

/* Indicator */
width: 18px;
height: 18px;
background: #FFFFFF; /* On */
background: #CED3D5; /* Off */
```

### Tabs Component
```css
/* Container */
display: flex;
padding: 4px;
width: 220px;
height: 55px;
border: 1px solid #CED3D5;
border-radius: 16px;

/* Tab */
padding: 14px 26px;
width: 106px;
height: 47px;
border-radius: 16px;

/* Active Tab */
background: #00B5C1;
color: #FFFFFF;

/* Inactive Tab */
background: transparent;
color: #0A252F;
```

---

## User Flows

### Personal Account Onboarding

```
1. WELCOME SCREEN
   └── "Get Started" button → Account Type Selection

2. ACCOUNT TYPE SELECTION
   ├── "Personal" option → Create Personal Account
   └── "Business" option → Create Business Account

3. CREATE PERSONAL ACCOUNT
   ├── Name input field
   ├── Email input field
   ├── Password input field
   ├── Terms & Privacy checkbox
   └── "Create Account" button → Interests Selection

4. INTERESTS SELECTION
   ├── Grid of interest categories (multi-select)
   │   ├── Fitness & Wellness
   │   ├── Nutrition
   │   ├── Mental Health
   │   ├── Sports
   │   ├── Yoga
   │   ├── Running
   │   └── [etc.]
   └── "Continue" button → Guidelines

5. GUIDELINES SCREEN
   ├── Community guidelines overview
   ├── Acceptance checkbox
   └── "Accept & Continue" button → Success

6. SUCCESS SCREEN
   ├── Welcome message with confetti animation
   └── "Start Exploring" button → Main Feed
```

### Business Account Onboarding

```
1. WELCOME SCREEN
   └── "Get Started" button → Account Type Selection

2. ACCOUNT TYPE SELECTION
   ├── "Personal" option → Create Personal Account
   └── "Business" option → Create Business Account

3. CREATE BUSINESS ACCOUNT
   ├── Business Name input field
   ├── Email input field
   ├── Password input field
   ├── Terms & Privacy checkbox
   └── "Create Account" button → Profession Selection

4. PROFESSION SELECTION
   ├── List of professions (single-select)
   │   ├── Personal Trainer
   │   ├── Nutritionist
   │   ├── Yoga Instructor
   │   ├── Life Coach
   │   ├── Physical Therapist
   │   └── [etc.]
   └── "Continue" button → Area of Expertise

5. AREA OF EXPERTISE
   ├── Grid of expertise areas (multi-select)
   │   ├── Weight Loss
   │   ├── Muscle Building
   │   ├── Flexibility
   │   ├── Sports Performance
   │   ├── Rehabilitation
   │   └── [etc.]
   └── "Continue" button → Guidelines

6. GUIDELINES SCREEN
   ├── Community guidelines overview
   ├── Business-specific guidelines
   ├── Acceptance checkbox
   └── "Accept & Continue" button → Success

7. SUCCESS SCREEN
   ├── Welcome message for business account
   ├── Next steps overview
   └── "Go to Dashboard" button → Business Dashboard
```

### Main App Navigation Structure

```
BOTTOM NAVIGATION
├── Home (Feed)
│   ├── Top Navigation Tabs
│   │   ├── Fan (Following feed)
│   │   ├── Vilbes (Discover)
│   │   └── Xplorer (Explore)
│   ├── Suggestions Section
│   └── Posts Grid (Masonry layout)
├── Search
├── Create (+)
├── Notifications
└── Profile
```

---

## Screen Specifications

### Screen Dimensions
- **Base Width:** 390px (iPhone 14 Pro)
- **Status Bar Height:** 36px (with notch consideration)
- **Top Navigation Height:** 42.56px
- **Tab Navigation Height:** 33px
- **Bottom Navigation Height:** 67px
- **Safe Area Bottom:** 13px

### Status Bar
```css
/* Light Mode */
width: 390px;
height: 36px;
backdrop-filter: blur(20px);

/* Time */
font-weight: 600;
font-size: 15px;
color: #0A0A0A;

/* Icons (Signal, WiFi, Battery) */
color: #0A0A0A;
```

---

## Assets & Resources

### Logo Specifications
- **Full Logo Width:** 105px
- **Logo Height:** 22.56px
- **Logo Colors:** Gradient from `#134456` to `#0A252F` with accent `#11E3A3` and `#00B3C7`

### Icon System
- **Standard Size:** 24px × 24px
- **Small Size:** 16px × 16px
- **Container Size:** 32px × 32px
- **Container Padding:** 4px
- **Container Border Radius:** 8px
- **Icon Color (Dark):** `#0A252F`
- **Icon Color (Light):** `#FFFFFF`
- **Icon Color (Active):** `#11E3A3`

### Avatar Specifications
- **Small:** 24px × 24px (border-radius: 8px)
- **Medium:** 32px × 32px (border-radius: 8px)
- **Large:** 100px × 100px (border-radius: 16px)
- **Active Border:** 2px solid `#11E3A3`

---

## Animation Guidelines

### Transitions
- **Default Duration:** 200ms
- **Easing:** ease-in-out
- **Button Press:** scale(0.98)
- **Page Transitions:** slide-in from right

### Loading States
- **Skeleton Color:** `#EFF1F2`
- **Shimmer Animation:** linear-gradient overlay

### Success States
- **Confetti Colors:** `#11E3A3`, `#28B7D4`, `#00B5C1`

---

## Accessibility

### Touch Targets
- **Minimum Size:** 44px × 44px
- **Buttons:** 56px height (standard), 48px height (compact)

### Contrast Ratios
- **Text on White:** `#0A252F` (passes WCAG AA)
- **Text on Gradient:** `#0A252F` (passes WCAG AA)
- **Error Text:** `#EF4444` on white (passes WCAG AA)

### Focus States
- **Visible Focus Ring:** 4px spread with `rgba(231, 252, 246, 0.4)`
- **Background Change:** `#E7FCF6`

---

## Development Notes

### Font Loading
```html
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700;800&family=Poppins:wght@300;400;500;700&display=swap" rel="stylesheet">
```

### CSS Variables (Recommended)
```css
:root {
  /* Primary Colors */
  --color-primary: #11E3A3;
  --color-primary-dark: #00B3C7;
  --color-accent: #28B7D4;
  
  /* Text Colors */
  --color-text-primary: #0A252F;
  --color-text-secondary: #393C43;
  --color-text-muted: #6C7C82;
  --color-text-placeholder: #CED3D5;
  
  /* Background Colors */
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #EFF1F2;
  --color-bg-focus: #E7FCF6;
  
  /* Semantic Colors */
  --color-error: #EF4444;
  --color-success: #11E3A3;
  
  /* Gradients */
  --gradient-primary: linear-gradient(90deg, #00B3C7 1.44%, #11E3A3 100%);
  --gradient-diagonal: linear-gradient(143.19deg, #28B7D4 0%, #11E3A3 100%);
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  
  /* Border Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  
  /* Shadows */
  --shadow-card: 0px 4px 4px -4px rgba(0, 0, 0, 0.03);
  --shadow-button: 0px 4px 4px rgba(10, 136, 98, 0.1);
  --shadow-nav: 0px 5px 15px -4px rgba(10, 37, 47, 0.2);
}
```

### Component Naming Convention
- Use BEM methodology: `.block__element--modifier`
- Prefix with `smuppy-` for global components
- Example: `.smuppy-button--primary`, `.smuppy-input__label`

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-07 | 1.0.0 | Initial design system documentation |

---

*This document is the single source of truth for SMUPPY mobile app development. All implementations should reference these specifications.*