import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { awsAPI, NotificationPreferences } from '../../services/aws-api';

const TOGGLE_OPTIONS: { key: keyof NotificationPreferences; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'follows', label: 'New Fans' },
  { key: 'comments', label: 'Comments & Replies' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'messages', label: 'Messages' },
  { key: 'live', label: 'Live Streams' },
];

const DEFAULTS: NotificationPreferences = {
  likes: true,
  comments: true,
  follows: true,
  messages: true,
  mentions: true,
  live: true,
};

interface NotificationSettingsScreenProps {
  navigation: { goBack: () => void };
}

const NotificationSettingsScreen = ({ navigation }: NotificationSettingsScreenProps) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    awsAPI.getNotificationPreferences()
      .then(setPrefs)
      .catch(() => {
        // Keep defaults on error
      })
      .finally(() => setLoading(false));

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const persistPreferences = useCallback((updated: Partial<NotificationPreferences>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      awsAPI.updateNotificationPreferences(updated).catch(() => {
        // Optimistic — silently fail; user can retry
      });
    }, 400);
  }, []);

  const allEnabled = TOGGLE_OPTIONS.every(opt => prefs[opt.key]);

  const toggleAll = useCallback(() => {
    const newValue = !allEnabled;
    const updated: NotificationPreferences = {
      likes: newValue,
      comments: newValue,
      follows: newValue,
      messages: newValue,
      mentions: newValue,
      live: newValue,
    };
    setPrefs(updated);
    persistPreferences(updated);
  }, [allEnabled, persistPreferences]);

  const toggleOne = useCallback((key: keyof NotificationPreferences) => {
    setPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      persistPreferences({ [key]: updated[key] });
      return updated;
    });
  }, [persistPreferences]);

  const renderToggle = useCallback((
    label: string,
    value: boolean,
    onToggle: () => void,
    isFirst?: boolean,
  ) => (
    <View style={[styles.toggleItem, isFirst && styles.toggleItemFirst, { borderBottomColor: colors.gray200 }]}>
      <Text style={[styles.toggleLabel, { color: colors.dark }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.gray200, true: colors.primary }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.gray200}
      />
    </View>
  ), [colors]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.dark} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.dark }]}>Notifications</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.dark }]}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {renderToggle('All', allEnabled, toggleAll, true)}
        {TOGGLE_OPTIONS.map(opt => (
          <React.Fragment key={opt.key}>
            {renderToggle(opt.label, prefs[opt.key], () => toggleOne(opt.key))}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  toggleItemFirst: {
    borderBottomWidth: 2,
  },
  toggleLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default NotificationSettingsScreen;
