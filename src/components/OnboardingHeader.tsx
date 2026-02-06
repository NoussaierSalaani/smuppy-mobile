import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, GRADIENTS, HIT_SLOP } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

const SEGMENT_GAP = 4;

interface OnboardingHeaderProps {
  onBack?: () => void;
  disabled?: boolean;
  currentStep?: number;
  totalSteps?: number;
  showProgress?: boolean;
  showBackArrow?: boolean;
}

export default function OnboardingHeader({
  onBack,
  disabled = false,
  currentStep = 1,
  totalSteps = 5,
  showProgress = true,
  showBackArrow = true,
}: OnboardingHeaderProps) {
  const { colors } = useTheme();

  // Memoize segments to avoid recalculating on every render
  const segments = useMemo(() => {
    return Array.from({ length: totalSteps }, (_, index) => {
      const segmentStart = index / totalSteps;
      const segmentEnd = (index + 1) / totalSteps;
      return {
        index,
        isLast: index === totalSteps - 1,
        gradientStart: { x: -segmentStart / (segmentEnd - segmentStart), y: 0 },
        gradientEnd: { x: (1 - segmentStart) / (segmentEnd - segmentStart), y: 0 },
      };
    });
  }, [totalSteps]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {showBackArrow && onBack ? (
        <TouchableOpacity
          style={[styles.backArrow, disabled && styles.disabled]}
          onPress={onBack}
          disabled={disabled}
          activeOpacity={0.6}
          hitSlop={HIT_SLOP.medium}
        >
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </TouchableOpacity>
      ) : (
        <View style={styles.backArrowPlaceholder} />
      )}

      {showProgress && totalSteps > 0 && (
        <View style={styles.progressContainer}>
          {segments.map((segment) => {
            const isCompleted = segment.index < currentStep;
            return (
              <View
                key={segment.index}
                style={[styles.segment, !segment.isLast && styles.segmentMargin]}
              >
                {isCompleted ? (
                  <LinearGradient
                    colors={GRADIENTS.button}
                    start={segment.gradientStart}
                    end={segment.gradientEnd}
                    style={styles.segmentFill}
                  />
                ) : (
                  <View style={styles.segmentEmpty} />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  backArrow: {
    alignSelf: 'flex-start',
    padding: 4,
    marginLeft: -4,
    marginBottom: SPACING.sm,
  },
  backArrowPlaceholder: {
    height: 36,
    marginBottom: SPACING.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  progressContainer: {
    flexDirection: 'row',
    width: '100%',
    height: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  segmentMargin: {
    marginRight: SEGMENT_GAP,
  },
  segmentFill: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  segmentEmpty: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.grayLight,
  },
});
