import React, { memo, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ViewStyle, StyleProp, ImageStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GRADIENTS, SIZES } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import OptimizedImage from './OptimizedImage';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface SizeConfig {
  size: number;
  borderRadius: number;
  borderWidth: number;
  badgeSize: number;
  onlineSize: number;
}

interface AvatarProps {
  source?: string;
  size?: AvatarSize;
  hasBorder?: boolean;
  hasRing?: boolean;
  showBadge?: boolean;
  badgeCount?: number;
  isOnline?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Avatar Component
 */
const Avatar = memo(function Avatar({
  source,
  size = 'md',
  hasBorder = false,
  hasRing = false,
  showBadge = false,
  badgeCount,
  isOnline = false,
  onPress,
  style,
}: AvatarProps): React.JSX.Element {
  const { colors, isDark: _isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, _isDark), [colors, _isDark]);

  // Size configurations
  const sizeConfig: Record<AvatarSize, SizeConfig> = {
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
  const renderPlaceholder = (): React.JSX.Element => (
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
        color={colors.grayLight}
      />
    </View>
  );

  // Main avatar image
  const renderImage = (): React.JSX.Element => {
    if (!source) {
      return renderPlaceholder();
    }

    return (
      <OptimizedImage
        source={source}
        style={[
          styles.image,
          {
            width: config.size,
            height: config.size,
            borderRadius: config.borderRadius,
          },
        ] as StyleProp<ImageStyle>}
        contentFit="cover"
        priority="high"
      />
    );
  };

  // Badge component
  const renderBadge = (): React.JSX.Element | null => {
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
  const renderOnline = (): React.JSX.Element | null => {
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
  const renderWithBorder = (): React.JSX.Element => (
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
            backgroundColor: colors.background,
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
});

Avatar.displayName = 'Avatar';

export default Avatar;

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    backgroundColor: colors.grayLight,
  },
  placeholder: {
    backgroundColor: colors.backgroundSecondary,
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
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.background,
  },
  badgeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 8,
    color: colors.white,
  },
  onlineIndicator: {
    position: 'absolute',
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.background,
  },
  eventRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
});
