import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptimizedImage from './OptimizedImage';
import { useTheme } from '../hooks/useTheme';

interface EventGroupCardProps {
  type: 'event' | 'group';
  id: string;
  title: string;
  location: string;
  coverImage?: string;
  startDate?: string;
  participantCount: number;
  maxParticipants?: number;
  categoryColor?: string;
  isOwner: boolean;
  onPress: () => void;
  onMenuPress: () => void;
}

const PLACEHOLDER_COLORS: Record<string, string[]> = {
  fitness: ['#FF6B6B', '#FF8E8E'],
  sports: ['#4ECDC4', '#45B7A0'],
  outdoor: ['#96CEB4', '#88D8A8'],
  default: ['#A8DADC', '#457B9D'],
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const EventGroupCard = memo(({
  title,
  location,
  coverImage,
  startDate,
  participantCount,
  maxParticipants,
  isOwner,
  onPress,
  onMenuPress,
}: EventGroupCardProps) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const participantText = maxParticipants
    ? `${participantCount}/${maxParticipants}`
    : `${participantCount}`;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
      {coverImage ? (
        <OptimizedImage source={coverImage} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumb]}>
          <Ionicons name="calendar-outline" size={28} color="#9CA3AF" />
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        {location ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={14} color="#8E8E93" />
            <Text style={styles.rowText} numberOfLines={1}>{location}</Text>
          </View>
        ) : null}

        {startDate ? (
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={14} color="#8E8E93" />
            <Text style={styles.rowText} numberOfLines={1}>{formatDate(startDate)}</Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Ionicons name="people-outline" size={14} color="#8E8E93" />
          <Text style={styles.rowText}>{participantText} participants</Text>
        </View>
      </View>

      {isOwner && (
        <TouchableOpacity style={styles.menuBtn} onPress={onMenuPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-vertical" size={18} color="#8E8E93" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

EventGroupCard.displayName = 'EventGroupCard';

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  thumbnail: {
    width: 80,
    height: 80,
  },
  placeholderThumb: {
    backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  rowText: {
    fontSize: 12,
    color: colors.gray,
    flex: 1,
  },
  menuBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});

export default EventGroupCard;
