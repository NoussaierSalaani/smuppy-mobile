import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

interface BadgeProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * VerifiedBadge - Checkmark badge for verified accounts
 * Similar to Instagram/Twitter verified badge
 */
export const VerifiedBadge: React.FC<BadgeProps> = ({ size = 16, style }) => {
  return (
    <View style={[styles.badgeContainer, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
          <LinearGradient id="verifiedGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#0EBF8A" />
            <Stop offset="1" stopColor="#00B3C7" />
          </LinearGradient>
        </Defs>
        {/* Badge background - hexagonal shape */}
        <Path
          d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1Z"
          fill="url(#verifiedGradient)"
        />
        {/* Checkmark */}
        <Path
          d="M10 15.17L7.12 12.29C6.73 11.9 6.1 11.9 5.71 12.29C5.32 12.68 5.32 13.31 5.71 13.7L9.3 17.29C9.69 17.68 10.32 17.68 10.71 17.29L18.29 9.71C18.68 9.32 18.68 8.69 18.29 8.3C17.9 7.91 17.27 7.91 16.88 8.3L10 15.17Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
};

/**
 * PremiumBadge - Star/Crown badge for premium accounts
 * Golden color scheme for premium members
 */
export const PremiumBadge: React.FC<BadgeProps> = ({ size = 16, style }) => {
  return (
    <View style={[styles.badgeContainer, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
          <LinearGradient id="premiumGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFD700" />
            <Stop offset="0.5" stopColor="#FFA500" />
            <Stop offset="1" stopColor="#FF8C00" />
          </LinearGradient>
        </Defs>
        {/* Badge background - circle */}
        <Circle cx="12" cy="12" r="11" fill="url(#premiumGradient)" />
        {/* Star */}
        <Path
          d="M12 5L13.8 9.9L19 10.3L15.2 13.5L16.4 18.5L12 15.8L7.6 18.5L8.8 13.5L5 10.3L10.2 9.9L12 5Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
};

/**
 * CreatorBadge - Badge for content creators
 * Uses the Smuppy brand colors
 */
export const CreatorBadge: React.FC<BadgeProps> = ({ size = 16, style }) => {
  return (
    <View style={[styles.badgeContainer, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
          <LinearGradient id="creatorGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#0EBF8A" />
            <Stop offset="0.5" stopColor="#00B5C1" />
            <Stop offset="1" stopColor="#0081BE" />
          </LinearGradient>
        </Defs>
        {/* Badge background - rounded hexagon */}
        <Path
          d="M12 2L20 7V17L12 22L4 17V7L12 2Z"
          fill="url(#creatorGradient)"
        />
        {/* Play icon (creator) */}
        <Path
          d="M10 8L16 12L10 16V8Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default VerifiedBadge;
