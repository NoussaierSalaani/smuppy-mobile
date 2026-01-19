import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, GRADIENTS } from '../config/theme';

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
  // Create array of segments
  const segments = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      {/* Back Arrow - Simple thin arrow, not a button */}
      {showBackArrow && onBack ? (
        <TouchableOpacity
          style={[styles.backArrow, disabled && styles.disabled]}
          onPress={onBack}
          disabled={disabled}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={COLORS.dark} />
        </TouchableOpacity>
      ) : (
        <View style={styles.backArrowPlaceholder} />
      )}

      {/* Segmented Progress Bar - Full width below */}
      {showProgress && totalSteps > 0 && (
        <View style={styles.progressContainer}>
          {segments.map((step, index) => {
            const isCompleted = step <= currentStep;
            // Calculate gradient start/end based on segment position for continuous gradient effect
            const segmentStart = index / totalSteps;
            const segmentEnd = (index + 1) / totalSteps;

            return (
              <View
                key={step}
                style={[
                  styles.segment,
                  index < segments.length - 1 && styles.segmentMargin,
                ]}
              >
                {isCompleted ? (
                  <LinearGradient
                    colors={GRADIENTS.button}
                    start={{ x: -segmentStart / (segmentEnd - segmentStart), y: 0 }}
                    end={{ x: (1 - segmentStart) / (segmentEnd - segmentStart), y: 0 }}
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

const styles = StyleSheet.create({
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
    backgroundColor: COLORS.grayLight,
  },
});
