/**
 * SelectChip — shared chip component for settings edit screens.
 *
 * Encapsulates the selected/unselected chip UI pattern used by:
 *   - EditInterestsScreen (multi-select, "close" icon)
 *   - EditExpertiseScreen (multi-select, "close" icon)
 *   - EditBusinessCategoryScreen (single-select, "checkmark-circle" icon)
 *
 * This is a "dumb" presentational component — no state, no selection logic.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GRADIENTS } from '../../config/theme';
import type { ThemeColors } from '../../hooks/useTheme';

export type SelectChipProps = Readonly<{
  label: string;
  icon: string;
  iconColor: string;
  selected: boolean;
  onPress: () => void;
  /** Size variant: 'sm' = 36px (interests/expertise), 'md' = 40px (business category). Default: 'sm' */
  size?: 'sm' | 'md';
  /** Icon shown when selected: 'close' (multi-select) or 'checkmark' (single-select). Default: 'close' */
  selectedIndicator?: 'close' | 'checkmark';
  /** Theme colors — required for styling */
  colors: ThemeColors;
  /** Dark mode flag */
  isDark: boolean;
}>;

function SelectChipComponent({
  label,
  icon,
  iconColor,
  selected,
  onPress,
  size = 'sm',
  selectedIndicator = 'close',
  colors,
  isDark,
}: SelectChipProps) {
  const isMd = size === 'md';
  const chipHeight = isMd ? 40 : 36;
  const borderRadius = isMd ? 20 : 18;
  const innerRadius = isMd ? 18.5 : 16.5;
  const iconSize = isMd ? 18 : 16;

  if (selected) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <LinearGradient
          colors={GRADIENTS.button}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientBorder, { height: chipHeight, borderRadius }]}
        >
          <View
            style={[
              styles.selectedInner,
              {
                borderRadius: innerRadius,
                backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : '#E6FAF8',
              },
            ]}
          >
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={iconSize} color={iconColor} />
            <Text style={[styles.chipText, { color: colors.dark }]}>{label}</Text>
            {selectedIndicator === 'close' ? (
              <Ionicons name="close" size={14} color={colors.gray} style={styles.trailingIcon} />
            ) : (
              <Ionicons name="checkmark-circle" size={16} color={colors.primaryGreen} style={styles.trailingIcon} />
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          height: chipHeight,
          borderRadius,
          backgroundColor: isDark ? colors.backgroundSecondary : colors.white,
          borderColor: colors.grayBorder,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={iconSize} color={iconColor} />
      <Text style={[styles.chipText, { color: colors.dark }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const SelectChip = React.memo(SelectChipComponent);

const styles = StyleSheet.create({
  gradientBorder: {
    padding: 1.5,
  },
  selectedInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12.5,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  trailingIcon: {
    marginLeft: 2,
  },
});
