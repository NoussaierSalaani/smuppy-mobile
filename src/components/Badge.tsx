import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';

interface BadgeProps {
  size?: number;
  style?: ViewStyle;
}

// Badge colors from UI Kit
const BADGE_COLORS = {
  verified: '#2D8EFF',   // Blue - Verified personal accounts
  creator: '#0BCF93',    // Green - Pro/Creator accounts
  premium: '#D7B502',    // Gold - Premium/Pro Local accounts
};

/**
 * ShutterBadge — Outline variant (fond blanc, segments + checkmark colorés)
 * Light mode: white bg, colored shutter blades + checkmark
 */
const ShutterBadgeOutline: React.FC<BadgeProps & { color: string }> = ({ size = 20, style, color }) => (
  <View style={[styles.badgeContainer, styles.badgeShadow, { width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <G>
        <Circle cx="10" cy="10" r="10" fill="white" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M11.387 4.127L8.398 0.142C4.982 0.711 2.135 2.917 0.854 6.049L6.12 5.48C7.117 4.483 8.54 3.985 10.035 3.985C10.462 3.985 10.96 4.056 11.387 4.127Z" fill={color} />
        <Path fillRule="evenodd" clipRule="evenodd" d="M5.552 5.906L0.641 6.476C0.214 7.543 0 8.753 0 10.034C0 12.312 0.712 14.376 1.993 16.013L4.057 11.102C3.986 10.746 3.915 10.39 3.915 9.963C3.986 8.397 4.555 6.974 5.552 5.906Z" fill={color} />
        <Path fillRule="evenodd" clipRule="evenodd" d="M14.449 14.092L19.431 13.38C19.787 12.313 20 11.174 20 10.035C20 7.758 19.217 5.694 17.936 3.985L15.872 8.896C15.943 9.252 16.015 9.679 16.015 10.035C16.086 11.601 15.445 13.025 14.449 14.092Z" fill={color} />
        <Path fillRule="evenodd" clipRule="evenodd" d="M15.8 8.185L17.722 3.559C15.872 1.423 13.096 0 10.035 0C9.679 0 9.252 0 8.896 0.071L12.099 4.342C13.808 4.982 15.231 6.406 15.8 8.185Z" fill={color} />
        <Path fillRule="evenodd" clipRule="evenodd" d="M8.683 15.873L11.672 19.858C15.089 19.289 18.007 16.94 19.288 13.809L13.95 14.592C12.882 15.517 11.53 16.086 10.035 16.086C9.537 16.086 9.11 16.015 8.683 15.873Z" fill={color} />
        <Path fillRule="evenodd" clipRule="evenodd" d="M4.27 11.814L2.277 16.37C4.128 18.576 6.904 20 9.964 20C10.391 20 10.747 20 11.174 19.928L7.971 15.658C6.192 15.088 4.84 13.665 4.27 11.814Z" fill={color} />
        <Path d="M13.142 8.892C13.397 8.637 13.397 8.224 13.142 7.969C12.887 7.714 12.474 7.714 12.219 7.969L9.061 11.126L7.782 9.846C7.527 9.591 7.113 9.591 6.858 9.846C6.603 10.101 6.603 10.515 6.858 10.77L8.6 12.511C8.855 12.766 9.268 12.766 9.523 12.511L13.142 8.892Z" fill={color} />
      </G>
    </Svg>
  </View>
);

/**
 * ShutterBadgeFilled — Filled variant (fond coloré, segments légèrement transparents, checkmark blanc)
 * Dark mode: colored bg, semi-transparent white shutter blades, white checkmark
 */
const ShutterBadgeFilled: React.FC<BadgeProps & { color: string }> = ({ size = 16, style, color }) => (
  <View style={[styles.badgeContainer, styles.badgeShadow, { width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <G>
        <Circle cx="10" cy="10" r="10" fill={color} />
        <Path fillRule="evenodd" clipRule="evenodd" d="M11.387 4.127L8.398 0.142C4.982 0.711 2.135 2.917 0.854 6.049L6.12 5.48C7.117 4.483 8.54 3.985 10.035 3.985C10.462 3.985 10.96 4.056 11.387 4.127Z" fill="rgba(255,255,255,0.2)" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M5.552 5.906L0.641 6.476C0.214 7.543 0 8.753 0 10.034C0 12.312 0.712 14.376 1.993 16.013L4.057 11.102C3.986 10.746 3.915 10.39 3.915 9.963C3.986 8.397 4.555 6.974 5.552 5.906Z" fill="rgba(255,255,255,0.2)" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M14.449 14.092L19.431 13.38C19.787 12.313 20 11.174 20 10.035C20 7.758 19.217 5.694 17.936 3.985L15.872 8.896C15.943 9.252 16.015 9.679 16.015 10.035C16.086 11.601 15.445 13.025 14.449 14.092Z" fill="rgba(255,255,255,0.2)" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M15.8 8.185L17.722 3.559C15.872 1.423 13.096 0 10.035 0C9.679 0 9.252 0 8.896 0.071L12.099 4.342C13.808 4.982 15.231 6.406 15.8 8.185Z" fill="rgba(255,255,255,0.2)" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M8.683 15.873L11.672 19.858C15.089 19.289 18.007 16.94 19.288 13.809L13.95 14.592C12.882 15.517 11.53 16.086 10.035 16.086C9.537 16.086 9.11 16.015 8.683 15.873Z" fill="rgba(255,255,255,0.2)" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M4.27 11.814L2.277 16.37C4.128 18.576 6.904 20 9.964 20C10.391 20 10.747 20 11.174 19.928L7.971 15.658C6.192 15.088 4.84 13.665 4.27 11.814Z" fill="rgba(255,255,255,0.2)" />
        <Path d="M13.142 8.892C13.397 8.637 13.397 8.224 13.142 7.969C12.887 7.714 12.474 7.714 12.219 7.969L9.061 11.126L7.782 9.846C7.527 9.591 7.113 9.591 6.858 9.846C6.603 10.101 6.603 10.515 6.858 10.77L8.6 12.511C8.855 12.766 9.268 12.766 9.523 12.511L13.142 8.892Z" fill="white" />
      </G>
    </Svg>
  </View>
);

/**
 * ShutterBadge — Auto-selects variant based on theme
 * Light mode → outline (white bg, colored elements)
 * Dark mode  → filled  (colored bg, white elements)
 * Can be overridden with explicit variant prop
 */
const ShutterBadge: React.FC<BadgeProps & { color: string; variant?: 'outline' | 'filled' | 'auto' }> = ({
  size = 20,
  style,
  color,
  variant = 'auto',
}) => {
  const { isDark } = useTheme();
  const useFilled = variant === 'filled' || (variant === 'auto' && isDark);
  if (useFilled) {
    return <ShutterBadgeFilled size={size} style={style} color={color} />;
  }
  return <ShutterBadgeOutline size={size} style={style} color={color} />;
};

/**
 * VerifiedBadge — Blue badge for verified personal accounts
 */
export const VerifiedBadge: React.FC<BadgeProps> = ({ size = 20, style }) => {
  return <ShutterBadge size={size} style={style} color={BADGE_COLORS.verified} />;
};

/**
 * PremiumBadge — Gold badge for premium/business accounts
 */
export const PremiumBadge: React.FC<BadgeProps> = ({ size = 20, style }) => {
  return <ShutterBadge size={size} style={style} color={BADGE_COLORS.premium} />;
};

/**
 * CreatorBadge — Green badge for pro/creator accounts
 */
export const CreatorBadge: React.FC<BadgeProps> = ({ size = 20, style }) => {
  return <ShutterBadge size={size} style={style} color={BADGE_COLORS.creator} />;
};

/**
 * LargeBadge — For profile headers and prominent displays
 * Follows theme: outline in light, filled in dark
 */
export const LargeBadge: React.FC<BadgeProps & { variant?: 'verified' | 'premium' | 'creator' }> = ({
  size = 46,
  style,
  variant = 'verified'
}) => {
  const color = BADGE_COLORS[variant];
  return <ShutterBadge size={size} style={style} color={color} />;
};

/**
 * AccountBadge — Auto-selects color based on account type, auto-selects variant based on size
 * Only renders when isVerified is true
 */
export type AccountType = 'personal' | 'pro_creator' | 'pro_business';

interface AccountBadgeProps extends BadgeProps {
  isVerified?: boolean;
  accountType?: AccountType;
}

export const AccountBadge: React.FC<AccountBadgeProps> = ({
  size = 16,
  style,
  isVerified = false,
  accountType = 'personal'
}) => {
  if (!isVerified) return null;

  switch (accountType) {
    case 'pro_creator':
      return <ShutterBadge size={size} style={style} color={BADGE_COLORS.creator} />;
    case 'pro_business':
      return <ShutterBadge size={size} style={style} color={BADGE_COLORS.premium} />;
    case 'personal':
    default:
      return <ShutterBadge size={size} style={style} color={BADGE_COLORS.verified} />;
  }
};

const styles = StyleSheet.create({
  badgeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
});

export default VerifiedBadge;
