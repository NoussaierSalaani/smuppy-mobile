import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ViewStyle } from 'react-native';
import { COLORS } from '../../config/theme';

interface SmuppyHeartIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Heart Icon - Heart with integrated ECG pulse line
 * The ECG line is part of the heart shape itself, creating a unique fitness-themed design
 */
const SmuppyHeartIcon: React.FC<SmuppyHeartIconProps> = ({
  size = 24,
  color = COLORS.heartRed,
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
        {/* Heart with ECG - filled version */}
        <Path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={color}
        />
        {/* ECG line - thin line touching both edges */}
        <Path
          d="M3.5 11.5L6 11.5L7.5 14L10 9L12 14L14 9L16.5 14L18 11.5L20.5 11.5"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  // Outline version with refined ECG design
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      {/* Upper part of heart (left and right lobes) */}
      <Path
        d="M7.5 3C4.42 3 2 5.42 2 8.5c0 1.8 0.8 3.4 2 4.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M16.5 3C19.58 3 22 5.42 22 8.5c0 1.8-0.8 3.4-2 4.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Top curves connecting to center */}
      <Path
        d="M7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* ECG line - thin line touching both edges */}
      <Path
        d="M3.5 12.5L6 12.5L7.5 15L10 10L12 15L14 10L16.5 15L18 12.5L20.5 12.5"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Bottom point of heart */}
      <Path
        d="M3.5 12.5c1.5 3 5.5 7 8.5 8.85C15 19.5 18.5 15.5 20.5 12.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
};

export default SmuppyHeartIcon;
