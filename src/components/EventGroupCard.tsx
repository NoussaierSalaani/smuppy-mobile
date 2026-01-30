import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptimizedImage from './OptimizedImage';
import { COLORS } from '../config/theme';

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
  const participantText = maxParticipants
    ? `${participantCount}/${maxParticipants}`
    : `${participantCount}`;

  return (
    <TouchableOpacity style={cardStyles.container} onPress={onPress} activeOpacity={0.8}>
      {coverImage ? (
        <OptimizedImage source={coverImage} style={cardStyles.thumbnail} />
      ) : (
        <View style={[cardStyles.thumbnail, cardStyles.placeholderThumb]}>
          <Ionicons name="calendar-outline" size={28} color="#9CA3AF" />
        </View>
      )}

      <View style={cardStyles.content}>
        <Text style={cardStyles.title} numberOfLines={2}>{title}</Text>

        {location ? (
          <View style={cardStyles.row}>
            <Ionicons name="location-outline" size={14} color="#8E8E93" />
            <Text style={cardStyles.rowText} numberOfLines={1}>{location}</Text>
          </View>
        ) : null}

        {startDate ? (
          <View style={cardStyles.row}>
            <Ionicons name="calendar-outline" size={14} color="#8E8E93" />
            <Text style={cardStyles.rowText} numberOfLines={1}>{formatDate(startDate)}</Text>
          </View>
        ) : null}

        <View style={cardStyles.row}>
          <Ionicons name="people-outline" size={14} color="#8E8E93" />
          <Text style={cardStyles.rowText}>{participantText} participants</Text>
        </View>
      </View>

      {isOwner && (
        <TouchableOpacity style={cardStyles.menuBtn} onPress={onMenuPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-vertical" size={18} color="#8E8E93" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

EventGroupCard.displayName = 'EventGroupCard';

const cardStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  thumbnail: {
    width: 80,
    height: 80,
  },
  placeholderThumb: {
    backgroundColor: '#F3F4F6',
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
    color: '#0A252F',
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
    color: '#8E8E93',
    flex: 1,
  },
  menuBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});

export default EventGroupCard;
