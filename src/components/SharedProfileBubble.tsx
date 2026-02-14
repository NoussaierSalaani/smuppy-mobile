import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AvatarImage } from './OptimizedImage';
import { AccountBadge } from './Badge';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { awsAPI } from '../services/aws-api';
import { resolveDisplayName } from '../types/profile';

interface SharedProfileBubbleProps {
  profileId: string;
  isFromMe: boolean;
}

interface ProfileData {
  id: string;
  username?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  account_type?: 'personal' | 'pro_creator' | 'pro_business';
  bio?: string;
}

function SharedProfileBubble({ profileId, isFromMe }: SharedProfileBubbleProps) {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void }>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!profileId || !uuidPattern.test(profileId)) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const response = await awsAPI.request<ProfileData>(`/profiles/${profileId}`);
        if (cancelled) return;
        if (response && response.id) {
          setProfile(response);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [profileId]);

  const handlePress = () => {
    if (profile) {
      navigation.navigate('UserProfile', { userId: profile.id });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}>
        <ActivityIndicator size="small" color={isFromMe ? '#fff' : colors.primary} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}>
        <Text style={[styles.errorText, isFromMe && styles.textFromMe]}>
          Profile not available
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.profileContent}>
        <AvatarImage source={profile.avatar_url} size={48} />
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.profileName, isFromMe && styles.textFromMe]} numberOfLines={1}>
              {resolveDisplayName(profile)}
            </Text>
            <AccountBadge
              size={12}
              isVerified={profile.is_verified}
              accountType={profile.account_type}
            />
          </View>
          {profile.username && (
            <Text style={[styles.username, isFromMe && styles.usernameFromMe]} numberOfLines={1}>
              @{profile.username}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.sharedBadge, isFromMe && styles.sharedBadgeFromMe]}>
        <Ionicons name="person" size={10} color={isFromMe ? 'rgba(255,255,255,0.7)' : colors.gray} />
        <Text style={[styles.sharedText, isFromMe && styles.textFromMe]}>Shared Profile</Text>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(SharedProfileBubble);

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    width: 220,
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerFromMe: {
    backgroundColor: colors.primary,
  },
  containerFromOther: {
    backgroundColor: colors.backgroundSecondary,
  },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    marginRight: 4,
    flex: 1,
  },
  textFromMe: {
    color: '#fff',
  },
  username: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  usernameFromMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  sharedBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sharedBadgeFromMe: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sharedText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.gray,
  },
  errorText: {
    fontSize: 13,
    color: colors.gray,
    fontStyle: 'italic',
    padding: SPACING.md,
  },
});
