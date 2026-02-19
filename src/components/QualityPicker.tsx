/**
 * QualityPicker
 * Dynamic checkbox grid for spot/review qualities based on category.
 * Displays relevant quality attributes (e.g. "Shade", "Parking", "Lighting")
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { SPOT_QUALITIES } from '../types';

import { normalize } from '../utils/responsive';

interface QualityPickerProps {
  /** Sport type or category key to determine which qualities to show */
  category: string;
  /** Currently selected qualities */
  selected: string[];
  /** Callback when selection changes */
  onSelectionChange: (qualities: string[]) => void;
}

function QualityPicker({ category, selected, onSelectionChange }: QualityPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const key = category.toLowerCase().replaceAll(/\s+/g, '_');
  const qualities = SPOT_QUALITIES[key] || SPOT_QUALITIES.general || [];

  const toggle = (quality: string) => {
    if (selected.includes(quality)) {
      onSelectionChange(selected.filter(q => q !== quality));
    } else {
      onSelectionChange([...selected, quality]);
    }
  };

  if (qualities.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Qualities</Text>
      <Text style={styles.subtitle}>Select what applies to this spot</Text>
      <View style={styles.grid}>
        {qualities.map(quality => {
          const isActive = selected.includes(quality);
          return (
            <TouchableOpacity
              key={quality}
              activeOpacity={0.8}
              onPress={() => toggle(quality)}
            >
              {isActive ? (
                <LinearGradient
                  colors={GRADIENTS.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chip}
                >
                  <Ionicons name="checkmark" size={normalize(14)} color={colors.white} />
                  <Text style={[styles.chipText, { color: colors.white }]}>{quality}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.chipInactive}>
                  <Text style={styles.chipText}>{quality}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(QualityPicker);

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  title: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: normalize(13),
    color: colors.gray,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: normalize(20),
    gap: 6,
  },
  chipInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: normalize(20),
    backgroundColor: colors.backgroundSecondary,
  },
  chipText: {
    fontSize: normalize(13),
    fontWeight: '500',
    color: colors.dark,
  },
});
