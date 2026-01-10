import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, BORDERS } from '../config/theme';

/**
 * TabBar Component (Top Navigation Tabs)
 * 
 * @param {array} tabs - Array of tab objects { key, label, icon }
 * @param {string} activeTab - Currently active tab key
 * @param {function} onTabChange - Tab change handler
 * @param {string} variant - 'underline' | 'pill' | 'segment'
 * @param {boolean} scrollable - Enable horizontal scrolling
 * @param {object} style - Additional styles
 */
export default function TabBar({
  tabs = [],
  activeTab,
  onTabChange,
  variant = 'underline',
  scrollable = false,
  style,
}) {
  // Render single tab
  const renderTab = (tab, index) => {
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
              color={isActive ? COLORS.primary : COLORS.dark}
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
              color={isActive ? COLORS.primary : COLORS.gray}
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
  const getContainerStyle = () => {
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

const styles = StyleSheet.create({
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
    borderBottomColor: COLORS.primary,
  },
  tabTextUnderline: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.dark,
    textAlign: 'center',
  },
  tabTextUnderlineActive: {
    color: COLORS.primary,
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
    backgroundColor: COLORS.backgroundSecondary,
  },
  tabPillActive: {
    backgroundColor: COLORS.backgroundFocus,
  },
  tabTextPill: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: COLORS.gray,
  },
  tabTextPillActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Segment variant
  containerSegment: {
    flexDirection: 'row',
    borderWidth: BORDERS.thin,
    borderColor: COLORS.grayLight,
    borderRadius: SIZES.radiusLg,
    padding: 4,
    backgroundColor: COLORS.white,
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
    backgroundColor: COLORS.cyan,
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
    color: COLORS.dark,
    textAlign: 'center',
  },
  tabTextSegmentActive: {
    color: COLORS.white,
  },

  // Common
  tabIcon: {
    marginRight: 4,
  },
});
