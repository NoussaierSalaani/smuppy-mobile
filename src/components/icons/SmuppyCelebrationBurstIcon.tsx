import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyCelebrationBurstIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Celebration Burst Icon - 100% Original Design
 * Explosive celebration with central unique star shape
 * Confetti particles and burst rays in all directions
 * Used for "Bravo!", "Congratulations", "Victory" reactions
 *
 * Design elements:
 * - Central 6-pointed burst star (not standard star)
 * - Confetti pieces flying outward (rectangles at angles)
 * - Celebration sparkles and dots
 * - Dynamic burst rays
 */
const SmuppyCelebrationBurstIcon: React.FC<SmuppyCelebrationBurstIconProps> = ({
  size = 24,
  color = '#FFD700',
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
        {/* Central burst star - unique 6-pointed design */}
        <Path
          d="M12 4L13.5 9L18 7.5L14.5 11L18 14.5L13.5 13L12 18L10.5 13L6 14.5L9.5 11L6 7.5L10.5 9L12 4Z"
          fill={color}
        />

        {/* Inner highlight */}
        <Circle cx="12" cy="11" r="2" fill="#FFFFFF" opacity={0.5} />

        {/* Burst rays from center */}
        <Path
          d="M12 1V3M12 19V21"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Path
          d="M3 12H5M19 12H21"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Path
          d="M4.5 4.5L6 6M18 18L19.5 19.5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Path
          d="M19.5 4.5L18 6M6 18L4.5 19.5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Confetti pieces - rectangles at various angles */}
        <Rect
          x="2"
          y="7"
          width="3"
          height="1.5"
          rx="0.5"
          fill={color}
          opacity={0.8}
          transform="rotate(-20 2 7)"
        />
        <Rect
          x="19"
          y="8"
          width="2.5"
          height="1.2"
          rx="0.4"
          fill={color}
          opacity={0.7}
          transform="rotate(25 19 8)"
        />
        <Rect
          x="3"
          y="16"
          width="2"
          height="1"
          rx="0.3"
          fill={color}
          opacity={0.6}
          transform="rotate(15 3 16)"
        />
        <Rect
          x="18"
          y="15"
          width="2.5"
          height="1"
          rx="0.4"
          fill={color}
          opacity={0.7}
          transform="rotate(-30 18 15)"
        />

        {/* Celebration sparkles */}
        <Circle cx="5" cy="5" r="1.2" fill={color} opacity={0.9} />
        <Circle cx="19" cy="5" r="1" fill={color} opacity={0.8} />
        <Circle cx="4" cy="12" r="0.8" fill={color} opacity={0.6} />
        <Circle cx="20" cy="11" r="0.7" fill={color} opacity={0.6} />
        <Circle cx="6" cy="19" r="0.9" fill={color} opacity={0.7} />
        <Circle cx="18" cy="19" r="1" fill={color} opacity={0.7} />

        {/* Extra mini sparkles */}
        <Circle cx="8" cy="2" r="0.6" fill={color} opacity={0.5} />
        <Circle cx="16" cy="2" r="0.5" fill={color} opacity={0.5} />
        <Circle cx="2" cy="14" r="0.5" fill={color} opacity={0.4} />
        <Circle cx="22" cy="14" r="0.5" fill={color} opacity={0.4} />
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
      {/* Central burst star outline */}
      <Path
        d="M12 5L13 9L17 8L14 11L17 14L13 13L12 17L11 13L7 14L10 11L7 8L11 9L12 5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Burst rays */}
      <Path
        d="M12 2V4M12 18V20"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Path
        d="M4 12H6M18 12H20"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Path
        d="M5 5L6.5 6.5M17.5 17.5L19 19"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.8}
      />
      <Path
        d="M19 5L17.5 6.5M6.5 17.5L5 19"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.8}
      />

      {/* Confetti outlines */}
      <Rect
        x="2"
        y="8"
        width="2.5"
        height="1.2"
        rx="0.4"
        stroke={color}
        strokeWidth="1"
        fill="none"
        transform="rotate(-15 2 8)"
        opacity={0.7}
      />
      <Rect
        x="19"
        y="7"
        width="2"
        height="1"
        rx="0.3"
        stroke={color}
        strokeWidth="1"
        fill="none"
        transform="rotate(20 19 7)"
        opacity={0.7}
      />

      {/* Sparkles */}
      <Circle cx="5" cy="5" r="0.8" fill={color} opacity={0.6} />
      <Circle cx="19" cy="5" r="0.7" fill={color} opacity={0.5} />
      <Circle cx="5" cy="19" r="0.7" fill={color} opacity={0.5} />
      <Circle cx="19" cy="19" r="0.8" fill={color} opacity={0.6} />
    </Svg>
  );
};

export default SmuppyCelebrationBurstIcon;
