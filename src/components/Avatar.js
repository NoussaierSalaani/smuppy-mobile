import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SIZES } from '../config/theme';

/**
 * Avatar Component
 * 
 * @param {string} source - Image URI
 * @param {string} size - 'xs' | 'sm' | 'md' | 'lg'
 * @param {boolean} hasBorder - Show gradient border
 * @param {boolean} hasRing - Show event ring
 * @param {boolean} showBadge - Show notification badge
 * @param {number} badgeCount - Badge count
 * @param {boolean} isOnline - Show online indicator
 * @param {function} onPress - Press handler
 * @param {object} style - Additional styles
 */
export default function Avatar({
  source,
  size = 'md',
  hasBorder = false,
  hasRing = false,
  showBadge = false,
  badgeCount,
  isOnline = false,
  onPress,
  style,
}) {
  // Size configurations
  const sizeConfig = {
    xs: {
      size: SIZES.avatarXs,
      borderRadius: SIZES.radiusSm,
      borderWidth: 1.5,
      badgeSize: 6,
      onlineSize: 6,
    },
    sm: {
      size: SIZES.avatarSm,
      borderRadius: SIZES.radiusSm,
      borderWidth: 2,
      badgeSize: 8,
      onlineSize: 8,
    },
    md: {
      size: SIZES.avatarMd,
      borderRadius: SIZES.radiusMd,
      borderWidth: 2,
      badgeSize: 10,
      onlineSize: 10,
    },
    lg: {
      size: SIZES.avatarLg,
      borderRadius: SIZES.radiusLg,
      borderWidth: 3,
      badgeSize: 14,
      onlineSize: 14,
    },
  };

  const config = sizeConfig[size];

  // Placeholder when no source
  const renderPlaceholder = () => (
    <View
      style={[
        styles.placeholder,
        {
          width: config.size,
          height: config.size,
          borderRadius: config.borderRadius,
        },
      ]}
    >
      <Ionicons
        name="person"
        size={config.size * 0.5}
        color={COLORS.grayLight}
      />
    </View>
  );

  // Main avatar image
  const renderImage = () => {
    if (!source) {
      return renderPlaceholder();
    }

    return (
      <Image
        source={{ uri: source }}
        style={[
          styles.image,
          {
            width: config.size,
            height: config.size,
            borderRadius: config.borderRadius,
          },
        ]}
        resizeMode="cover"
      />
    );
  };

  // Badge component
  const renderBadge = () => {
    if (!showBadge) return null;

    return (
      <View
        style={[
          styles.badge,
          {
            minWidth: config.badgeSize * 2,
            height: config.badgeSize * 2,
            borderRadius: config.badgeSize,
            right: -config.badgeSize / 2,
            top: -config.badgeSize / 2,
          },
        ]}
      >
        {badgeCount && badgeCount > 0 && (
          <Text style={styles.badgeText}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </Text>
        )}
      </View>
    );
  };

  // Online indicator
  const renderOnline = () => {
    if (!isOnline) return null;

    return (
      <View
        style={[
          styles.onlineIndicator,
          {
            width: config.onlineSize,
            height: config.onlineSize,
            borderRadius: config.onlineSize / 2,
            right: 2,
            bottom: 2,
          },
        ]}
      />
    );
  };

  // Avatar with border
  const renderWithBorder = () => (
    <LinearGradient
      colors={GRADIENTS.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.borderContainer,
        {
          width: config.size + config.borderWidth * 2 + 4,
          height: config.size + config.borderWidth * 2 + 4,
          borderRadius: config.borderRadius + config.borderWidth + 2,
          padding: config.borderWidth + 2,
        },
      ]}
    >
      <View
        style={[
          styles.innerBorder,
          {
            width: config.size + 4,
            height: config.size + 4,
            borderRadius: config.borderRadius + 2,
            padding: 2,
            backgroundColor: COLORS.white,
          },
        ]}
      >
        {renderImage()}
      </View>
    </LinearGradient>
  );

  // Main container
  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { onPress, activeOpacity: 0.8 } : {};

  return (
    <Container style={[styles.container, style]} {...containerProps}>
      {hasBorder ? renderWithBorder() : renderImage()}
      {renderBadge()}
      {renderOnline()}
      {hasRing && (
        <View
          style={[
            styles.eventRing,
            {
              width: config.size + 6,
              height: config.size + 6,
              borderRadius: config.borderRadius + 3,
            },
          ]}
        />
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    backgroundColor: COLORS.grayLight,
  },
  placeholder: {
    backgroundColor: COLORS.backgroundDisabled,
    justifyContent: 'center',
    alignItems: 'center',
  },
  borderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerBorder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  badgeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 8,
    color: COLORS.white,
  },
  onlineIndicator: {
    position: 'absolute',
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  eventRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: 'transparent',
  },
});
