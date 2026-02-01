/**
 * Filter Selector Component
 * Modern UI with glassmorphism design for filter selection
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeOut,
  SlideInDown,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useFilters } from '../../stores/filterStore';
import { FilterDefinition } from '../types';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

Dimensions.get('window');
const FILTER_ITEM_SIZE = 72;

interface FilterSelectorProps {
  onFilterChange?: (filterId: string | null) => void;
  onIntensityChange?: (intensity: number) => void;
  onOpenOverlays?: () => void;
  compact?: boolean;
}

type TabType = 'body' | 'lighting' | 'effects';

const TABS: { id: TabType; label: string; icon: string }[] = [
  { id: 'body', label: 'Body', icon: 'body-outline' },
  { id: 'lighting', label: 'Light', icon: 'sunny-outline' },
  { id: 'effects', label: 'FX', icon: 'sparkles-outline' },
];

export function FilterSelector({
  onFilterChange,
  onIntensityChange,
  onOpenOverlays,
  compact = false,
}: FilterSelectorProps) {
  const { colors, isDark } = useTheme();
  const {
    activeFilter,
    activeOverlays,
    setFilter,
    setFilterIntensity,
    clearFilter,
    getFiltersByCategory,
  } = useFilters();

  const [selectedTab, setSelectedTab] = useState<TabType>('body');

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Get filters for current tab
  const filters = useMemo(
    () => getFiltersByCategory(selectedTab),
    [selectedTab, getFiltersByCategory]
  );

  // Handle filter selection
  const handleFilterSelect = useCallback(
    (filter: FilterDefinition) => {
      if (activeFilter?.filterId === filter.id) {
        clearFilter();
        onFilterChange?.(null);
      } else {
        setFilter(filter.id, filter.defaultIntensity);
        onFilterChange?.(filter.id);
      }
    },
    [activeFilter, setFilter, clearFilter, onFilterChange]
  );

  // Handle intensity change
  const handleIntensityChange = useCallback(
    (value: number) => {
      setFilterIntensity(value);
      onIntensityChange?.(value);
    },
    [setFilterIntensity, onIntensityChange]
  );

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18)}
      style={[styles.container, compact && styles.containerCompact]}
    >
      {/* Glass background */}
      <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
        <View style={styles.innerContainer}>

          {/* Header with tabs and overlays button */}
          <View style={styles.header}>
            {/* Tabs */}
            <View style={styles.tabsContainer}>
              {TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  tab={tab}
                  isSelected={selectedTab === tab.id}
                  onPress={() => setSelectedTab(tab.id)}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>

            {/* Overlays button */}
            <TouchableOpacity
              style={[
                styles.overlaysButton,
                activeOverlays.length > 0 && styles.overlaysButtonActive,
              ]}
              onPress={onOpenOverlays}
              activeOpacity={0.7}
            >
              <Ionicons
                name="layers"
                size={18}
                color={activeOverlays.length > 0 ? colors.primary : colors.white}
              />
              {activeOverlays.length > 0 && (
                <View style={styles.overlaysBadge}>
                  <Text style={styles.overlaysBadgeText}>{activeOverlays.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Filter grid */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
            style={styles.filterScroll}
          >
            {/* None/Clear option */}
            <FilterCard
              filter={null}
              isSelected={!activeFilter}
              onPress={() => {
                clearFilter();
                onFilterChange?.(null);
              }}
              colors={colors}
              styles={styles}
            />

            {/* Filter cards */}
            {filters.map((filter) => (
              <FilterCard
                key={filter.id}
                filter={filter}
                isSelected={activeFilter?.filterId === filter.id}
                onPress={() => handleFilterSelect(filter)}
                colors={colors}
                styles={styles}
              />
            ))}
          </ScrollView>

          {/* Intensity slider */}
          {activeFilter && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={styles.sliderContainer}
            >
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Intensity</Text>
                <Text style={styles.sliderValue}>
                  {Math.round(activeFilter.intensity * 100)}%
                </Text>
              </View>
              <View style={styles.sliderTrack}>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={1}
                  value={activeFilter.intensity}
                  onValueChange={handleIntensityChange}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={'rgba(255,255,255,0.3)'}
                  thumbTintColor={colors.white}
                />
              </View>
            </Animated.View>
          )}
        </View>
      </BlurView>
    </Animated.View>
  );
}

// Tab Button Component
interface TabButtonProps {
  tab: { id: TabType; label: string; icon: string };
  isSelected: boolean;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function TabButton({ tab, isSelected, onPress, colors, styles }: TabButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.92, { damping: 15 }, () => {
      scale.value = withSpring(1);
    });
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <Animated.View
        style={[
          styles.tabButton,
          isSelected && styles.tabButtonSelected,
          animatedStyle,
        ]}
      >
        <Ionicons
          name={tab.icon as any}
          size={16}
          color={isSelected ? colors.dark : 'rgba(255,255,255,0.6)'}
        />
        <Text style={[styles.tabLabel, isSelected && styles.tabLabelSelected]}>
          {tab.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Filter Card Component
interface FilterCardProps {
  filter: FilterDefinition | null;
  isSelected: boolean;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function FilterCard({ filter, isSelected, onPress, colors, styles }: FilterCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.9, { damping: 12, stiffness: 200 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
      <Animated.View
        style={[
          styles.filterCard,
          isSelected && styles.filterCardSelected,
          animatedStyle,
        ]}
      >
        {/* Selection indicator */}
        {isSelected && (
          <View style={styles.selectionIndicator}>
            <Ionicons name="checkmark" size={12} color={colors.dark} />
          </View>
        )}

        {/* Icon */}
        <View style={[styles.filterIconContainer, isSelected && styles.filterIconContainerSelected]}>
          <Text style={styles.filterIcon}>
            {filter ? filter.icon : '✕'}
          </Text>
        </View>

        {/* Label */}
        <Text
          style={[styles.filterName, isSelected && styles.filterNameSelected]}
          numberOfLines={1}
        >
          {filter ? filter.name : 'None'}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    marginHorizontal: 12,
    borderRadius: 24,
    overflow: 'hidden',
  },
  containerCompact: {
    marginHorizontal: 8,
  },
  blurContainer: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  innerContainer: {
    backgroundColor: 'rgba(20,20,30,0.85)',
    paddingVertical: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  tabButtonSelected: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelSelected: {
    color: colors.dark,
  },

  // Overlays button
  overlaysButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  overlaysButtonActive: {
    backgroundColor: 'rgba(0,230,118,0.15)',
    borderColor: colors.primary,
  },
  overlaysBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlaysBadgeText: {
    color: colors.dark,
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Filter scroll
  filterScroll: {
    maxHeight: FILTER_ITEM_SIZE + 28,
  },
  filterScrollContent: {
    paddingHorizontal: 12,
    gap: 10,
  },

  // Filter card
  filterCard: {
    width: FILTER_ITEM_SIZE,
    height: FILTER_ITEM_SIZE + 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  filterCardSelected: {
    backgroundColor: 'rgba(0,230,118,0.12)',
    borderColor: colors.primary,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  filterIconContainerSelected: {
    backgroundColor: 'rgba(0,230,118,0.2)',
  },
  filterIcon: {
    fontSize: 24,
  },
  filterName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  filterNameSelected: {
    color: colors.primary,
  },

  // Slider
  sliderContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sliderValue: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  sliderTrack: {
    height: 36,
    justifyContent: 'center',
  },
  slider: {
    width: '100%',
    height: 36,
  },
});
