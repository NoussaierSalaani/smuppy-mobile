import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NotificationSettings {
  all: boolean;
  likes: boolean;
  newFans: boolean;
  peakReplies: boolean;
  shares: boolean;
  messages: boolean;
  live: boolean;
}

const NOTIFICATION_OPTIONS = [
  { id: 'all' as keyof NotificationSettings, label: 'All' },
  { id: 'likes' as keyof NotificationSettings, label: 'Likes' },
  { id: 'newFans' as keyof NotificationSettings, label: 'New Fans' },
  { id: 'peakReplies' as keyof NotificationSettings, label: 'Peak Replies' },
  { id: 'shares' as keyof NotificationSettings, label: 'Shares' },
  { id: 'messages' as keyof NotificationSettings, label: 'Messages' },
  { id: 'live' as keyof NotificationSettings, label: 'Live Streams' },
];

interface NotificationSettingsScreenProps {
  navigation: { goBack: () => void };
}

const NotificationSettingsScreen = ({ navigation }: NotificationSettingsScreenProps) => {
  const insets = useSafeAreaInsets();
  
  const [settings, setSettings] = useState({
    all: false,
    likes: true,
    newFans: true,
    peakReplies: true,
    shares: true,
    messages: true,
    live: true,
  });

  const toggleSetting = (key: keyof NotificationSettings) => {
    if (key === 'all') {
      // Toggle all settings
      const newValue = !settings.all;
      const newSettings: NotificationSettings = {
        all: newValue,
        likes: newValue,
        newFans: newValue,
        peakReplies: newValue,
        shares: newValue,
        messages: newValue,
        live: newValue,
      };
      setSettings(newSettings);
    } else {
      setSettings(prev => ({
        ...prev,
        [key]: !prev[key],
        // If turning off any individual, turn off "All"
        all: false,
      }));
    }
  };

  const renderToggle = (item: { id: keyof NotificationSettings; label: string }) => (
    <View key={item.id} style={styles.toggleItem}>
      <Text style={styles.toggleLabel}>{item.label}</Text>
      <Switch
        value={settings[item.id]}
        onValueChange={() => toggleSetting(item.id)}
        trackColor={{ false: '#E8E8E8', true: '#0EBF8A' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#E8E8E8"
      />
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Toggle List */}
      <View style={styles.content}>
        {NOTIFICATION_OPTIONS.map(renderToggle)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    color: '#0A0A0F',
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
    borderBottomColor: '#F2F2F2',
  },
  toggleLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: '#0A0A0F',
  },
});

export default NotificationSettingsScreen;