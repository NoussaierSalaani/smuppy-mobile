export const COLORS = {
    // Primary - Smuppy green (splash screen center color)
    primary: '#11E3A3',           // Smuppy Green
    primaryDark: '#0066ac',       // Blue (gradient end)
    primaryLight: '#E6FAF8',      // Input valid/focus background

    // Legacy (keep for compatibility)
    cyan: '#11E3A3',
    cyanBlue: '#28B7D4',
    blue: '#009BC5',
    blueMedium: '#0081BE',
    blueDark: '#0066ac',
    primaryGreen: '#11E3A3',      // Green accent (alias for dark theme compatibility)

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
    success: '#11E3A3',

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

    // Dark theme compatibility aliases
    textMuted: '#6B7280',
    darkBg: '#0D0D0D',
    cardBg: '#1A1A1A',
    border: '#2A2A2A',
  };

// Dark theme colors (used in Peaks, Profile, etc.)
export const DARK_COLORS = {
    primary: '#11E3A3',           // Green accent
    primaryGreen: '#11E3A3',      // Alias for primary
    primaryDark: '#0EBF8A',       // Darker green
    cyan: '#00E5FF',              // Cyan accent
    dark: '#0A0A0F',              // Near black background
    darkBg: '#0D0D0D',            // Darker background variant
    darkCard: '#1C1C1E',          // Card background
    cardBg: '#1A1A1A',            // Alternative card bg
    border: '#2A2A2A',            // Border color
    white: '#FFFFFF',
    textPrimary: '#FFFFFF',       // Primary text
    textMuted: '#6B7280',         // Muted text
    gray: '#8E8E93',              // iOS gray
    grayLight: '#6E6E73',
    red: '#FF6B6B',               // Danger/unfollow color
    error: '#EF4444',             // Error color
    overlay: 'rgba(0, 0, 0, 0.4)',
    cardBgTransparent: 'rgba(28, 28, 30, 0.95)',
  };
  
  export const GRADIENTS = {
    // Primary gradient (splash screen colors) - USE EVERYWHERE
    primary: ['#00B3C7', '#11E3A3', '#7BEDC6'] as const,
    primaryStart: { x: 0, y: 0 },
    primaryEnd: { x: 1, y: 0 },

    // Diagonal (for icons)
    diagonal: ['#00B3C7', '#11E3A3', '#7BEDC6'] as const,
    diagonalStart: { x: 0, y: 0 },
    diagonalEnd: { x: 1, y: 1 },

    // Buttons
    button: ['#00B3C7', '#11E3A3', '#7BEDC6'] as const,
    buttonDisabled: ['#CED3D5', '#CED3D5'] as const,

    // Reverse
    primaryReverse: ['#7BEDC6', '#11E3A3', '#00B3C7'] as const,

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
    inputBorderFocus: '#11E3A3',
    inputBorderValid: '#11E3A3',
    inputBorderError: '#FF3B30',
    inputBgFocus: '#F0FDFB',
    inputBgValid: '#E6FAF8',
    inputBgError: '#FEF2F2',
    
    // Icon colors
    iconDefault: '#9cadbc',
    iconFocus: '#11E3A3',
    iconError: '#FF3B30',
    
    // Text colors
    textPrimary: '#0a252f',
    textSecondary: '#676C75',
    textMuted: '#9cadbc',
    textLink: '#11E3A3',
    textError: '#FF3B30',
  };
  
  export const FONTS = {
    primary: 'WorkSans',
    secondary: 'Poppins',
    weights: { light: '300', regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' },
  };
  
  export const TYPOGRAPHY = {
    pageTitle: { fontFamily: 'WorkSans-ExtraBold', fontSize: 48, lineHeight: 56, letterSpacing: -0.48, color: COLORS.sectionTitle },
    sectionHeader: { fontFamily: 'WorkSans-Light', fontSize: 35, lineHeight: 41, letterSpacing: -0.35, color: COLORS.sectionTitle },
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
    iconXs: 16, 
    iconSm: 20, 
    iconMd: 24, 
    iconLg: 32,
    
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
    button: { shadowColor: '#11E3A3', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
    buttonGradient: { shadowColor: '#11E3A3', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
    nav: { shadowColor: '#0A252F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 5 },
    navLight: { shadowColor: '#0A252F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 7, elevation: 3 },
    appBar: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    float: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 3 },
    inputFocus: { shadowColor: '#11E3A3', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 0 },
  };
  
  export const BORDERS = { none: 0, thin: 1, medium: 1.5, thick: 2, extraThick: 3 };
  
  export const ANIMATION = { fast: 150, normal: 200, slow: 300, verySlow: 500 };
  
  export const Z_INDEX = { base: 0, dropdown: 10, sticky: 20, fixed: 30, modal: 40, popover: 50, tooltip: 60 };
  
  const theme = { COLORS, DARK_COLORS, GRADIENTS, FORM, FONTS, TYPOGRAPHY, SPACING, SIZES, SHADOWS, BORDERS, ANIMATION, Z_INDEX };

  export default theme;