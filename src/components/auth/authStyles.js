import { StyleSheet } from 'react-native';
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
};

/**
 * Shared colors used across auth screens.
 */
export const AUTH_COLORS = {
  primary: '#00cdb5',
  primaryDark: '#0066ac',
  dark: '#0a252f',
  gray: '#676C75',
  grayLight: '#9cadbc',
  border: '#CED3D5',
  divider: '#E5E7EB',
  error: '#FF3B30',
  errorBg: '#FEE2E2',
  errorInputBg: '#FEF2F2',
  successBg: '#E6FAF8',
  focusBg: '#F0FDFB',
  validBg: '#E6FAF8',
};

/**
 * Shared styles for auth screens.
 * Import and spread these in your screen's StyleSheet.
 */
export const authStyles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
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
    color: AUTH_COLORS.dark,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: AUTH_COLORS.gray,
    textAlign: 'center',
  },

  // Form inputs
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: AUTH_COLORS.dark,
    marginBottom: 8,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: AUTH_FORM.inputHeight,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.border,
    borderRadius: AUTH_FORM.inputRadius,
    paddingHorizontal: 20,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.white,
  },
  inputFocused: {
    borderColor: AUTH_COLORS.primary,
    backgroundColor: AUTH_COLORS.focusBg,
  },
  inputValid: {
    borderColor: AUTH_COLORS.primary,
    backgroundColor: AUTH_COLORS.validBg,
  },
  inputError: {
    borderColor: AUTH_COLORS.error,
    backgroundColor: AUTH_COLORS.errorInputBg,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: AUTH_COLORS.dark,
    marginLeft: 12,
  },
  errorText: {
    fontSize: 13,
    color: AUTH_COLORS.error,
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
    color: COLORS.white,
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
    backgroundColor: AUTH_COLORS.divider,
  },
  dividerText: {
    paddingHorizontal: SPACING.sm,
    fontSize: 13,
    color: AUTH_COLORS.gray,
  },

  // Social buttons
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: AUTH_FORM.buttonHeight,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.divider,
    borderRadius: AUTH_FORM.buttonRadius,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.sm,
    gap: 10,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: AUTH_COLORS.dark,
  },
  socialBtnIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AUTH_COLORS.divider,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Checkbox
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: AUTH_COLORS.border,
    borderRadius: 6,
    marginRight: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  checkboxChecked: {
    backgroundColor: AUTH_COLORS.primary,
    borderColor: AUTH_COLORS.primary,
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
    color: AUTH_COLORS.gray,
  },
  linkActive: {
    fontSize: 14,
    fontWeight: '600',
    color: AUTH_COLORS.primary,
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
    backgroundColor: AUTH_COLORS.dark,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
});

/**
 * Get the appropriate icon color based on input state.
 */
export const getInputIconColor = (value, isValid, isFocused) => {
  if (value.length > 0 && !isValid) return AUTH_COLORS.error;
  if (isFocused) return AUTH_COLORS.primary;
  return AUTH_COLORS.grayLight;
};

/**
 * Get gradient colors based on form validity.
 */
export const getButtonGradient = (isValid) =>
  isValid
    ? [AUTH_COLORS.primary, AUTH_COLORS.primaryDark]
    : [AUTH_COLORS.border, AUTH_COLORS.border];
