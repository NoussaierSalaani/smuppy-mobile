import React, { memo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SmuppyHeartIcon from './icons/SmuppyHeartIcon';
import { COLORS, GRADIENTS, SIZES, SHADOWS } from '../config/theme';

const { width } = Dimensions.get('window');

type CardVariant = 'post' | 'suggestion' | 'addFriend' | 'vibe';
type VibeSize = 'tall' | 'short';

interface PostData {
  image?: string;
  isVideo?: boolean;
  duration?: string;
  title?: string;
  caption?: string;
  authorAvatar?: string;
  authorName?: string;
  likes?: number;
}

interface SuggestionData {
  avatar?: string;
  name?: string;
}

interface VibeData {
  image?: string;
  title?: string;
  user?: string;
}

type CardData = PostData | SuggestionData | VibeData;

interface CardProps {
  variant?: CardVariant;
  data: CardData;
  size?: VibeSize;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Card Component - Memoized for performance in lists
 */
const Card = memo(function Card({ variant = 'post', data, size = 'tall', onPress, style }: CardProps): React.JSX.Element | null {
  // Render Post Card
  if (variant === 'post') {
    const postData = data as PostData;
    return (
      <TouchableOpacity
        style={[styles.postCard, SHADOWS.cardMedium, style]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Image */}
        <View style={styles.postImageContainer}>
          <Image
            source={{ uri: postData.image }}
            style={[
              styles.postImage,
              postData.isVideo && styles.postImageTall,
            ]}
            resizeMode="cover"
          />
          {/* Duration Badge (for videos) */}
          {postData.duration && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{postData.duration}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.postContent}>
          <Text style={styles.postTitle} numberOfLines={2}>
            {postData.title || postData.caption}
          </Text>

          <View style={styles.postMeta}>
            {/* Author */}
            <View style={styles.postAuthor}>
              <Image
                source={{ uri: postData.authorAvatar }}
                style={styles.postAvatar}
              />
              <Text style={styles.postAuthorName} numberOfLines={1}>
                {postData.authorName}
              </Text>
            </View>

            {/* Likes */}
            <View style={styles.postLikes}>
              <SmuppyHeartIcon size={14} color={COLORS.graySecondary} />
              <Text style={styles.postLikesText}>{postData.likes || 0}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Render Suggestion Card
  if (variant === 'suggestion') {
    const suggestionData = data as SuggestionData;
    return (
      <View style={[styles.suggestionCard, style]}>
        {/* Avatar */}
        <Image
          source={{ uri: suggestionData.avatar }}
          style={styles.suggestionAvatar}
        />

        {/* Info */}
        <View style={styles.suggestionInfo}>
          <Text style={styles.suggestionName} numberOfLines={1}>
            {suggestionData.name}
          </Text>

          {/* Track Button */}
          <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
            <LinearGradient
              colors={GRADIENTS.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.trackButton}
            >
              <Text style={styles.trackButtonText}>Track</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render Add Friend Card (special suggestion)
  if (variant === 'addFriend') {
    return (
      <View style={[styles.suggestionCard, style]}>
        {/* Add Icon Circle */}
        <View style={styles.addFriendCircle}>
          <Ionicons name="person-add" size={24} color={COLORS.primary} />
          <Text style={styles.addFriendText}>Add people{'\n'}to Smuppy</Text>
        </View>

        {/* Invite Button */}
        <View style={styles.suggestionInfo}>
          <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
            <LinearGradient
              colors={GRADIENTS.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.trackButton}
            >
              <Text style={styles.trackButtonText}>Invite</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render Vibe Card
  if (variant === 'vibe') {
    const vibeData = data as VibeData;
    const cardHeight = size === 'tall' ? SIZES.vibeCardTall : SIZES.vibeCardShort;

    return (
      <TouchableOpacity
        style={[
          styles.vibeCard,
          { height: cardHeight },
          style,
        ]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: vibeData.image }}
          style={styles.vibeImage}
          resizeMode="cover"
        />

        {/* Gradient Overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)']}
          style={styles.vibeOverlay}
        >
          <Text style={styles.vibeTitle} numberOfLines={2}>
            {vibeData.title || vibeData.user}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return null;
});

export default Card;

const styles = StyleSheet.create({
  // Post Card Styles
  postCard: {
    width: SIZES.postCardWidth,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusXl,
    borderWidth: 1,
    borderColor: COLORS.buttonBorderLight,
    overflow: 'hidden',
  },
  postImageContainer: {
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: SIZES.radiusXl - 1,
    borderTopRightRadius: SIZES.radiusXl - 1,
  },
  postImageTall: {
    height: 278,
    borderRadius: 18,
  },
  durationBadge: {
    position: 'absolute',
    top: 11,
    left: 13,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: SIZES.radiusSm,
  },
  durationText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.48,
    color: COLORS.dark,
    textTransform: 'uppercase',
  },
  postContent: {
    padding: 10,
    paddingTop: 4,
  },
  postTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.dark,
    marginBottom: 4,
  },
  postMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  postAvatar: {
    width: SIZES.avatarXs,
    height: SIZES.avatarXs,
    borderRadius: SIZES.radiusSm,
    marginRight: 2,
  },
  postAuthorName: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.graySecondary,
    flex: 1,
  },
  postLikes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  postLikesText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.graySecondary,
  },

  // Suggestion Card Styles
  suggestionCard: {
    width: SIZES.suggestionCardWidth,
    height: SIZES.suggestionCardHeight,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  suggestionAvatar: {
    width: 100,
    height: 100,
    borderRadius: SIZES.radiusLg,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  suggestionInfo: {
    alignItems: 'center',
    marginTop: 0,
  },
  suggestionName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    lineHeight: 18,
    color: COLORS.dark,
    textAlign: 'center',
    width: SIZES.suggestionCardWidth,
    marginBottom: 2,
  },
  trackButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: SIZES.radiusSm,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    lineHeight: 16,
    color: COLORS.dark,
  },

  // Add Friend Card
  addFriendCircle: {
    width: 100,
    height: 100,
    borderRadius: SIZES.radiusLg,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addFriendText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    lineHeight: 11,
    color: COLORS.dark,
    textAlign: 'center',
    marginTop: 4,
  },

  // Vibe Card Styles
  vibeCard: {
    width: (width - 45) / 2,
    borderRadius: SIZES.radiusLg,
    overflow: 'hidden',
  },
  vibeImage: {
    width: '100%',
    height: '100%',
  },
  vibeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    paddingTop: 30,
  },
  vibeTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: COLORS.white,
  },
});
