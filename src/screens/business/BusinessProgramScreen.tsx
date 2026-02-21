/**
 * BusinessProgramScreen
 * Manage business activities, schedule, and services (for Pro Business owners)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { KEYBOARD_BEHAVIOR } from '../../config/platform';

interface Activity {
  id: string;
  name: string;
  description?: string;
  category: string;
  duration_minutes: number;
  max_participants?: number;
  instructor?: string;
  color: string;
}

interface ScheduleSlot {
  id: string;
  activity_id: string;
  activity_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor?: string;
  color: string;
}

interface Tag {
  id: string;
  name: string;
  category: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ACTIVITY_CATEGORIES = [
  { id: 'fitness', name: 'Fitness', color: '#FF6B6B', icon: 'barbell' },
  { id: 'yoga', name: 'Yoga', color: '#9B59B6', icon: 'body' },
  { id: 'cardio', name: 'Cardio', color: '#3498DB', icon: 'heart' },
  { id: 'strength', name: 'Strength', color: '#E74C3C', icon: 'fitness' },
  { id: 'flexibility', name: 'Flexibility', color: '#2ECC71', icon: 'leaf' },
  { id: 'combat', name: 'Combat', color: '#E91E63', icon: 'hand-left' },
  { id: 'aqua', name: 'Aqua', color: '#00BCD4', icon: 'water' },
  { id: 'dance', name: 'Dance', color: '#FF9800', icon: 'musical-notes' },
];

const RECOMMENDED_TAGS = [
  'Beginner Friendly', 'All Levels', 'HIIT', 'Low Impact', 'High Intensity',
  'Morning Class', 'Evening Class', 'Weekend Only', 'Personal Training',
  'Group Class', 'Equipment Included', 'Bring Your Own Mat',
];

export default function BusinessProgramScreen({ navigation }: { navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void } }) {
  const { showError, showDestructiveConfirm, showWarning } = useSmuppyAlert();
  const { colors, isDark } = useTheme();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'activities' | 'schedule' | 'tags'>('activities');
  const [selectedDay, setSelectedDay] = useState(0);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Modal states
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [_editingSlot, setEditingSlot] = useState<ScheduleSlot | null>(null);

  // Form states
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityCategory, setActivityCategory] = useState('fitness');
  const [activityDuration, setActivityDuration] = useState('60');
  const [activityMaxParticipants, setActivityMaxParticipants] = useState('');
  const [activityInstructor, setActivityInstructor] = useState('');

  const [slotActivityId, setSlotActivityId] = useState('');
  const [slotStartTime, setSlotStartTime] = useState('09:00');
  const [slotEndTime, setSlotEndTime] = useState('10:00');
  const [slotInstructor, setSlotInstructor] = useState('');

  useEffect(() => {
    loadProgramData();
  }, []);

  const loadProgramData = async () => {
    try {
      const response = await awsAPI.getMyBusinessProgram();
      if (response.success) {
        setActivities((response.activities || []) as unknown as Activity[]);
        setSchedule((response.schedule || []) as unknown as ScheduleSlot[]);
        setTags(response.tags || []);
      }
    } catch (error) {
      if (__DEV__) console.warn('Load program error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveActivity = async () => {
    if (!activityName.trim()) {
      showError('Error', 'Please enter an activity name');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const categoryData = ACTIVITY_CATEGORIES.find(c => c.id === activityCategory);
      const activityData = {
        name: activityName.trim(),
        description: activityDescription.trim() || undefined,
        category: activityCategory,
        duration_minutes: Number.parseInt(activityDuration) || 60,
        max_participants: activityMaxParticipants ? Number.parseInt(activityMaxParticipants) : undefined,
        instructor: activityInstructor.trim() || undefined,
        color: categoryData?.color || '#FF6B6B',
      };

      let response;
      if (editingActivity) {
        response = await awsAPI.updateBusinessActivity(editingActivity.id, activityData);
      } else {
        response = await awsAPI.createBusinessActivity(activityData);
      }

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowActivityModal(false);
        resetActivityForm();
        loadProgramData();
      } else {
        throw new Error(response.message);
      }
    } catch (error: unknown) {
      showError('Error', (error as Error).message || 'Failed to save activity');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteActivity = (activity: Activity) => {
    showDestructiveConfirm(
      'Delete Activity',
      `Are you sure you want to delete "${activity.name}"?\n\nThis will also remove all scheduled slots for this activity.`,
      async () => {
        try {
          const response = await awsAPI.deleteBusinessActivity(activity.id);
          if (response.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadProgramData();
          }
        } catch (error: unknown) {
          showError('Error', (error as Error).message);
        }
      },
      'Delete'
    );
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setActivityName(activity.name);
    setActivityDescription(activity.description || '');
    setActivityCategory(activity.category);
    setActivityDuration(activity.duration_minutes.toString());
    setActivityMaxParticipants(activity.max_participants?.toString() || '');
    setActivityInstructor(activity.instructor || '');
    setShowActivityModal(true);
  };

  const resetActivityForm = () => {
    setEditingActivity(null);
    setActivityName('');
    setActivityDescription('');
    setActivityCategory('fitness');
    setActivityDuration('60');
    setActivityMaxParticipants('');
    setActivityInstructor('');
  };

  const handleSaveSlot = async () => {
    if (!slotActivityId) {
      showError('Error', 'Please select an activity');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const slotData = {
        activity_id: slotActivityId,
        day_of_week: selectedDay,
        start_time: slotStartTime,
        end_time: slotEndTime,
        instructor: slotInstructor.trim() || undefined,
      };

      const response = await awsAPI.createBusinessScheduleSlot(slotData);

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowScheduleModal(false);
        resetSlotForm();
        loadProgramData();
      } else {
        throw new Error(response.message);
      }
    } catch (error: unknown) {
      showError('Error', (error as Error).message || 'Failed to add slot');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSlot = (slot: ScheduleSlot) => {
    showDestructiveConfirm(
      'Remove Slot',
      `Remove "${slot.activity_name}" from ${DAYS[slot.day_of_week]}?`,
      async () => {
        try {
          const response = await awsAPI.deleteBusinessScheduleSlot(slot.id);
          if (response.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadProgramData();
          }
        } catch (error: unknown) {
          showError('Error', (error as Error).message);
        }
      },
      'Remove'
    );
  };

  const resetSlotForm = () => {
    setEditingSlot(null);
    setSlotActivityId('');
    setSlotStartTime('09:00');
    setSlotEndTime('10:00');
    setSlotInstructor('');
  };

  const handleToggleTag = async (tagName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existingTag = tags.find(t => t.name === tagName);

    try {
      if (existingTag) {
        // Remove tag
        await awsAPI.removeBusinessTag(existingTag.id);
        setTags(tags.filter(t => t.id !== existingTag.id));
      } else {
        // Add tag
        const response = await awsAPI.addBusinessTag({ name: tagName, category: 'general' });
        if (response.success && response.tag) {
          setTags([...tags, response.tag as unknown as Tag]);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('Toggle tag error:', error);
    }
  };

  // Extracted handlers
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleOpenActivityModal = useCallback(() => {
    resetActivityForm();
    setShowActivityModal(true);
  }, []);
  const handleCloseActivityModal = useCallback(() => setShowActivityModal(false), []);
  const handleOpenScheduleModal = useCallback(() => {
    if (activities.length === 0) {
      showWarning('No Activities', 'Please add activities first before creating a schedule.');
      return;
    }
    resetSlotForm();
    setShowScheduleModal(true);
  }, [activities.length, showWarning]);
  const handleCloseScheduleModal = useCallback(() => setShowScheduleModal(false), []);

  const getDaySlots = (day: number) => {
    return schedule.filter(s => s.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const renderActivityItem = ({ item }: { item: Activity }) => {
    const categoryData = ACTIVITY_CATEGORIES.find(c => c.id === item.category);
    return (
      <View style={styles.activityItem}>
        <View style={[styles.activityColor, { backgroundColor: item.color }]} />
        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityName}>{item.name}</Text>
            <View style={[styles.categoryBadge, { backgroundColor: item.color + '20' }]}>
              <Ionicons name={categoryData?.icon as keyof typeof Ionicons.glyphMap} size={12} color={item.color} />
              <Text style={[styles.categoryBadgeText, { color: item.color }]}>
                {categoryData?.name}
              </Text>
            </View>
          </View>
          <View style={styles.activityMeta}>
            <View style={styles.activityMetaItem}>
              <Ionicons name="time-outline" size={14} color={colors.gray} />
              <Text style={styles.activityMetaText}>{item.duration_minutes} min</Text>
            </View>
            {item.max_participants && (
              <View style={styles.activityMetaItem}>
                <Ionicons name="people-outline" size={14} color={colors.gray} />
                <Text style={styles.activityMetaText}>Max {item.max_participants}</Text>
              </View>
            )}
            {item.instructor && (
              <View style={styles.activityMetaItem}>
                <Ionicons name="person-outline" size={14} color={colors.gray} />
                <Text style={styles.activityMetaText}>{item.instructor}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.activityActions}>
          <TouchableOpacity style={styles.activityActionButton} onPress={() => handleEditActivity(item)}>
            <Ionicons name="pencil" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.activityActionButton} onPress={() => handleDeleteActivity(item)}>
            <Ionicons name="trash" size={18} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSlotItem = (slot: ScheduleSlot) => (
    <View key={slot.id} style={styles.slotItem}>
      <View style={[styles.slotColor, { backgroundColor: slot.color }]} />
      <View style={styles.slotContent}>
        <Text style={styles.slotTime}>{slot.start_time} - {slot.end_time}</Text>
        <Text style={styles.slotActivity}>{slot.activity_name}</Text>
        {slot.instructor && (
          <Text style={styles.slotInstructor}>with {slot.instructor}</Text>
        )}
      </View>
      <TouchableOpacity style={styles.slotDelete} onPress={() => handleDeleteSlot(slot)}>
        <Ionicons name="close-circle" size={22} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Program</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['activities', 'schedule', 'tags'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={(({ activities: 'fitness', schedule: 'calendar' } as Record<string, string>)[tab] ?? 'pricetags') as keyof typeof Ionicons.glyphMap}
                size={18}
                color={activeTab === tab ? '#fff' : colors.gray}
              />
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Activities Tab */}
          {activeTab === 'activities' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Activities ({activities.length})</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleOpenActivityModal}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>

              {activities.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="fitness-outline" size={48} color={colors.gray} />
                  <Text style={styles.emptyTitle}>No activities yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Add activities that your business offers
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={activities}
                  keyExtractor={(item) => item.id}
                  renderItem={renderActivityItem}
                  scrollEnabled={false}
                  contentContainerStyle={styles.activitiesList}
                />
              )}
            </View>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <View style={styles.tabContent}>
              {/* Day Selector */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.daySelector}
              >
                {DAYS.map((day, index) => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayButton, selectedDay === index && styles.dayButtonActive]}
                    onPress={() => setSelectedDay(index)}
                  >
                    <Text style={[styles.dayButtonText, selectedDay === index && styles.dayButtonTextActive]}>
                      {day.slice(0, 3)}
                    </Text>
                    <Text style={[styles.daySlotCount, selectedDay === index && styles.daySlotCountActive]}>
                      {getDaySlots(index).length}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Day Schedule */}
              <View style={styles.daySchedule}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{DAYS[selectedDay]}</Text>
                  <TouchableOpacity
                    style={[styles.addButton, activities.length === 0 && styles.addButtonDisabled]}
                    onPress={handleOpenScheduleModal}
                    disabled={activities.length === 0}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addButtonText}>Add Slot</Text>
                  </TouchableOpacity>
                </View>

                {getDaySlots(selectedDay).length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="calendar-outline" size={48} color={colors.gray} />
                    <Text style={styles.emptyTitle}>No classes scheduled</Text>
                    <Text style={styles.emptySubtitle}>
                      Add time slots for {DAYS[selectedDay]}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.slotsList}>
                    {getDaySlots(selectedDay).map(renderSlotItem)}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Tags Tab */}
          {activeTab === 'tags' && (
            <View style={styles.tabContent}>
              <Text style={styles.sectionTitle}>Search Tags</Text>
              <Text style={styles.sectionSubtitle}>
                Help users find your business through relevant tags
              </Text>

              <View style={styles.tagsContainer}>
                {RECOMMENDED_TAGS.map((tagName) => {
                  const isSelected = tags.some(t => t.name === tagName);
                  return (
                    <TouchableOpacity
                      key={tagName}
                      style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                      onPress={() => handleToggleTag(tagName)}
                    >
                      <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>
                        {tagName}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.selectedTagsInfo}>
                <Ionicons name="information-circle" size={18} color={colors.primary} />
                <Text style={styles.selectedTagsText}>
                  {tags.length} tag{tags.length !== 1 ? 's' : ''} selected • These will appear in search results
                </Text>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Activity Modal */}
      <Modal visible={showActivityModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.flexOne}
          behavior={KEYBOARD_BEHAVIOR}
          keyboardVerticalOffset={0}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingActivity ? 'Edit Activity' : 'New Activity'}
                </Text>
                <TouchableOpacity onPress={handleCloseActivityModal}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Activity Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={activityName}
                    onChangeText={setActivityName}
                    placeholder="e.g., Morning Yoga"
                    placeholderTextColor={colors.gray}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.categorySelector}>
                      {ACTIVITY_CATEGORIES.map((cat) => (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            styles.categorySelectorItem,
                            activityCategory === cat.id && { borderColor: cat.color },
                          ]}
                          onPress={() => setActivityCategory(cat.id)}
                        >
                          <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={20} color={cat.color} />
                          <Text style={styles.categorySelectorText}>{cat.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Duration (min)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={activityDuration}
                      onChangeText={setActivityDuration}
                      placeholder="60"
                      placeholderTextColor={colors.gray}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Max Participants</Text>
                    <TextInput
                      style={styles.formInput}
                      value={activityMaxParticipants}
                      onChangeText={setActivityMaxParticipants}
                      placeholder="Unlimited"
                      placeholderTextColor={colors.gray}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Default Instructor</Text>
                  <TextInput
                    style={styles.formInput}
                    value={activityInstructor}
                    onChangeText={setActivityInstructor}
                    placeholder="Optional"
                    placeholderTextColor={colors.gray}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Description</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    value={activityDescription}
                    onChangeText={setActivityDescription}
                    placeholder="Describe this activity..."
                    placeholderTextColor={colors.gray}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveActivity}
                  disabled={isSaving}
                >
                  <LinearGradient colors={GRADIENTS.primary} style={styles.saveGradient}>
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>
                        {editingActivity ? 'Save Changes' : 'Create Activity'}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Schedule Slot Modal */}
      <Modal visible={showScheduleModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.flexOne}
          behavior={KEYBOARD_BEHAVIOR}
          keyboardVerticalOffset={0}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Time Slot</Text>
                <TouchableOpacity onPress={handleCloseScheduleModal}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Activity *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.activitySelector}>
                      {activities.map((act) => (
                        <TouchableOpacity
                          key={act.id}
                          style={[
                            styles.activitySelectorItem,
                            slotActivityId === act.id && { borderColor: act.color, backgroundColor: act.color + '20' },
                          ]}
                          onPress={() => setSlotActivityId(act.id)}
                        >
                          <View style={[styles.activitySelectorDot, { backgroundColor: act.color }]} />
                          <Text style={styles.activitySelectorText}>{act.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Start Time</Text>
                    <TextInput
                      style={styles.formInput}
                      value={slotStartTime}
                      onChangeText={setSlotStartTime}
                      placeholder="09:00"
                      placeholderTextColor={colors.gray}
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>End Time</Text>
                    <TextInput
                      style={styles.formInput}
                      value={slotEndTime}
                      onChangeText={setSlotEndTime}
                      placeholder="10:00"
                      placeholderTextColor={colors.gray}
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Instructor (Override)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={slotInstructor}
                    onChangeText={setSlotInstructor}
                    placeholder="Use activity default"
                    placeholderTextColor={colors.gray}
                  />
                </View>

                <View style={styles.slotPreview}>
                  <Text style={styles.slotPreviewLabel}>Adding to:</Text>
                  <Text style={styles.slotPreviewDay}>{DAYS[selectedDay]}</Text>
                </View>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveSlot}
                  disabled={isSaving}
                >
                  <LinearGradient colors={GRADIENTS.primary} style={styles.saveGradient}>
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Add to Schedule</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    gap: 6,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray,
  },
  tabTextActive: {
    color: '#fff',
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tabContent: {},

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 4,
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Activities
  activitiesList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  activityColor: {
    width: 4,
  },
  activityContent: {
    flex: 1,
    padding: 14,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  activityMeta: {
    flexDirection: 'row',
    gap: 14,
  },
  activityMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityMetaText: {
    fontSize: 12,
    color: colors.gray,
  },
  activityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 4,
  },
  activityActionButton: {
    padding: 8,
  },

  // Schedule
  daySelector: {
    gap: 8,
    marginBottom: 16,
  },
  dayButton: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    minWidth: 60,
  },
  dayButtonActive: {
    backgroundColor: colors.primary,
  },
  dayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray,
  },
  dayButtonTextActive: {
    color: '#fff',
  },
  daySlotCount: {
    fontSize: 11,
    color: colors.gray,
    marginTop: 2,
  },
  daySlotCountActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  daySchedule: {},
  slotsList: {
    gap: 10,
  },
  slotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  slotColor: {
    width: 4,
    height: '100%',
  },
  slotContent: {
    flex: 1,
    padding: 14,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  slotActivity: {
    fontSize: 14,
    color: colors.grayLight,
  },
  slotInstructor: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 2,
  },
  slotDelete: {
    padding: 12,
  },

  // Tags
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tagChipSelected: {
    backgroundColor: 'rgba(14,191,138,0.1)',
    borderColor: colors.primary,
  },
  tagChipText: {
    fontSize: 13,
    color: colors.gray,
  },
  tagChipTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  selectedTagsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14,191,138,0.1)',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  selectedTagsText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  modalBlur: {
    backgroundColor: isDark ? 'rgba(20,20,35,0.95)' : 'rgba(255,255,255,0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalScroll: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  formTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  categorySelector: {
    flexDirection: 'row',
    gap: 10,
  },
  categorySelectorItem: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 6,
  },
  categorySelectorText: {
    fontSize: 12,
    color: colors.grayLight,
  },
  activitySelector: {
    flexDirection: 'row',
    gap: 10,
  },
  activitySelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  activitySelectorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activitySelectorText: {
    fontSize: 13,
    color: '#fff',
  },
  slotPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  slotPreviewLabel: {
    fontSize: 14,
    color: colors.gray,
  },
  slotPreviewDay: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  saveButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  saveGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  headerSpacer: {
    width: 40,
  },
  flexOne: {
    flex: 1,
  },
});
