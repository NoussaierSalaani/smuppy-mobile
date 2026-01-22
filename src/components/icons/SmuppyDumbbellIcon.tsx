import React from 'react';
import Svg, { Path, Rect, Line, G } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyDumbbellIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Dumbbell Icon - Two dumbbells with power lines
 * Used for "Strong", "Impressive", "Power" reactions
 * Unique fitness-themed icon for Smuppy
 */
const SmuppyDumbbellIcon: React.FC<SmuppyDumbbellIconProps> = ({
  size = 24,
  color = '#0EBF8A',
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
        {/* Left dumbbell */}
        <Rect x="2" y="8" width="3" height="8" rx="1" fill={color} />
        <Rect x="5" y="10" width="4" height="4" rx="0.5" fill={color} />
        <Rect x="9" y="8" width="3" height="8" rx="1" fill={color} />

        {/* Right dumbbell (slightly rotated/offset for dynamic feel) */}
        <Rect x="12" y="9" width="3" height="8" rx="1" fill={color} transform="rotate(-15 13.5 13)" />
        <Rect x="15" y="11" width="4" height="4" rx="0.5" fill={color} transform="rotate(-15 17 13)" />
        <Rect x="19" y="9" width="3" height="8" rx="1" fill={color} transform="rotate(-15 20.5 13)" />

        {/* Power lines */}
        <Path
          d="M7 4L7 6M12 2L12 5M17 3L17 6"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Small energy sparks */}
        <Path
          d="M4 5L3 4M20 4L21 3M9 3L10 2"
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
      {/* Left dumbbell outline */}
      <Rect x="2" y="8" width="3" height="8" rx="1" stroke={color} strokeWidth="1.5" fill="none" />
      <Rect x="5" y="10" width="4" height="4" rx="0.5" stroke={color} strokeWidth="1.5" fill="none" />
      <Rect x="9" y="8" width="3" height="8" rx="1" stroke={color} strokeWidth="1.5" fill="none" />

      {/* Right dumbbell outline */}
      <G transform="rotate(-15 17 13)">
        <Rect x="13" y="8" width="3" height="8" rx="1" stroke={color} strokeWidth="1.5" fill="none" />
        <Rect x="16" y="10" width="4" height="4" rx="0.5" stroke={color} strokeWidth="1.5" fill="none" />
        <Rect x="20" y="8" width="3" height="8" rx="1" stroke={color} strokeWidth="1.5" fill="none" />
      </G>

      {/* Power lines */}
      <Path
        d="M7 5L7 7M12 3L12 6M17 4L17 7"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default SmuppyDumbbellIcon;
