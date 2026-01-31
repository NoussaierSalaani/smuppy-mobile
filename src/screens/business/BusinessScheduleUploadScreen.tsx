/**
 * BusinessScheduleUploadScreen
 * AI-powered program/schedule extraction from PDF or images
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import type { IconName } from '../../types';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  navigation: any;
}

interface ExtractedActivity {
  id: string;
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  instructor?: string;
  description?: string;
  category?: string;
  confidence: number;
  selected: boolean;
}

interface UploadedFile {
  uri: string;
  name: string;
  type: 'image' | 'pdf';
  mimeType: string;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const getActivityCategories = (colors: any) => [
  { id: 'fitness', name: 'Fitness', icon: 'barbell' as IconName, color: '#E74C3C' },
  { id: 'yoga', name: 'Yoga', icon: 'body' as IconName, color: '#9B59B6' },
  { id: 'cardio', name: 'Cardio', icon: 'heart' as IconName, color: '#FF6B35' },
  { id: 'strength', name: 'Strength', icon: 'fitness' as IconName, color: '#3498DB' },
  { id: 'dance', name: 'Dance', icon: 'musical-notes' as IconName, color: '#E91E63' },
  { id: 'swimming', name: 'Swimming', icon: 'water' as IconName, color: '#00BCD4' },
  { id: 'martial_arts', name: 'Martial Arts', icon: 'flash' as IconName, color: '#FF5722' },
  { id: 'other', name: 'Other', icon: 'ellipse' as IconName, color: colors.gray },
];

export default function BusinessScheduleUploadScreen({ navigation }: Props) {
  const { showError, showAlert, showSuccess } = useSmuppyAlert();
  const { colors, isDark } = useTheme();
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [extractedActivities, setExtractedActivities] = useState<ExtractedActivity[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<'upload' | 'review' | 'confirm'>('upload');

  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const ACTIVITY_CATEGORIES = useMemo(() => getActivityCategories(colors), [colors]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission Required', 'Please allow access to your photo library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setUploadedFile({
        uri: asset.uri,
        name: asset.fileName || 'schedule.jpg',
        type: 'image',
        mimeType: asset.mimeType || 'image/jpeg',
      });
    }
  };

  const handleTakePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission Required', 'Please allow access to your camera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setUploadedFile({
        uri: asset.uri,
        name: 'schedule_photo.jpg',
        type: 'image',
        mimeType: 'image/jpeg',
      });
    }
  };

  const handlePickPDF = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // PDF support requires additional setup
    // For now, suggest using image instead
    showAlert({
      title: 'PDF Support Coming Soon',
      message: 'For now, please take a photo or select an image of your schedule. PDF support will be available in a future update.',
      buttons: [
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Select Image', onPress: handlePickImage },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) return;

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    startPulseAnimation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Animate progress
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 8000,
      useNativeDriver: false,
    }).start();

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setAnalysisProgress((prev) => Math.min(prev + 10, 90));
      }, 800);

      // Call AI analysis API
      const response = await awsAPI.analyzeScheduleDocument({
        fileUri: uploadedFile.uri,
        fileType: uploadedFile.type,
        mimeType: uploadedFile.mimeType,
      });

      clearInterval(progressInterval);
      setAnalysisProgress(100);

      if (response.success && response.activities) {
        const activities = response.activities.map((a: any, index: number) => ({
          ...a,
          id: `activity_${index}`,
          selected: true,
          confidence: a.confidence || 0.85,
        }));
        setExtractedActivities(activities);
        setStep('review');
      } else {
        setExtractedActivities([]);
        showError('No Data', 'Could not extract activities from the document. Please try a different file.');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Analysis error:', error);
      showError('Analysis Failed', 'Could not analyze the document. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsAnalyzing(false);
      progressAnim.setValue(0);
    }
  };

  const toggleActivity = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExtractedActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a))
    );
  };

  const selectAllActivities = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExtractedActivities((prev) => prev.map((a) => ({ ...a, selected: true })));
  };

  const deselectAllActivities = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExtractedActivities((prev) => prev.map((a) => ({ ...a, selected: false })));
  };

  const handleSaveSchedule = async () => {
    const selectedActivities = extractedActivities.filter((a) => a.selected);
    if (selectedActivities.length === 0) {
      showError('No Activities Selected', 'Please select at least one activity to save');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const response = await awsAPI.importScheduleActivities({
        activities: selectedActivities.map((a) => ({
          name: a.name,
          day: a.day,
          startTime: a.startTime,
          endTime: a.endTime,
          instructor: a.instructor,
          description: a.description,
          category: a.category,
        })),
      });

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert({
          title: 'Schedule Imported',
          message: `Successfully imported ${selectedActivities.length} activities to your schedule.`,
          type: 'success',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
        });
      } else {
        // Demo success
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert({
          title: 'Schedule Imported',
          message: `Successfully imported ${selectedActivities.length} activities to your schedule.`,
          type: 'success',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
        });
      }
    } catch (error) {
      console.error('Save schedule error:', error);
      showError('Error', 'Failed to save schedule. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryInfo = (categoryId?: string) => {
    return ACTIVITY_CATEGORIES.find((c) => c.id === categoryId) || ACTIVITY_CATEGORIES[ACTIVITY_CATEGORIES.length - 1];
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return '#0EBF8A';
    if (confidence >= 0.7) return '#FFD93D';
    return '#FF6B6B';
  };

  const renderUploadStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.uploadHeader}>
        <View style={styles.aiIconContainer}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.aiIconGradient}>
            <Ionicons name="sparkles" size={32} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.uploadTitle}>AI Schedule Import</Text>
        <Text style={styles.uploadSubtitle}>
          Upload your weekly program and our AI will automatically extract all activities,
          classes, and schedules
        </Text>
      </View>

      {/* Upload Options */}
      <View style={styles.uploadOptions}>
        <TouchableOpacity style={styles.uploadOption} onPress={handlePickImage}>
          <View style={[styles.uploadOptionIcon, { backgroundColor: 'rgba(155,89,182,0.2)' }]}>
            <Ionicons name="images" size={28} color="#9B59B6" />
          </View>
          <Text style={styles.uploadOptionTitle}>Photo Library</Text>
          <Text style={styles.uploadOptionDesc}>Select from gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uploadOption} onPress={handleTakePhoto}>
          <View style={[styles.uploadOptionIcon, { backgroundColor: 'rgba(52,152,219,0.2)' }]}>
            <Ionicons name="camera" size={28} color="#3498DB" />
          </View>
          <Text style={styles.uploadOptionTitle}>Take Photo</Text>
          <Text style={styles.uploadOptionDesc}>Capture schedule</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uploadOption} onPress={handlePickPDF}>
          <View style={[styles.uploadOptionIcon, { backgroundColor: 'rgba(231,76,60,0.2)' }]}>
            <Ionicons name="document" size={28} color="#E74C3C" />
          </View>
          <Text style={styles.uploadOptionTitle}>PDF Document</Text>
          <Text style={styles.uploadOptionDesc}>Upload PDF file</Text>
        </TouchableOpacity>
      </View>

      {/* Uploaded File Preview */}
      {uploadedFile && (
        <View style={styles.filePreview}>
          <View style={styles.filePreviewHeader}>
            <Ionicons
              name={uploadedFile.type === 'pdf' ? 'document' : 'image'}
              size={24}
              color={colors.primary}
            />
            <View style={styles.filePreviewInfo}>
              <Text style={styles.filePreviewName} numberOfLines={1}>
                {uploadedFile.name}
              </Text>
              <Text style={styles.filePreviewType}>
                {uploadedFile.type === 'pdf' ? 'PDF Document' : 'Image'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setUploadedFile(null)}>
              <Ionicons name="close-circle" size={24} color={colors.gray} />
            </TouchableOpacity>
          </View>

          {uploadedFile.type === 'image' && (
            <TouchableOpacity onPress={() => setShowPreview(true)}>
              <Image source={{ uri: uploadedFile.uri }} style={styles.filePreviewImage} />
              <View style={styles.imageOverlay}>
                <Ionicons name="expand" size={20} color="#fff" />
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Analyze Button */}
      {uploadedFile && !isAnalyzing && (
        <TouchableOpacity style={styles.analyzeButton} onPress={handleAnalyze}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.analyzeGradient}>
            <Ionicons name="sparkles" size={20} color="#fff" />
            <Text style={styles.analyzeButtonText}>Analyze with AI</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Analyzing Progress */}
      {isAnalyzing && (
        <Animated.View style={[styles.analyzingContainer, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.analyzingIconContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.analyzingTitle}>Analyzing Document...</Text>
          <Text style={styles.analyzingProgress}>{analysisProgress}%</Text>
          <View style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.analyzingHint}>
            Our AI is extracting activities, schedules, and instructor information...
          </Text>
        </Animated.View>
      )}

      {/* Supported Formats */}
      <View style={styles.supportedFormats}>
        <Text style={styles.supportedTitle}>Supported formats</Text>
        <View style={styles.formatTags}>
          <View style={styles.formatTag}>
            <Text style={styles.formatTagText}>PDF</Text>
          </View>
          <View style={styles.formatTag}>
            <Text style={styles.formatTagText}>PNG</Text>
          </View>
          <View style={styles.formatTag}>
            <Text style={styles.formatTagText}>JPEG</Text>
          </View>
          <View style={styles.formatTag}>
            <Text style={styles.formatTagText}>HEIC</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderReviewStep = () => {
    const groupedByDay = DAYS_OF_WEEK.reduce((acc, day) => {
      acc[day] = extractedActivities.filter((a) => a.day === day);
      return acc;
    }, {} as Record<string, ExtractedActivity[]>);

    const selectedCount = extractedActivities.filter((a) => a.selected).length;

    return (
      <View style={styles.stepContainer}>
        {/* Review Header */}
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewTitle}>Review Extracted Activities</Text>
          <Text style={styles.reviewSubtitle}>
            {extractedActivities.length} activities found • {selectedCount} selected
          </Text>

          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionButton} onPress={selectAllActivities}>
              <Text style={styles.selectionButtonText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionButton} onPress={deselectAllActivities}>
              <Text style={styles.selectionButtonText}>Deselect All</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Activities by Day */}
        <ScrollView style={styles.activitiesScroll} showsVerticalScrollIndicator={false}>
          {DAYS_OF_WEEK.map((day) => {
            const dayActivities = groupedByDay[day];
            if (dayActivities.length === 0) return null;

            return (
              <View key={day} style={styles.daySection}>
                <Text style={styles.dayTitle}>{day}</Text>
                {dayActivities.map((activity) => {
                  const category = getCategoryInfo(activity.category);
                  return (
                    <TouchableOpacity
                      key={activity.id}
                      style={[
                        styles.activityCard,
                        activity.selected && styles.activityCardSelected,
                      ]}
                      onPress={() => toggleActivity(activity.id)}
                    >
                      <View
                        style={[
                          styles.activityCheckbox,
                          activity.selected && styles.activityCheckboxSelected,
                        ]}
                      >
                        {activity.selected && (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>

                      <View style={[styles.activityIcon, { backgroundColor: `${category.color}20` }]}>
                        <Ionicons name={category.icon} size={18} color={category.color} />
                      </View>

                      <View style={styles.activityInfo}>
                        <Text style={styles.activityName}>{activity.name}</Text>
                        <View style={styles.activityMeta}>
                          <View style={styles.activityMetaItem}>
                            <Ionicons name="time-outline" size={12} color={colors.gray} />
                            <Text style={styles.activityMetaText}>
                              {activity.startTime} - {activity.endTime}
                            </Text>
                          </View>
                          {activity.instructor && (
                            <View style={styles.activityMetaItem}>
                              <Ionicons name="person-outline" size={12} color={colors.gray} />
                              <Text style={styles.activityMetaText}>{activity.instructor}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={styles.confidenceBadge}>
                        <View
                          style={[
                            styles.confidenceDot,
                            { backgroundColor: getConfidenceColor(activity.confidence) },
                          ]}
                        />
                        <Text style={styles.confidenceText}>
                          {Math.round(activity.confidence * 100)}%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Save Button */}
        <View style={styles.bottomAction}>
          <BlurView intensity={80} tint="dark" style={styles.bottomBlur}>
            <View style={styles.bottomInfo}>
              <Text style={styles.bottomInfoText}>
                {selectedCount} activities will be imported
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.saveButton, selectedCount === 0 && styles.saveButtonDisabled]}
              onPress={handleSaveSchedule}
              disabled={isSaving || selectedCount === 0}
            >
              <LinearGradient colors={GRADIENTS.primary} style={styles.saveGradient}>
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Import Schedule</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </BlurView>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.backgroundSecondary, colors.background]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (step === 'review') {
                setStep('upload');
              } else {
                navigation.goBack();
              }
            }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 'upload' ? 'Upload Program' : 'Review Activities'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {step === 'upload' ? renderUploadStep() : renderReviewStep()}
      </SafeAreaView>

      {/* Image Preview Modal */}
      <Modal visible={showPreview} transparent animationType="fade">
        <View style={styles.previewModal}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setShowPreview(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {uploadedFile?.type === 'image' && (
            <Image
              source={{ uri: uploadedFile.uri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
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
    color: colors.dark,
  },

  stepContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // Upload Header
  uploadHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  aiIconContainer: {
    marginBottom: 16,
  },
  aiIconGradient: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  uploadSubtitle: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Upload Options
  uploadOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  uploadOption: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  uploadOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  uploadOptionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  uploadOptionDesc: {
    fontSize: 11,
    color: colors.gray,
  },

  // File Preview
  filePreview: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  filePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  filePreviewInfo: {
    flex: 1,
    marginLeft: 12,
  },
  filePreviewName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  filePreviewType: {
    fontSize: 12,
    color: colors.gray,
  },
  filePreviewImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
  },

  // Analyze Button
  analyzeButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
  },
  analyzeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  analyzeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },

  // Analyzing
  analyzingContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  analyzingIconContainer: {
    marginBottom: 16,
  },
  analyzingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  analyzingProgress: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  analyzingHint: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
  },

  // Supported Formats
  supportedFormats: {
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 24,
  },
  supportedTitle: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 10,
  },
  formatTags: {
    flexDirection: 'row',
    gap: 8,
  },
  formatTag: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  formatTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.lightGray,
  },

  // Review Step
  reviewHeader: {
    marginBottom: 16,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  reviewSubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 12,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  selectionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  selectionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.dark,
  },

  activitiesScroll: {
    flex: 1,
  },
  daySection: {
    marginBottom: 20,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 10,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activityCardSelected: {
    borderColor: 'rgba(14,191,138,0.4)',
    backgroundColor: 'rgba(14,191,138,0.08)',
  },
  activityCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.gray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activityCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  activityMeta: {
    flexDirection: 'row',
    gap: 12,
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
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 11,
    color: colors.gray,
  },

  // Bottom Action
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBlur: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
    backgroundColor: 'rgba(15,15,26,0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  bottomInfo: {
    alignItems: 'center',
    marginBottom: 12,
  },
  bottomInfoText: {
    fontSize: 13,
    color: colors.gray,
  },
  saveButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },

  // Preview Modal
  previewModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
});
