/**
 * AddReviewSheet
 * Bottom sheet for adding a review to a spot, business, event, or live.
 * Includes star rating, text comment, photo upload, and quality checkboxes.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GRADIENTS } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { useSmuppyAlert } from '../context/SmuppyAlertContext';
import QualityPicker from './QualityPicker';

import { normalize, hp, wp, SCREEN_HEIGHT } from '../utils/responsive';
import { KEYBOARD_BEHAVIOR } from '../config/platform';

// ============================================
// TYPES
// ============================================

export interface ReviewData {
  rating: number;
  comment: string;
  qualities: string[];
  photos: string[];
}

type AddReviewSheetProps = Readonly<{
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: ReviewData) => void;
  /** Target name for display (e.g. "Parc Lafontaine Trail") */
  targetName: string;
  /** Category for quality picker (e.g. "hiking", "running") */
  category?: string;
  /** Show quality picker */
  showQualities?: boolean;
  /** Loading state */
  isSubmitting?: boolean;
}>;

// ============================================
// COMPONENT
// ============================================

export default function AddReviewSheet({
  visible,
  onClose,
  onSubmit,
  targetName,
  category = 'general',
  showQualities = true,
  isSubmitting = false,
}: AddReviewSheetProps) {
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [qualities, setQualities] = useState<string[]>([]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleStarPress = useCallback((star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRating(star);
  }, []);

  const handleSubmit = useCallback(() => {
    if (rating === 0) {
      showError('Rating required', 'Please select a star rating');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit({ rating, comment: comment.trim(), qualities, photos: [] });
    // Reset
    setRating(0);
    setComment('');
    setQualities([]);
  }, [rating, comment, qualities, onSubmit, showError]);

  const handleClose = useCallback(() => {
    setRating(0);
    setComment('');
    setQualities([]);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={KEYBOARD_BEHAVIOR}
          style={styles.keyboardView}
        >
          <View
            style={[styles.sheet, { paddingBottom: insets.bottom + hp(2) }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.handle} />

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <Text style={styles.title}>Add Review</Text>
              <Text style={styles.targetName}>{targetName}</Text>

              {/* Star Rating */}
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => handleStarPress(star)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={normalize(36)}
                      color={star <= rating ? '#FFD700' : colors.gray}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.ratingLabel}>
                {rating === 0 ? 'Tap to rate' :
                 rating === 1 ? 'Poor' :
                 rating === 2 ? 'Fair' :
                 rating === 3 ? 'Good' :
                 rating === 4 ? 'Very Good' : 'Excellent'}
              </Text>

              {/* Comment */}
              <TextInput
                style={styles.commentInput}
                placeholder="Share your experience..."
                placeholderTextColor={colors.gray}
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{comment.length}/500</Text>

              {/* Qualities */}
              {showQualities && (
                <QualityPicker
                  category={category}
                  selected={qualities}
                  onSelectionChange={setQualities}
                />
              )}

              {/* Submit */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSubmit}
                disabled={isSubmitting || rating === 0}
              >
                <LinearGradient
                  colors={rating === 0 ? [colors.gray, colors.gray] : GRADIENTS.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitButton}
                >
                  <Text style={styles.submitText}>
                    {isSubmitting ? 'Submitting...' : 'Submit Review'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================
// STYLES
// ============================================

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: normalize(28),
    borderTopRightRadius: normalize(28),
    padding: wp(5),
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  handle: {
    width: wp(10),
    height: 4,
    backgroundColor: colors.gray,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: hp(2),
  },
  title: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: colors.dark,
  },
  targetName: {
    fontSize: normalize(14),
    color: colors.gray,
    marginTop: 4,
    marginBottom: hp(2),
  },

  // Stars
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: normalize(14),
    color: colors.gray,
    textAlign: 'center',
    marginBottom: hp(2),
  },

  // Comment
  commentInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: normalize(14),
    padding: 14,
    fontSize: normalize(14),
    color: colors.dark,
    minHeight: 100,
    marginBottom: 4,
  },
  charCount: {
    fontSize: normalize(11),
    color: colors.gray,
    textAlign: 'right',
    marginBottom: hp(1.5),
  },

  // Submit
  submitButton: {
    paddingVertical: hp(1.8),
    borderRadius: normalize(14),
    alignItems: 'center',
    marginTop: hp(2),
  },
  submitText: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: colors.white,
  },
});
