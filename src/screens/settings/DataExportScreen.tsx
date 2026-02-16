import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { awsAPI } from '../../services/aws-api';
import { APIError } from '../../services/api/error';

const DATA_CATEGORIES = [
  { id: 'profile', icon: 'person-outline' as const, label: 'Profile Information', description: 'Name, email, bio, avatar' },
  { id: 'posts', icon: 'images-outline' as const, label: 'Posts & Media', description: 'All your posts and media metadata' },
  { id: 'peaks', icon: 'flash-outline' as const, label: 'Peaks', description: 'Stories and ephemeral content' },
  { id: 'social', icon: 'people-outline' as const, label: 'Social Connections', description: 'Followers, following, blocks' },
  { id: 'messages', icon: 'chatbubble-outline' as const, label: 'Messages', description: 'Conversation metadata' },
  { id: 'activity', icon: 'time-outline' as const, label: 'Activity & Preferences', description: 'Likes, saves, settings, consent history' },
];

interface DataExportScreenProps {
  navigation: { goBack: () => void };
}

const DataExportScreen = ({ navigation }: DataExportScreenProps) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showError, showSuccess, showWarning } = useSmuppyAlert();
  const [exporting, setExporting] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);

    try {
      const data = await awsAPI.exportData();

      // Write JSON to temp file for sharing
      const fileName = `smuppy-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share the file
      if (Platform.OS === 'ios') {
        await Share.share({ url: filePath });
      } else {
        await Share.share({
          message: JSON.stringify(data, null, 2),
          title: fileName,
        });
      }

      showSuccess('Export Complete', 'Your data has been exported successfully.');
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 429) {
        showWarning('Rate Limited', 'You can only export your data 3 times per hour. Please try again later.');
      } else if (error instanceof Error && error.message.includes('User did not share')) {
        // User cancelled the share dialog — no error needed
      } else {
        showError('Export Failed', 'Unable to export your data right now. Please try again later.');
      }
    } finally {
      setExporting(false);
    }
  }, [exporting, showSuccess, showWarning, showError]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={navigation.goBack}
        >
          <Ionicons name="arrow-back" size={24} color={colors.gray900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Export My Data</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* GDPR Notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          <Text style={styles.noticeText}>
            Under GDPR Article 15, you have the right to access all personal data we hold about you. Your export will include the categories listed below.
          </Text>
        </View>

        {/* Data Categories */}
        <Text style={styles.sectionTitle}>Included Data</Text>
        <View style={styles.categoriesContainer}>
          {DATA_CATEGORIES.map((category) => (
            <View key={category.id} style={styles.categoryItem}>
              <View style={styles.categoryIconBox}>
                <Ionicons name={category.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.categoryContent}>
                <Text style={styles.categoryLabel}>{category.label}</Text>
                <Text style={styles.categoryDescription}>{category.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Rate Limit Note */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.gray500} />
          <Text style={styles.infoText}>
            Data exports are limited to 3 per hour. Your export will be downloaded as a JSON file.
          </Text>
        </View>

        {/* Export Button */}
        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.7}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color="#FFF" />
              <Text style={styles.exportButtonText}>Export My Data</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Contact */}
        <Text style={styles.contactText}>
          For questions about your data or to exercise additional rights, contact{' '}
          <Text style={styles.contactLink}>legal@smuppy.com</Text>
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof import('../../config/theme').getThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'WorkSans-SemiBold',
    color: colors.gray900,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${colors.primary}12`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: colors.gray900,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'WorkSans-SemiBold',
    color: colors.gray500,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoriesContainer: {
    gap: 8,
    marginBottom: 24,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  categoryIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryContent: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: colors.gray900,
  },
  categoryDescription: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: colors.gray500,
    marginTop: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: colors.gray500,
    lineHeight: 18,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 20,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFF',
  },
  contactText: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: colors.gray500,
    textAlign: 'center',
    lineHeight: 20,
  },
  contactLink: {
    color: colors.primary,
    fontFamily: 'Poppins-Medium',
  },
});

export default DataExportScreen;
