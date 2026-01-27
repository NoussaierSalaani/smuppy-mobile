/**
 * Shared styles for Business screens
 * Reduces duplication across business-related components
 */

import { StyleSheet, Dimensions } from 'react-native';
import { DARK_COLORS as COLORS } from '../config/theme';

const { width } = Dimensions.get('window');

/**
 * Common header styles used across business screens
 */
export const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  rightPlaceholder: {
    width: 40,
  },
});

/**
 * Common button styles
 */
export const buttonStyles = StyleSheet.create({
  primary: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  secondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  disabled: {
    opacity: 0.5,
  },
});

/**
 * Common card styles
 */
export const cardStyles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
  },
  containerSmall: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});

/**
 * Common loading styles
 */
export const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  text: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 12,
  },
});

/**
 * Common empty state styles
 */
export const emptyStateStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray,
  },
});

/**
 * Common badge/chip styles
 */
export const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});

/**
 * Common info card styles (for tips, reminders, etc.)
 */
export const infoCardStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  text: {
    flex: 1,
    fontSize: 13,
  },
  primary: {
    backgroundColor: 'rgba(14,191,138,0.1)',
  },
  warning: {
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  error: {
    backgroundColor: 'rgba(255,107,107,0.1)',
  },
});

/**
 * Common modal styles
 */
export const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  content: {
    maxHeight: '90%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  blur: {
    backgroundColor: 'rgba(20,20,35,0.95)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});

/**
 * Common form styles
 */
export const formStyles = StyleSheet.create({
  group: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
});

/**
 * Common stat card styles
 */
export const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: COLORS.gray,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});

/**
 * Screen container style
 */
export const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
});

/**
 * Constants for consistent spacing and sizing
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

/**
 * Common colors used in business screens
 */
export const BUSINESS_COLORS = {
  success: '#0EBF8A',
  warning: '#FFD93D',
  error: '#FF6B6B',
  info: '#3498DB',
  premium: '#9B59B6',
  gold: '#FFD700',
};
