/**
 * Shared List Screen Styles
 *
 * Common style definitions used across list-based screens that share
 * a header (back button + title + spacer), loading state, user rows,
 * and empty states (icon container + title + subtitle).
 *
 * Consumed by: UserManagementListScreen, FollowRequestsScreen, and
 * any future screens with the same header/list/empty layout.
 */

import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../hooks/useTheme';

/**
 * Build the shared style definitions for header, loading, user rows, and empty states.
 */
export function createListScreenStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    /* ---------- Layout ---------- */
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    /* ---------- Header ---------- */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.grayBorder,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: 'WorkSans-SemiBold',
      color: colors.dark,
    },
    headerSpacer: {
      width: 40,
    },

    /* ---------- Loading ---------- */
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    /* ---------- User row ---------- */
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.grayBorder,
    },
    userDetails: {
      marginLeft: 12,
      flex: 1,
    },
    userName: {
      fontSize: 16,
      fontFamily: 'WorkSans-SemiBold',
      color: colors.dark,
    },

    /* ---------- Empty state ---------- */
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? colors.backgroundSecondary : colors.grayLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: 'WorkSans-SemiBold',
      color: colors.dark,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: 'Poppins-Regular',
      color: colors.gray,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}

/** The type returned by createListScreenStyles — useful for typing style props. */
export type ListScreenStyles = ReturnType<typeof createListScreenStyles>;
