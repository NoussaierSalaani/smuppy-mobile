import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SIZES, BORDERS } from '../config/theme';
import { useTheme } from '../hooks/useTheme';

type TabBarVariant = 'underline' | 'pill' | 'segment';

interface Tab {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface TabBarProps {
  tabs?: Tab[];
  activeTab?: string;
  onTabChange: (key: string) => void;
  variant?: TabBarVariant;
  scrollable?: boolean;
  style?: ViewStyle;
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  // Underline variant
  containerUnderline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 32,
    paddingVertical: 2,
    paddingBottom: 1,
    height: SIZES.tabNavHeight,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  tabUnderline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    gap: 4,
  },
  tabUnderlineActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabTextUnderline: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 18,
    color: colors.dark,
    textAlign: 'center',
  },
  tabTextUnderlineActive: {
    color: colors.primary,
  },

  // Pill variant
  containerPill: {
    flexDirection: 'row',
    paddingHorizontal: SIZES.screenPaddingLg,
    gap: 10,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
  },
  tabPillActive: {
    backgroundColor: colors.backgroundFocus,
  },
  tabTextPill: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.gray,
  },
  tabTextPillActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  // Segment variant
  containerSegment: {
    flexDirection: 'row',
    borderWidth: BORDERS.thin,
    borderColor: colors.grayLight,
    borderRadius: SIZES.radiusLg,
    padding: 4,
    backgroundColor: colors.white,
  },
  tabSegment: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: SIZES.radiusLg,
  },
  tabSegmentActive: {
    backgroundColor: colors.cyan,
  },
  tabSegmentFirst: {
    borderTopLeftRadius: SIZES.radiusLg,
    borderBottomLeftRadius: SIZES.radiusLg,
  },
  tabSegmentLast: {
    borderTopRightRadius: SIZES.radiusLg,
    borderBottomRightRadius: SIZES.radiusLg,
  },
  tabTextSegment: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.dark,
    textAlign: 'center',
  },
  tabTextSegmentActive: {
    color: colors.white,
  },

  // Common
  tabIcon: {
    marginRight: 4,
  },
});

/**
 * TabBar Component (Top Navigation Tabs)
 */
export default function TabBar({
  tabs = [],
  activeTab,
  onTabChange,
  variant = 'underline',
  scrollable = false,
  style,
}: TabBarProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Render single tab
  const renderTab = (tab: Tab, index: number): React.JSX.Element | null => {
    const isActive = activeTab === tab.key;

    // Underline variant (default)
    if (variant === 'underline') {
      return (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tabUnderline,
            isActive && styles.tabUnderlineActive,
          ]}
          onPress={() => onTabChange(tab.key)}
          activeOpacity={0.7}
        >
          {tab.icon && (
            <Ionicons
              name={tab.icon}
              size={SIZES.iconMd}
              color={isActive ? colors.primary : colors.dark}
              style={styles.tabIcon}
            />
          )}
          <Text
            style={[
              styles.tabTextUnderline,
              isActive && styles.tabTextUnderlineActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      );
    }

    // Pill variant
    if (variant === 'pill') {
      return (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tabPill,
            isActive && styles.tabPillActive,
          ]}
          onPress={() => onTabChange(tab.key)}
          activeOpacity={0.7}
        >
          {tab.icon && (
            <Ionicons
              name={tab.icon}
              size={18}
              color={isActive ? colors.primary : colors.gray}
              style={styles.tabIcon}
            />
          )}
          <Text
            style={[
              styles.tabTextPill,
              isActive && styles.tabTextPillActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      );
    }

    // Segment variant
    if (variant === 'segment') {
      return (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tabSegment,
            isActive && styles.tabSegmentActive,
            index === 0 && styles.tabSegmentFirst,
            index === tabs.length - 1 && styles.tabSegmentLast,
          ]}
          onPress={() => onTabChange(tab.key)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabTextSegment,
              isActive && styles.tabTextSegmentActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  // Container based on variant
  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'underline':
        return styles.containerUnderline;
      case 'pill':
        return styles.containerPill;
      case 'segment':
        return styles.containerSegment;
      default:
        return styles.containerUnderline;
    }
  };

  // Scrollable tabs
  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[getContainerStyle(), style]}
      >
        {tabs.map((tab, index) => renderTab(tab, index))}
      </ScrollView>
    );
  }

  // Static tabs
  return (
    <View style={[getContainerStyle(), style]}>
      {tabs.map((tab, index) => renderTab(tab, index))}
    </View>
  );
}
