/**
 * Overlay Editor Component
 * Modern bottom sheet for adding and editing overlays
 */

import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFilters } from '../../stores/filterStore';
import { OverlayType, OverlayConfig, OverlayPosition } from '../types';
import { WorkoutTimer } from '../overlays/WorkoutTimer';
import { RepCounter } from '../overlays/RepCounter';
import { DayChallenge } from '../overlays/DayChallenge';
import { CalorieBurn } from '../overlays/CalorieBurn';
import { HeartRatePulse } from '../overlays/HeartRatePulse';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OverlayEditorProps {
  visible: boolean;
  onClose: () => void;
}

const OVERLAY_OPTIONS: { type: OverlayType; label: string; icon: string; description: string }[] = [
  { type: 'workout_timer', label: 'Timer', icon: 'timer-outline', description: 'Countdown or stopwatch' },
  { type: 'rep_counter', label: 'Rep Counter', icon: 'fitness-outline', description: 'Track your reps' },
  { type: 'day_challenge', label: 'Day Challenge', icon: 'calendar-outline', description: 'Day X/30 progress' },
  { type: 'calorie_burn', label: 'Calories', icon: 'flame-outline', description: 'Calorie counter' },
  { type: 'heart_rate_pulse', label: 'Heart Rate', icon: 'heart-outline', description: 'BPM display' },
];

export function OverlayEditor({ visible, onClose }: OverlayEditorProps) {
  const { colors, isDark } = useTheme();
  const { activeOverlays, addOverlay, removeOverlay, updateOverlayParams } = useFilters();
  const [editingOverlay, setEditingOverlay] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Handle add overlay
  const handleAddOverlay = useCallback((type: OverlayType) => {
    addOverlay(type, {
      x: 0.5,
      y: 0.12,
      scale: 1,
      rotation: 0,
    });
  }, [addOverlay]);

  // Handle remove overlay
  const handleRemoveOverlay = useCallback((overlayId: string) => {
    removeOverlay(overlayId);
    if (editingOverlay === overlayId) {
      setEditingOverlay(null);
    }
  }, [removeOverlay, editingOverlay]);

  // Get overlay label
  const getOverlayLabel = useCallback((type: OverlayType) => {
    return OVERLAY_OPTIONS.find(o => o.type === type)?.label || type;
  }, []);

  // Get overlay icon
  const getOverlayIcon = useCallback((type: OverlayType) => {
    return OVERLAY_OPTIONS.find(o => o.type === type)?.icon || 'shapes-outline';
  }, []);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          exiting={SlideOutDown.springify().damping(18)}
          style={styles.container}
        >
          <BlurView intensity={60} tint="dark" style={styles.blurContainer}>
            <View style={styles.innerContainer}>
              {/* Handle bar */}
              <View style={styles.handleBar} />

              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Overlays</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Add overlay section */}
              <Text style={styles.sectionTitle}>Add Overlay</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.addSection}
                contentContainerStyle={styles.addContent}
              >
                {OVERLAY_OPTIONS.map((option) => (
                  <OverlayOption
                    key={option.type}
                    option={option}
                    onPress={() => handleAddOverlay(option.type)}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </ScrollView>

              {/* Active overlays */}
              <Text style={styles.sectionTitle}>
                Active ({activeOverlays.length})
              </Text>
              <ScrollView
                style={styles.activeSection}
                contentContainerStyle={styles.activeSectionContent}
                showsVerticalScrollIndicator={false}
              >
                {activeOverlays.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="layers-outline" size={40} color={'rgba(255,255,255,0.3)'} />
                    <Text style={styles.emptyText}>No overlays added yet</Text>
                    <Text style={styles.emptySubtext}>Tap an overlay above to add it</Text>
                  </View>
                ) : (
                  activeOverlays.map((overlay) => (
                    <ActiveOverlayCard
                      key={overlay.id}
                      overlay={overlay}
                      label={getOverlayLabel(overlay.type)}
                      icon={getOverlayIcon(overlay.type)}
                      isEditing={editingOverlay === overlay.id}
                      onEdit={() => setEditingOverlay(
                        editingOverlay === overlay.id ? null : overlay.id
                      )}
                      onRemove={() => handleRemoveOverlay(overlay.id)}
                      onUpdateParams={(params) => updateOverlayParams(overlay.id, params)}
                      colors={colors}
                      styles={styles}
                    />
                  ))
                )}
              </ScrollView>
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Overlay Option Card
interface OverlayOptionProps {
  option: typeof OVERLAY_OPTIONS[0];
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function OverlayOption({ option, onPress, colors, styles }: OverlayOptionProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.9, { damping: 12 }, () => {
      scale.value = withSpring(1);
    });
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <Animated.View style={[styles.overlayOption, animatedStyle]}>
        <View style={styles.overlayOptionIcon}>
          <Ionicons name={option.icon as any} size={24} color={colors.primary} />
        </View>
        <Text style={styles.overlayOptionLabel}>{option.label}</Text>
        <Text style={styles.overlayOptionDesc} numberOfLines={1}>{option.description}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Active Overlay Card
interface ActiveOverlayCardProps {
  overlay: OverlayConfig;
  label: string;
  icon: string;
  isEditing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUpdateParams: (params: Record<string, unknown>) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function ActiveOverlayCard({
  overlay,
  label,
  icon,
  isEditing,
  onEdit,
  onRemove,
  onUpdateParams,
  colors,
  styles,
}: ActiveOverlayCardProps) {
  const params = overlay.params as Record<string, unknown>;

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeCardMain}>
        {/* Icon */}
        <View style={styles.activeCardIcon}>
          <Ionicons name={icon as any} size={20} color={colors.primary} />
        </View>

        {/* Info */}
        <View style={styles.activeCardInfo}>
          <Text style={styles.activeCardLabel}>{label}</Text>
          <Text style={styles.activeCardMeta}>Drag on screen to position</Text>
        </View>

        {/* Actions */}
        <TouchableOpacity onPress={onEdit} style={styles.editButton}>
          <Ionicons
            name={isEditing ? 'chevron-up' : 'settings-outline'}
            size={18}
            color={'rgba(255,255,255,0.6)'}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Ionicons name="trash-outline" size={18} color={'#FF5252'} />
        </TouchableOpacity>
      </View>

      {/* Edit panel */}
      {isEditing && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={styles.editPanel}
        >
          <OverlayEditFields
            type={overlay.type}
            params={params}
            onUpdate={onUpdateParams}
            colors={colors}
            styles={styles}
          />
        </Animated.View>
      )}
    </View>
  );
}

// Overlay Edit Fields
interface OverlayEditFieldsProps {
  type: OverlayType;
  params: Record<string, unknown>;
  onUpdate: (params: Record<string, unknown>) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function OverlayEditFields({ type, params, onUpdate, colors, styles }: OverlayEditFieldsProps) {
  switch (type) {
    case 'workout_timer':
      return (
        <View style={styles.editFields}>
          <EditField
            label="Duration (sec)"
            value={String(params.totalSeconds || 60)}
            onChangeText={(text) => {
              const value = parseInt(text, 10);
              if (!isNaN(value) && value > 0) {
                onUpdate({ totalSeconds: value, currentSeconds: value });
              }
            }}
            keyboardType="numeric"
            colors={colors}
            styles={styles}
          />
        </View>
      );

    case 'rep_counter':
      return (
        <View style={styles.editFields}>
          <EditField
            label="Exercise"
            value={String(params.exerciseName || 'Reps')}
            onChangeText={(text) => onUpdate({ exerciseName: text })}
            colors={colors}
            styles={styles}
          />
          <EditField
            label="Target"
            value={String(params.targetReps || 10)}
            onChangeText={(text) => {
              const value = parseInt(text, 10);
              if (!isNaN(value) && value > 0) {
                onUpdate({ targetReps: value });
              }
            }}
            keyboardType="numeric"
            colors={colors}
            styles={styles}
          />
        </View>
      );

    case 'day_challenge':
      return (
        <View style={styles.editFields}>
          <EditField
            label="Challenge"
            value={String(params.challengeName || 'Challenge')}
            onChangeText={(text) => onUpdate({ challengeName: text })}
            colors={colors}
            styles={styles}
          />
          <View style={styles.editFieldRow}>
            <EditField
              label="Day"
              value={String(params.currentDay || 1)}
              onChangeText={(text) => {
                const value = parseInt(text, 10);
                if (!isNaN(value) && value > 0) {
                  onUpdate({ currentDay: value });
                }
              }}
              keyboardType="numeric"
              small
              colors={colors}
              styles={styles}
            />
            <EditField
              label="Total"
              value={String(params.totalDays || 30)}
              onChangeText={(text) => {
                const value = parseInt(text, 10);
                if (!isNaN(value) && value > 0) {
                  onUpdate({ totalDays: value });
                }
              }}
              keyboardType="numeric"
              small
              colors={colors}
              styles={styles}
            />
          </View>
        </View>
      );

    case 'calorie_burn':
      return (
        <View style={styles.editFields}>
          <EditField
            label="Target Calories"
            value={String(params.targetCalories || 500)}
            onChangeText={(text) => {
              const value = parseInt(text, 10);
              if (!isNaN(value) && value > 0) {
                onUpdate({ targetCalories: value });
              }
            }}
            keyboardType="numeric"
            colors={colors}
            styles={styles}
          />
        </View>
      );

    case 'heart_rate_pulse':
      return (
        <View style={styles.editFields}>
          <EditField
            label="BPM"
            value={String(params.bpm || 120)}
            onChangeText={(text) => {
              const value = parseInt(text, 10);
              if (!isNaN(value) && value > 0 && value < 250) {
                onUpdate({ bpm: value });
              }
            }}
            keyboardType="numeric"
            colors={colors}
            styles={styles}
          />
        </View>
      );

    default:
      return null;
  }
}

// Edit Field Component
interface EditFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'numeric';
  small?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function EditField({ label, value, onChangeText, keyboardType = 'default', small, colors, styles }: EditFieldProps) {
  return (
    <View style={[styles.editField, small && styles.editFieldSmall]}>
      <Text style={styles.editFieldLabel}>{label}</Text>
      <TextInput
        style={styles.editFieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={'rgba(255,255,255,0.3)'}
        selectionColor={colors.primary}
      />
    </View>
  );
}

/**
 * Draggable Overlay Component
 */
interface DraggableOverlayProps {
  overlay: OverlayConfig;
  containerWidth: number;
  containerHeight: number;
  onPositionChange: (position: Partial<OverlayPosition>) => void;
}

export function DraggableOverlay({
  overlay,
  containerWidth,
  containerHeight,
  onPositionChange,
}: DraggableOverlayProps) {
  const translateX = useSharedValue(overlay.position.x * containerWidth);
  const translateY = useSharedValue(overlay.position.y * containerHeight);
  const scale = useSharedValue(overlay.position.scale);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = Math.max(0, Math.min(containerWidth, event.absoluteX));
      translateY.value = Math.max(0, Math.min(containerHeight, event.absoluteY));
    })
    .onEnd(() => {
      onPositionChange({
        x: translateX.value / containerWidth,
        y: translateY.value / containerHeight,
      });
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value - 60 },
        { translateY: translateY.value - 40 },
        { scale: scale.value },
      ] as const,
    };
  });

  // Render overlay content
  const renderContent = () => {
    const params = overlay.params as any;
    const size = 80;

    switch (overlay.type) {
      case 'workout_timer':
        return <WorkoutTimer params={params} size={size} />;
      case 'rep_counter':
        return <RepCounter params={params} size={size} />;
      case 'day_challenge':
        return <DayChallenge params={params} size={size} />;
      case 'calorie_burn':
        return <CalorieBurn params={params} size={size} />;
      case 'heart_rate_pulse':
        return <HeartRatePulse params={params} size={size} />;
      default:
        return null;
    }
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[draggableStyles.draggableOverlay, animatedStyle]}>
        {renderContent()}
      </Animated.View>
    </GestureDetector>
  );
}

// Static style for DraggableOverlay (doesn't need theme)
const draggableStyles = StyleSheet.create({
  draggableOverlay: {
    position: 'absolute',
    zIndex: 100,
  },
});

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    maxHeight: SCREEN_HEIGHT * 0.7,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  blurContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  innerContainer: {
    backgroundColor: 'rgba(20,20,30,0.95)',
    paddingBottom: 40,
  },

  // Handle
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },

  // Section
  sectionTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Add section
  addSection: {
    maxHeight: 120,
  },
  addContent: {
    paddingHorizontal: 16,
    gap: 10,
  },

  // Overlay option
  overlayOption: {
    width: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  overlayOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(0,230,118,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  overlayOptionLabel: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  overlayOptionDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    textAlign: 'center',
  },

  // Active section
  activeSection: {
    maxHeight: 250,
  },
  activeSectionContent: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 20,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginTop: 4,
  },

  // Active card
  activeCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  activeCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  activeCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,230,118,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  activeCardLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  activeCardMeta: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,82,82,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Edit panel
  editPanel: {
    padding: 14,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  editFields: {
    gap: 12,
  },
  editFieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  editField: {
    flex: 1,
  },
  editFieldSmall: {
    flex: 0.5,
  },
  editFieldLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  editFieldInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});
