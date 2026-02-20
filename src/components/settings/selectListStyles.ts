/**
 * Shared styles for settings edit-list screens.
 *
 * Extracts the identical StyleSheet blocks from:
 *   - EditInterestsScreen
 *   - EditExpertiseScreen
 *   - EditBusinessCategoryScreen
 *
 * Each screen calls createSelectListStyles(colors, isDark) to get the
 * common layout styles, then adds screen-specific extras if needed.
 */

import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../hooks/useTheme';

export const createSelectListStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    // Container
    container: { flex: 1, backgroundColor: colors.background },

    // Header row
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.dark,
    },

    // Save button
    saveButton: {
      backgroundColor: colors.primaryGreen,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      minWidth: 70,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      backgroundColor: isDark ? colors.darkGray : colors.grayLight,
    },
    saveButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.white,
    },
    saveButtonTextDisabled: {
      color: colors.grayMuted,
    },

    // Count / hint
    countContainer: {
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    countText: {
      fontSize: 14,
      color: colors.grayMuted,
    },
    hintText: {
      fontSize: 12,
      color: isDark ? colors.gray : '#8E8E93',
      marginTop: 4,
    },

    // Scroll
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

    // Section (for grouped lists)
    section: { marginBottom: 20 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.grayBorder,
    },
    sectionIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.dark },
    sectionCount: { fontSize: 14, fontWeight: '600', color: colors.primaryGreen },

    // Items grid
    itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12 },

    // Bottom spacer
    bottomSpacer: { height: 40 },
  });
