export const COLORS = {
    // Primary - Smuppy green (splash screen center color)
    primary: '#0EBF8A',           // Smuppy Green
    primaryDark: '#0066ac',       // Blue (gradient end)
    primaryLight: '#E6FAF8',      // Input valid/focus background

    // Legacy (keep for compatibility)
    cyan: '#0EBF8A',
    cyanBlue: '#28B7D4',
    blue: '#009BC5',
    blueMedium: '#0081BE',
    blueDark: '#0066ac',
    primaryGreen: '#0EBF8A',      // Green accent (alias for dark theme compatibility)

    // Dark
    dark: '#0a252f',
    darkGray: '#393C43',

    // Gray scale
    gray: '#676C75',
    graySecondary: '#6C7C82',
    grayMuted: '#9cadbc',
    grayLight: '#CED3D5',
    grayBorder: '#E5E7EB',
    gray50: '#F9FAFB',
    gray100: '#F3F4F6',
    gray200: '#E5E7EB',
    gray300: '#D1D5DB',
    gray400: '#9CA3AF',
    gray500: '#6B7280',
    gray600: '#4B5563',
    gray700: '#374151',
    gray800: '#1F2937',
    gray900: '#111827',

    // Base
    white: '#FFFFFF',

    // Status
    error: '#FF3B30',
    errorLight: '#FEF2F2',
    errorBorder: '#FECACA',
    success: '#0EBF8A',

    // Heart/Like colors
    heartRed: '#FF6B6B',          // Red for heart/like icons
    heartRedDark: '#E55555',      // Darker shade for pressed state

    // Accent colors (for categories, badges, etc.)
    gold: '#FFD700',              // Stars, premium badges, ratings
    teal: '#4ECDC4',              // Easy difficulty, categories
    purple: '#9B59B6',            // Expert difficulty, yoga
    orange: '#FF6B35',            // Fire reaction, categories
    yellow: '#FFD93D',            // Joy reaction, warnings

    // Badge colors (verified, creator, premium)
    badgeVerified: '#2D8EFF',     // Blue - Verified personal accounts
    badgeCreator: '#0BCF93',      // Green - Pro/Creator accounts (100M+ followers)
    badgePremium: '#D7B502',      // Gold - Premium/Pro Business accounts

    // Backgrounds
    background: '#FFFFFF',
    backgroundSecondary: '#F9FAFB',
    backgroundFocus: '#F0FDFB',
    backgroundValid: '#E6FAF8',
    backgroundDisabled: '#EFF1F2',

    // Buttons
    buttonDisabled: '#CED3D5',
    buttonBorder: '#A6D7C8',
    buttonBorderLight: '#B5C9C3',

    // Section
    sectionTitle: '#08363B',

    // Overlay
    overlay: 'rgba(0, 0, 0, 0.5)',
    overlayLight: 'rgba(255, 255, 255, 0.9)',

    // Dark theme compatibility aliases (light mode values)
    text: '#0a252f',
    textSecondary: '#676C75',
    card: '#FFFFFF',
    darkCard: '#F5F5F5',
    textMuted: '#6B7280',
    darkBg: '#F9FAFB',
    cardBg: '#FFFFFF',
    border: '#E5E7EB',
  };

// Dark theme colors — full parity with COLORS + legacy extras
export const DARK_COLORS = {
    // Primary
    primary: '#0EBF8A',
    primaryDark: '#0EBF8A',
    primaryLight: '#1A2F2A',

    // Legacy
    cyan: '#00E5FF',
    cyanBlue: '#28B7D4',
    blue: '#009BC5',
    blueMedium: '#0081BE',
    blueDark: '#0066ac',
    primaryGreen: '#0EBF8A',

    // Dark
    dark: '#E5E7EB',
    darkGray: '#1C1C1E',

    // Gray scale (inverted for dark mode)
    gray: '#8E8E93',
    graySecondary: '#8E8E93',
    grayMuted: '#6E6E73',
    grayLight: '#3A3A3C',
    grayBorder: '#2C2C2E',
    gray50: '#1C1C1E',
    gray100: '#2C2C2E',
    gray200: '#3A3A3C',
    gray300: '#48484A',
    gray400: '#636366',
    gray500: '#8E8E93',
    gray600: '#AEAEB2',
    gray700: '#C7C7CC',
    gray800: '#D1D1D6',
    gray900: '#E5E5EA',

    // Base
    white: '#FFFFFF',

    // Status
    error: '#EF4444',
    errorLight: '#2D1F1F',
    errorBorder: '#5C2020',
    success: '#22C55E',

    // Heart/Like colors
    heartRed: '#FF6B6B',
    heartRedDark: '#E55555',

    // Accent colors (for categories, badges, etc.)
    gold: '#FFD700',
    teal: '#4ECDC4',
    purple: '#9B59B6',
    yellow: '#FFD93D',

    // Badge colors (verified, creator, premium)
    badgeVerified: '#2D8EFF',     // Blue - Verified personal accounts
    badgeCreator: '#0BCF93',      // Green - Pro/Creator accounts (100M+ followers)
    badgePremium: '#D7B502',      // Gold - Premium/Pro Business accounts

    // Backgrounds
    background: '#0D0D0D',
    backgroundSecondary: '#1A1A1A',
    backgroundFocus: '#0D2420',
    backgroundValid: '#0D2420',
    backgroundDisabled: '#2C2C2E',

    // Buttons
    buttonDisabled: '#3A3A3C',
    buttonBorder: '#1A5C4A',
    buttonBorderLight: '#2A4A3E',

    // Section
    sectionTitle: '#E5E7EB',

    // Overlay
    overlay: 'rgba(0, 0, 0, 0.6)',
    overlayLight: 'rgba(0, 0, 0, 0.7)',

    // Dark theme compatibility aliases
    text: '#E5E7EB',
    textSecondary: '#8E8E93',
    card: '#1A1A1A',
    textMuted: '#6B7280',
    darkBg: '#0D0D0D',
    cardBg: '#1A1A1A',
    border: '#2A2A2A',

    // Legacy dark theme keys (used in existing screens)
    secondary: '#00B3C7',
    lightGray: '#AEAEB2',
    red: '#FF6B6B',
    orange: '#FFA500',
    darkCard: '#1C1C1E',
    textPrimary: '#FFFFFF',
    cardBgTransparent: 'rgba(28, 28, 30, 0.95)',
  };

export type ThemeMode = 'light' | 'dark';

export function getThemeColors(mode: ThemeMode): typeof COLORS {
  return mode === 'dark' ? DARK_COLORS as unknown as typeof COLORS : COLORS;
}
  
  export const GRADIENTS = {
    // Primary gradient - optimized for readability with white text
    primary: ['#00B3C7', '#0EBF8A', '#72D1AD'] as const,
    primaryStart: { x: 0, y: 0 },
    primaryEnd: { x: 1, y: 0 },

    // Diagonal (for icons)
    diagonal: ['#00B3C7', '#0EBF8A', '#72D1AD'] as const,
    diagonalStart: { x: 0, y: 0 },
    diagonalEnd: { x: 1, y: 1 },

    // Buttons
    button: ['#00B3C7', '#0EBF8A', '#72D1AD'] as const,
    buttonDisabled: ['#CED3D5', '#CED3D5'] as const,

    // Reverse
    primaryReverse: ['#72D1AD', '#0EBF8A', '#00B3C7'] as const,

    // Special
    live: ['#FF5E57', '#FA6B65'] as const,
    liveDisabled: ['#FFDFDE', '#FFE8E6'] as const,
    reminder: ['#0081BE', '#00B5C1'] as const,
    reminderDisabled: ['#AAC9D8', '#9DE7EB'] as const,

    // Nav
    bottomNav: ['rgba(0, 205, 181, 0.9)', 'rgba(0, 205, 181, 0.9)'] as const,
    bottomNavWhite: ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.9)'] as const,
  };
  
  // UNIFIED CAPSULE STYLE - USE IN ALL SCREENS
  export const FORM = {
    // Input
    inputHeight: 56,
    inputRadius: 28,              // Perfect capsule = height/2
    inputBorderWidth: 1.5,
    inputPaddingHorizontal: 20,
    
    // Button
    buttonHeight: 56,
    buttonRadius: 28,             // Perfect capsule = height/2
    
    // Small button
    buttonSmallHeight: 48,
    buttonSmallRadius: 24,
    
    // Colors
    inputBorder: '#CED3D5',
    inputBorderFocus: '#0EBF8A',
    inputBorderValid: '#0EBF8A',
    inputBorderError: '#FF3B30',
    inputBgFocus: '#F0FDFB',
    inputBgValid: '#E6FAF8',
    inputBgError: '#FEF2F2',
    
    // Icon colors
    iconDefault: '#9cadbc',
    iconFocus: '#0EBF8A',
    iconError: '#FF3B30',
    
    // Text colors
    textPrimary: '#0a252f',
    textSecondary: '#676C75',
    textMuted: '#9cadbc',
    textLink: '#0EBF8A',
    textError: '#FF3B30',
  };
  
  export const FONTS = {
    primary: 'WorkSans',
    secondary: 'Poppins',
    weights: { light: '300', regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' },
  };
  
  export const TYPOGRAPHY = {
    pageTitle: { fontFamily: 'WorkSans-ExtraBold', fontSize: 48, lineHeight: 56, letterSpacing: -0.48, color: COLORS.sectionTitle },
    sectionHeader: { fontFamily: 'WorkSans-Regular', fontSize: 35, lineHeight: 41, letterSpacing: -0.35, color: COLORS.sectionTitle },
    title1: { fontFamily: 'WorkSans-Bold', fontSize: 30, lineHeight: 35, color: COLORS.dark },
    title2: { fontFamily: 'WorkSans-Bold', fontSize: 28, lineHeight: 33, color: COLORS.dark },
    title3: { fontFamily: 'WorkSans-Bold', fontSize: 18, lineHeight: 21, color: COLORS.dark },
    title4: { fontFamily: 'WorkSans-Bold', fontSize: 16, lineHeight: 19, color: COLORS.dark },
    subtitle: { fontFamily: 'WorkSans-SemiBold', fontSize: 16, lineHeight: 19, color: COLORS.darkGray },
    buttonLarge: { fontFamily: 'Poppins-Medium', fontSize: 18, lineHeight: 24, color: COLORS.white },
    buttonMedium: { fontFamily: 'Poppins-Medium', fontSize: 16, lineHeight: 24, color: COLORS.white },
    buttonSmall: { fontFamily: 'Poppins-Medium', fontSize: 12, lineHeight: 18, color: COLORS.white },
    body: { fontFamily: 'Poppins-Regular', fontSize: 16, lineHeight: 22, color: COLORS.dark },
    bodySmall: { fontFamily: 'Poppins-Regular', fontSize: 14, lineHeight: 21, color: COLORS.gray },
    label: { fontFamily: 'Poppins-Bold', fontSize: 14, lineHeight: 18, color: COLORS.dark },
    caption: { fontFamily: 'Poppins-Medium', fontSize: 12, lineHeight: 18, color: COLORS.graySecondary },
    tiny: { fontFamily: 'Poppins-Medium', fontSize: 10, lineHeight: 16, color: COLORS.dark },
    navLabel: { fontFamily: 'Poppins-Bold', fontSize: 12, lineHeight: 18 },
  };
  
  export const SPACING = {
    xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, '2xl': 28, '3xl': 32, '4xl': 40, '5xl': 48, section: 80,
  };
  
  export const SIZES = {
    // Radius
    radiusXs: 5, 
    radiusSm: 8, 
    radiusMd: 12, 
    radiusLg: 16, 
    radiusXl: 20, 
    radiusButton: 28,     // Capsule
    radiusInput: 28,      // Capsule
    radiusCard: 16, 
    radiusNav: 20, 
    radiusFull: 9999,
    
    // Buttons
    buttonXl: 56, 
    buttonLg: 48, 
    buttonMd: 38, 
    buttonSm: 28,
    
    // Input
    inputHeight: 56, 
    inputMinHeight: 56,
    
    // Icons
    iconXs: 12,        // Extra small - inline indicators
    iconSm: 16,        // Small - chips, compact UI
    iconMd: 20,        // Medium - default
    iconLg: 24,        // Large - action buttons
    iconXl: 28,        // Extra large - navigation on dark
    iconXxl: 32,       // XXL - prominent displays

    // Badges (verified, premium, creator)
    badgeSm: 14,       // Small - suggestions, search results
    badgeMd: 16,       // Medium - feed posts, messages
    badgeLg: 18,       // Large - profile names
    badgeXl: 20,       // Extra large - settings headers
    badgeXxl: 46,      // XXL - profile page headers
    
    // Avatars
    avatarXs: 24, 
    avatarSm: 32, 
    avatarMd: 50, 
    avatarLg: 100,
    
    // Containers
    iconContainer: 32, 
    iconContainerPadding: 4,
    
    // Navigation
    statusBarHeight: 44,
    topNavHeight: 42.56,
    headerHeight: 56,
    tabNavHeight: 33, 
    bottomNavHeight: 67, 
    bottomNavWidth: 300, 
    bottomNavItemWidth: 60,
    
    // Screen
    screenWidth: 390, 
    screenPadding: 16, 
    screenPaddingLg: 20, 
    screenPaddingXl: 25,
    
    // Cards
    suggestionCardWidth: 106, 
    suggestionCardHeight: 148, 
    postCardWidth: 186, 
    vibeCardTall: 250, 
    vibeCardShort: 180,
  };
  
  export const SHADOWS = {
    none: { shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    card: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 2 },
    cardMedium: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
    button: { shadowColor: '#0EBF8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
    buttonGradient: { shadowColor: '#0EBF8A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
    nav: { shadowColor: '#0A252F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 5 },
    navLight: { shadowColor: '#0A252F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 7, elevation: 3 },
    appBar: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    float: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 3 },
    inputFocus: { shadowColor: '#0EBF8A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 0 },
  };
  
  export const BORDERS = { none: 0, thin: 1, medium: 1.5, thick: 2, extraThick: 3 };
  
  export const ANIMATION = { fast: 150, normal: 200, slow: 300, verySlow: 500 };
  
  export const Z_INDEX = { base: 0, dropdown: 10, sticky: 20, fixed: 30, modal: 40, popover: 50, tooltip: 60 };

// Hit slop constants - use these instead of inline objects to prevent re-renders
export const HIT_SLOP = {
  small: { top: 8, bottom: 8, left: 8, right: 8 },
  medium: { top: 10, bottom: 10, left: 10, right: 10 },
  large: { top: 15, bottom: 15, left: 15, right: 15 },
  xlarge: { top: 20, bottom: 20, left: 20, right: 20 },
} as const;
  
export const DARK_GRADIENTS = {
    primary: ['#008A94', '#0A9E72', '#4BA888'] as const,
    primaryStart: { x: 0, y: 0 },
    primaryEnd: { x: 1, y: 0 },
    diagonal: ['#008A94', '#0A9E72', '#4BA888'] as const,
    diagonalStart: { x: 0, y: 0 },
    diagonalEnd: { x: 1, y: 1 },
    button: ['#008A94', '#0A9E72', '#4BA888'] as const,
    buttonDisabled: ['#3A3A3C', '#3A3A3C'] as const,
    primaryReverse: ['#4BA888', '#0A9E72', '#008A94'] as const,
    live: ['#FF5E57', '#FA6B65'] as const,
    liveDisabled: ['#3A2020', '#3A2222'] as const,
    reminder: ['#0081BE', '#00B5C1'] as const,
    reminderDisabled: ['#1A2E3A', '#1A3A3C'] as const,
    bottomNav: ['rgba(0, 155, 137, 0.9)', 'rgba(0, 155, 137, 0.9)'] as const,
    bottomNavWhite: ['rgba(26, 26, 26, 0.9)', 'rgba(26, 26, 26, 0.9)'] as const,
  };

  export const DARK_FORM: typeof FORM = {
    inputHeight: 56,
    inputRadius: 28,
    inputBorderWidth: 1.5,
    inputPaddingHorizontal: 20,
    buttonHeight: 56,
    buttonRadius: 28,
    buttonSmallHeight: 48,
    buttonSmallRadius: 24,
    inputBorder: '#3A3A3C',
    inputBorderFocus: '#0EBF8A',
    inputBorderValid: '#0EBF8A',
    inputBorderError: '#EF4444',
    inputBgFocus: '#0D2420',
    inputBgValid: '#0D2420',
    inputBgError: '#2D1F1F',
    iconDefault: '#6E6E73',
    iconFocus: '#0EBF8A',
    iconError: '#EF4444',
    textPrimary: '#E5E5EA',
    textSecondary: '#AEAEB2',
    textMuted: '#6E6E73',
    textLink: '#0EBF8A',
    textError: '#EF4444',
  };

  export const DARK_SHADOWS: typeof SHADOWS = {
    none: { shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    card: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
    cardMedium: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
    button: { shadowColor: '#0EBF8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
    buttonGradient: { shadowColor: '#0EBF8A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
    nav: { shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 5 },
    navLight: { shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.15, shadowRadius: 7, elevation: 3 },
    appBar: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
    float: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
    inputFocus: { shadowColor: '#0EBF8A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 0 },
  };

  export type ThemeGradients = typeof GRADIENTS;
  export type ThemeForm = typeof FORM;
  export type ThemeShadows = typeof SHADOWS;

  export function getThemeGradients(mode: ThemeMode): ThemeGradients {
    return mode === 'dark' ? DARK_GRADIENTS as unknown as ThemeGradients : GRADIENTS;
  }

  export function getThemeForm(mode: ThemeMode): ThemeForm {
    return mode === 'dark' ? DARK_FORM : FORM;
  }

  export function getThemeShadows(mode: ThemeMode): ThemeShadows {
    return mode === 'dark' ? DARK_SHADOWS : SHADOWS;
  }

  const theme = { COLORS, DARK_COLORS, GRADIENTS, DARK_GRADIENTS, FORM, DARK_FORM, FONTS, TYPOGRAPHY, SPACING, SIZES, SHADOWS, DARK_SHADOWS, BORDERS, ANIMATION, Z_INDEX };

  export default theme;