import { StyleSheet } from 'react-native';
import { type ThemeColors } from '../../hooks/useTheme';
import { COLORS, SPACING } from '../../config/theme';

/**
 * Shared form constants for auth screens.
 * Ensures consistent capsule-style inputs and buttons.
 */
export const AUTH_FORM = {
  inputHeight: 56,
  inputRadius: 28,
  buttonHeight: 56,
  buttonRadius: 28,
} as const;

/**
 * Shared colors used across auth screens — now theme-aware.
 */
export const createAuthColors = (colors: ThemeColors, isDark: boolean) => ({
  primary: colors.primary,
  primaryDark: colors.primaryDark,
  dark: colors.dark,
  gray: colors.gray,
  grayLight: colors.grayMuted,
  border: colors.grayBorder,
  divider: colors.grayBorder,
  error: colors.error,
  errorBg: isDark ? 'rgba(239,68,68,0.15)' : COLORS.errorLight,
  errorInputBg: isDark ? 'rgba(239,68,68,0.08)' : COLORS.errorLight,
  successBg: isDark ? 'rgba(14,191,138,0.15)' : '#E6FAF8',
  focusBg: isDark ? 'rgba(14,191,138,0.08)' : '#F0FDFB',
  validBg: isDark ? 'rgba(14,191,138,0.15)' : '#E6FAF8',
}) as const;

/**
 * Shared styles for auth screens — now theme-aware via factory.
 */
export const createAuthStyles = (colors: ThemeColors, isDark: boolean) => {
  const ac = createAuthColors(colors, isDark);
  return StyleSheet.create({
    // Container
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.xl,
    },

    // Header
    headerContainer: {
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    title: {
      fontFamily: 'WorkSans-Bold',
      fontSize: 28,
      color: ac.dark,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    subtitle: {
      fontSize: 14,
      color: ac.gray,
      textAlign: 'center',
    },

    // Form inputs
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: ac.dark,
      marginBottom: 8,
    },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      height: AUTH_FORM.inputHeight,
      borderWidth: 1.5,
      borderColor: ac.border,
      borderRadius: AUTH_FORM.inputRadius,
      paddingHorizontal: 20,
      marginBottom: SPACING.md,
      backgroundColor: colors.background,
    },
    inputFocused: {
      borderColor: ac.primary,
      backgroundColor: ac.focusBg,
    },
    inputValid: {
      borderColor: ac.primary,
      backgroundColor: ac.validBg,
    },
    inputError: {
      borderColor: ac.error,
      backgroundColor: ac.errorInputBg,
      marginBottom: 4,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: ac.dark,
      marginLeft: 12,
    },
    errorText: {
      fontSize: 13,
      color: ac.error,
      marginBottom: SPACING.md,
      marginLeft: 8,
    },

    // Button
    btn: {
      height: AUTH_FORM.buttonHeight,
      borderRadius: AUTH_FORM.buttonRadius,
      marginBottom: SPACING.lg,
    },
    btnInner: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    btnText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '600',
    },

    // Divider
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: ac.divider,
    },
    dividerText: {
      paddingHorizontal: SPACING.sm,
      fontSize: 13,
      color: ac.gray,
    },

    // Social buttons
    socialBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: AUTH_FORM.buttonHeight,
      borderWidth: 1.5,
      borderColor: ac.divider,
      borderRadius: AUTH_FORM.buttonRadius,
      backgroundColor: colors.background,
      marginBottom: SPACING.sm,
      gap: 10,
    },
    socialBtnText: {
      fontSize: 15,
      fontWeight: '500',
      color: ac.dark,
    },
    socialBtnIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: ac.divider,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Checkbox
    checkbox: {
      width: 22,
      height: 22,
      borderWidth: 2,
      borderColor: ac.border,
      borderRadius: 6,
      marginRight: SPACING.sm,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    checkboxChecked: {
      backgroundColor: ac.primary,
      borderColor: ac.primary,
    },

    // Links
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    linkText: {
      fontSize: 14,
      color: ac.gray,
    },
    linkActive: {
      fontSize: 14,
      fontWeight: '600',
      color: ac.primary,
    },
    linkIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },

    // Footer
    footer: {
      alignItems: 'center',
      paddingTop: SPACING.sm,
    },

    // Back button
    backBtn: {
      width: 44,
      height: 44,
      backgroundColor: ac.dark,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
  });
};

/**
 * Get the appropriate icon color based on input state — now theme-aware.
 */
export const createGetInputIconColor = (ac: ReturnType<typeof createAuthColors>) =>
  (value: string, isValid: boolean, isFocused: boolean): string => {
    if (value.length > 0 && !isValid) return ac.error;
    if (isFocused) return ac.primary;
    return ac.grayLight;
  };

/**
 * Get gradient colors based on form validity — now theme-aware.
 */
export const createGetButtonGradient = (ac: ReturnType<typeof createAuthColors>) =>
  (isValid: boolean): [string, string] =>
    isValid
      ? [ac.primary, ac.primaryDark]
      : [ac.border, ac.border];

