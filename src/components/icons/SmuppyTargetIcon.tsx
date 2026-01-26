import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyTargetIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Target Icon - Bullseye target with arrow/checkmark hit
 * Used for "Goal!", "Nailed it", "Perfect" reactions
 * Represents achieving fitness goals
 */
const SmuppyTargetIcon: React.FC<SmuppyTargetIconProps> = ({
  size = 24,
  color = '#FF6B6B',
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
        {/* Outer ring */}
        <Circle cx="12" cy="12" r="10" fill={color} opacity={0.2} />
        <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" fill="none" />

        {/* Middle ring */}
        <Circle cx="12" cy="12" r="6" fill={color} opacity={0.4} />
        <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.5" fill="none" />

        {/* Center bullseye */}
        <Circle cx="12" cy="12" r="2.5" fill={color} />

        {/* Checkmark/hit indicator */}
        <Path
          d="M8 12L11 15L17 8"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Impact sparkles */}
        <Path
          d="M4 4L5.5 5.5M20 4L18.5 5.5M4 20L5.5 18.5M20 20L18.5 18.5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Small energy dots */}
        <Circle cx="2" cy="12" r="1" fill={color} opacity={0.6} />
        <Circle cx="22" cy="12" r="1" fill={color} opacity={0.6} />
        <Circle cx="12" cy="2" r="1" fill={color} opacity={0.6} />
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
      {/* Outer ring */}
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" fill="none" />

      {/* Middle ring */}
      <Circle cx="12" cy="12" r="5.5" stroke={color} strokeWidth="1.5" fill="none" />

      {/* Center bullseye */}
      <Circle cx="12" cy="12" r="2" stroke={color} strokeWidth="1.5" fill="none" />

      {/* Checkmark */}
      <Path
        d="M9 12L11 14L15 9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Impact lines */}
      <Path
        d="M4 4L6 6M20 4L18 6M4 20L6 18M20 20L18 18"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.6}
      />
    </Svg>
  );
};

export default SmuppyTargetIcon;
