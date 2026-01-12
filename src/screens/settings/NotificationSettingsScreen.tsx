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

const NOTIFICATION_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'likes', label: 'Likes' },
  { id: 'comments', label: 'Comments' },
  { id: 'tags', label: 'Tags' },
  { id: 'shares', label: 'Shares' },
  { id: 'messages', label: 'Messages' },
  { id: 'peaks', label: 'Peaks' },
];

const NotificationSettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  
  const [settings, setSettings] = useState({
    all: false,
    likes: true,
    comments: true,
    tags: true,
    shares: true,
    messages: true,
    peaks: true,
  });

  const toggleSetting = (key) => {
    if (key === 'all') {
      // Toggle all settings
      const newValue = !settings.all;
      const newSettings = {};
      NOTIFICATION_OPTIONS.forEach(opt => {
        newSettings[opt.id] = newValue;
      });
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

  const renderToggle = (item) => (
    <View key={item.id} style={styles.toggleItem}>
      <Text style={styles.toggleLabel}>{item.label}</Text>
      <Switch
        value={settings[item.id]}
        onValueChange={() => toggleSetting(item.id)}
        trackColor={{ false: '#E8E8E8', true: '#11E3A3' }}
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