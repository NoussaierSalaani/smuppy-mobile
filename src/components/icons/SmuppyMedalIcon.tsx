import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { ViewStyle } from 'react-native';
import { COLORS } from '../../config/theme';

interface SmuppyMedalIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Medal Icon - Achievement medal with ribbon and sparkles
 * Used for "Bravo", "Champion", "Well done" reactions
 * Unique fitness achievement icon for Smuppy
 */
const SmuppyMedalIcon: React.FC<SmuppyMedalIconProps> = ({
  size = 24,
  color = COLORS.gold,
  filled = false,
  style,
}) => {
  if (filled) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={style}
      >
        {/* Ribbon left */}
        <Path
          d="M8 2L6 8L9 7L12 10"
          fill={COLORS.heartRed}
        />
        {/* Ribbon right */}
        <Path
          d="M16 2L18 8L15 7L12 10"
          fill={COLORS.heartRed}
        />

        {/* Medal circle */}
        <Circle cx="12" cy="15" r="7" fill={color} />

        {/* Medal inner circle */}
        <Circle cx="12" cy="15" r="5" fill="#FFF8DC" opacity={0.3} />

        {/* Star on medal */}
        <Path
          d="M12 11L13.09 13.26L15.5 13.64L13.75 15.34L14.18 17.77L12 16.6L9.82 17.77L10.25 15.34L8.5 13.64L10.91 13.26L12 11Z"
          fill="#FFFFFF"
        />

        {/* Sparkles around medal */}
        <Path
          d="M4 12L5 11L4 10L3 11L4 12Z"
          fill={color}
        />
        <Path
          d="M20 14L21 13L20 12L19 13L20 14Z"
          fill={color}
        />
        <Path
          d="M6 20L7 19L6 18L5 19L6 20Z"
          fill={color}
          opacity={0.7}
        />
        <Path
          d="M18 19L19 18L18 17L17 18L18 19Z"
          fill={color}
          opacity={0.7}
        />

        {/* Shine lines */}
        <Path
          d="M3 8L4 7M21 9L20 8M5 4L6 5"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={0.6}
        />
      </Svg>
    );
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      {/* Ribbon */}
      <Path
        d="M8 2L6 8L9 7L12 10L15 7L18 8L16 2"
        stroke={COLORS.heartRed}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Medal circle */}
      <Circle cx="12" cy="15" r="6" stroke={color} strokeWidth="1.8" fill="none" />

      {/* Star on medal */}
      <Path
        d="M12 11.5L12.9 13.5L15 13.8L13.5 15.2L13.8 17.3L12 16.3L10.2 17.3L10.5 15.2L9 13.8L11.1 13.5L12 11.5Z"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Sparkle lines */}
      <Path
        d="M4 11L5 10M20 13L19 12M5 18L6 17"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default SmuppyMedalIcon;
