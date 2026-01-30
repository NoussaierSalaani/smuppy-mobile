/**
 * CreateChallengeScreen
 * Create a new Peak Challenge
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

const { width } = Dimensions.get('window');

interface ChallengeType {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
}

const CHALLENGE_TYPES: ChallengeType[] = [
  {
    id: '1',
    name: 'Fitness',
    slug: 'fitness',
    icon: '💪',
    color: '#FF6B35',
    description: 'Pushups, squats, planks...',
  },
  {
    id: '2',
    name: 'Dance',
    slug: 'dance',
    icon: '💃',
    color: '#E91E63',
    description: 'Show your moves!',
  },
  {
    id: '3',
    name: 'Talent',
    slug: 'talent',
    icon: '🎯',
    color: '#9C27B0',
    description: 'Skills, tricks, talents',
  },
  {
    id: '4',
    name: 'Comedy',
    slug: 'comedy',
    icon: '😂',
    color: '#FF9800',
    description: 'Make them laugh!',
  },
  {
    id: '5',
    name: 'Food',
    slug: 'food',
    icon: '🍔',
    color: '#4CAF50',
    description: 'Cooking, eating challenges',
  },
  {
    id: '6',
    name: 'Music',
    slug: 'music',
    icon: '🎵',
    color: '#2196F3',
    description: 'Sing, play, perform',
  },
  {
    id: '7',
    name: 'Art',
    slug: 'art',
    icon: '🎨',
    color: '#00BCD4',
    description: 'Drawing, painting, crafts',
  },
  {
    id: '8',
    name: 'Other',
    slug: 'other',
    icon: '✨',
    color: '#607D8B',
    description: 'Anything goes!',
  },
];

const DURATION_OPTIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '3min', value: 180 },
  { label: 'No limit', value: 0 },
];

const EXPIRY_OPTIONS = [
  { label: '24h', value: 24 },
  { label: '48h', value: 48 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
  { label: 'Never', value: 0 },
];

export default function CreateChallengeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { formatAmount } = useCurrency();
  const { showError, showAlert } = useSmuppyAlert();

  // If creating from an existing Peak
  const existingPeakId = route.params?.peakId;

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<ChallengeType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [duration, setDuration] = useState(30);
  const [expiry, setExpiry] = useState(168); // 7 days default
  const [isPublic, setIsPublic] = useState(true);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stepAnim = useRef(new Animated.Value(0)).current;

  const animateStep = (newStep: number) => {
    Animated.spring(stepAnim, {
      toValue: newStep - 1,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (step === 1 && !selectedType) {
      showError('Select Type', 'Please select a challenge type');
      return;
    }

    if (step === 2 && !title.trim()) {
      showError('Add Title', 'Please give your challenge a title');
      return;
    }

    if (step < 3) {
      animateStep(step + 1);
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animateStep(step - 1);
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    if (!selectedType) return;

    setIsSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const response = await awsAPI.createChallenge({
        peakId: existingPeakId || '',
        challengeTypeId: selectedType.id,
        title: title.trim(),
        description: description.trim() || undefined,
        rules: rules.trim() || undefined,
        durationSeconds: duration || undefined,
        isPublic: isPublic,
        tipsEnabled: tipsEnabled,
        endsAt:
          expiry > 0 ? new Date(Date.now() + expiry * 60 * 60 * 1000).toISOString() : undefined,
        taggedUserIds: taggedUsers.length > 0 ? taggedUsers : undefined,
      });

      if (response.success) {
        showAlert({
          title: 'Challenge Created!',
          message: 'Your challenge is now live',
          type: 'success',
          buttons: [
            {
              text: 'View Challenge',
              onPress: () => {
                navigation.replace('ChallengeDetail', { challengeId: response.challenge.id });
              },
            },
            {
              text: 'Record Peak',
              onPress: () => {
                navigation.replace('RecordPeak', { challengeId: response.challenge.id });
              },
            },
          ],
        });
      } else {
        showError('Error', response.message || 'Failed to create challenge');
      }
    } catch (error) {
      console.error('Create challenge error:', error);
      showError('Error', 'Failed to create challenge. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What type of challenge?</Text>
      <Text style={styles.stepSubtitle}>Choose a category for your challenge</Text>

      <View style={styles.typeGrid}>
        {CHALLENGE_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeCard,
              selectedType?.id === type.id && { borderColor: type.color, borderWidth: 2 },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setSelectedType(type);
            }}
          >
            <LinearGradient
              colors={
                selectedType?.id === type.id ? [type.color, `${type.color}99`] : ['#2a2a3e', '#1a1a2e']
              }
              style={styles.typeCardGradient}
            >
              <Text style={styles.typeIcon}>{type.icon}</Text>
              <Text style={styles.typeName}>{type.name}</Text>
              <Text style={styles.typeDescription}>{type.description}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.stepContent}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Challenge Details</Text>
        <Text style={styles.stepSubtitle}>Describe your challenge</Text>

        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., 50 pushups in 30 seconds!"
            placeholderTextColor="#666"
            maxLength={100}
          />
          <Text style={styles.inputCount}>{title.length}/100</Text>
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tell them what this challenge is about..."
            placeholderTextColor="#666"
            multiline
            maxLength={500}
          />
          <Text style={styles.inputCount}>{description.length}/500</Text>
        </View>

        {/* Rules */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Rules (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={rules}
            onChangeText={setRules}
            placeholder="1. Full range of motion&#10;2. Film in one take&#10;3. No editing"
            placeholderTextColor="#666"
            multiline
            maxLength={1000}
          />
        </View>

        {/* Duration */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Max Video Duration</Text>
          <View style={styles.optionRow}>
            {DURATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionButton, duration === opt.value && styles.optionButtonActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setDuration(opt.value);
                }}
              >
                <Text
                  style={[styles.optionText, duration === opt.value && styles.optionTextActive]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderStep3 = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Settings</Text>
      <Text style={styles.stepSubtitle}>Configure your challenge</Text>

      {/* Visibility */}
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Ionicons name={isPublic ? 'globe' : 'lock-closed'} size={24} color="#FF6B35" />
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>Public Challenge</Text>
            <Text style={styles.settingSubtitle}>
              {isPublic ? 'Anyone can see and participate' : 'Only tagged users can participate'}
            </Text>
          </View>
        </View>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
          trackColor={{ false: '#333', true: '#FF6B35' }}
          thumbColor="#fff"
        />
      </View>

      {/* Tips */}
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Ionicons name="gift" size={24} color="#FFD700" />
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>Enable Tips</Text>
            <Text style={styles.settingSubtitle}>Let viewers tip challenge responses</Text>
          </View>
        </View>
        <Switch
          value={tipsEnabled}
          onValueChange={setTipsEnabled}
          trackColor={{ false: '#333', true: '#FFD700' }}
          thumbColor="#fff"
        />
      </View>

      {/* Expiry */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Challenge Duration</Text>
        <View style={styles.optionRow}>
          {EXPIRY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionButton, expiry === opt.value && styles.optionButtonActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setExpiry(opt.value);
              }}
            >
              <Text style={[styles.optionText, expiry === opt.value && styles.optionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tag Users */}
      <TouchableOpacity
        style={styles.tagButton}
        onPress={() =>
          navigation.navigate('SelectUsers', {
            selectedIds: taggedUsers,
            onSelect: (ids: string[]) => setTaggedUsers(ids),
          })
        }
      >
        <View style={styles.settingInfo}>
          <Ionicons name="person-add" size={24} color="#00BFFF" />
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>Tag People</Text>
            <Text style={styles.settingSubtitle}>
              {taggedUsers.length > 0
                ? `${taggedUsers.length} people tagged`
                : 'Challenge specific users'}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>

      {/* Preview */}
      <View style={styles.previewCard}>
        <LinearGradient
          colors={[selectedType?.color || '#FF6B35', '#1a1a2e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.previewGradient}
        >
          <View style={styles.previewHeader}>
            <Text style={styles.previewIcon}>{selectedType?.icon || '🎯'}</Text>
            <Text style={styles.previewType}>{selectedType?.name || 'Challenge'}</Text>
          </View>
          <Text style={styles.previewTitle}>{title || 'Your Challenge Title'}</Text>
          <View style={styles.previewFooter}>
            <View style={styles.previewBadge}>
              <Ionicons name={isPublic ? 'globe' : 'lock-closed'} size={12} color="#fff" />
              <Text style={styles.previewBadgeText}>{isPublic ? 'Public' : 'Private'}</Text>
            </View>
            {tipsEnabled && (
              <View style={[styles.previewBadge, { backgroundColor: 'rgba(255,215,0,0.3)' }]}>
                <Ionicons name="gift" size={12} color="#FFD700" />
                <Text style={[styles.previewBadgeText, { color: '#FFD700' }]}>Tips</Text>
              </View>
            )}
            {duration > 0 && (
              <View style={styles.previewBadge}>
                <Ionicons name="timer" size={12} color="#fff" />
                <Text style={styles.previewBadgeText}>{duration}s</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </View>
    </ScrollView>
  );

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: `${(step / 3) * 100}%`,
            },
          ]}
        />
      </View>
      <Text style={styles.progressText}>Step {step} of 3</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name={step > 1 ? 'arrow-back' : 'close'} size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Challenge</Text>
          <View style={{ width: 40 }} />
        </View>

        {renderProgressBar()}

        {/* Steps */}
        <View style={styles.stepsContainer}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
            disabled={isSubmitting}
          >
            <LinearGradient
              colors={['#FF6B35', '#FF4500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextGradient}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.nextText}>
                    {step === 3 ? 'Create Challenge' : 'Continue'}
                  </Text>
                  <Ionicons
                    name={step === 3 ? 'checkmark' : 'arrow-forward'}
                    size={20}
                    color="#fff"
                  />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  safeArea: {
    flex: 1,
  },
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
  progressContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  stepsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#888',
    marginBottom: 24,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    width: (width - 56) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardGradient: {
    padding: 16,
    alignItems: 'center',
    minHeight: 120,
  },
  typeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  typeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputCount: {
    fontSize: 11,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionButtonActive: {
    backgroundColor: 'rgba(255,107,53,0.2)',
    borderColor: '#FF6B35',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  optionTextActive: {
    color: '#FF6B35',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  tagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  previewGradient: {
    padding: 20,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  previewIcon: {
    fontSize: 24,
  },
  previewType: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
  },
  previewFooter: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    padding: 16,
    paddingBottom: 20,
  },
  nextButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  nextGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  nextText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
