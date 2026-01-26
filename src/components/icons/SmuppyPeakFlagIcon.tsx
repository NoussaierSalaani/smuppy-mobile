import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyPeakFlagIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Peak Flag Icon - 100% Original Design
 * Mountain peak with planted victory flag at summit
 * Achievement rays bursting from flag
 * Used for "Goal!", "Achievement", "Summit" reactions
 *
 * Design elements:
 * - Stylized mountain peak (angular, dynamic)
 * - Victory flag with wave motion
 * - Achievement rays/sparkles from summit
 * - Small celebration particles
 */
const SmuppyPeakFlagIcon: React.FC<SmuppyPeakFlagIconProps> = ({
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
        {/* Mountain peak - stylized angular shape */}
        <Path
          d="M12 8L18 20H6L12 8Z"
          fill={color}
          opacity={0.3}
        />
        <Path
          d="M12 8L18 20H6L12 8Z"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Snow cap detail */}
        <Path
          d="M12 8L14 12L12 11L10 12L12 8Z"
          fill="#FFFFFF"
          opacity={0.8}
        />

        {/* Flag pole */}
        <Line
          x1="12"
          y1="2"
          x2="12"
          y2="10"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Waving flag - unique wave shape */}
        <Path
          d="M12 2C12 2 15 3 16 4C17 5 16 6 15 6.5C14 7 12 6 12 6"
          fill={color}
        />
        <Path
          d="M12 2C12 2 15 3 16 4C17 5 16 6 15 6.5C14 7 12 6 12 6"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Flag wave lines */}
        <Path
          d="M13 3.5C14 4 14.5 4.5 14 5"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity={0.6}
        />

        {/* Achievement rays from flag */}
        <Path
          d="M17 2L18.5 1M18 4L20 3.5M18 6L19.5 7"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Celebration sparkles */}
        <Circle cx="8" cy="4" r="1" fill={color} opacity={0.7} />
        <Circle cx="20" cy="5" r="0.8" fill={color} opacity={0.6} />
        <Circle cx="6" cy="7" r="0.6" fill={color} opacity={0.5} />

        {/* Victory star at flag tip */}
        <Path
          d="M16 4L16.5 3L17 4L16.5 4.3L16 4Z"
          fill="#FFFFFF"
          opacity={0.9}
        />

        {/* Mountain base texture */}
        <Path
          d="M8 16L10 14M14 14L16 16"
          stroke={color}
          strokeWidth="1"
          strokeLinecap="round"
          opacity={0.4}
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
      {/* Mountain peak outline */}
      <Path
        d="M12 9L17 19H7L12 9Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Snow cap line */}
      <Path
        d="M10.5 12L12 10L13.5 12"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
      />

      {/* Flag pole */}
      <Line
        x1="12"
        y1="3"
        x2="12"
        y2="10"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Waving flag outline */}
      <Path
        d="M12 3C12 3 14.5 4 15.5 5C16.5 6 15 7 14 7C13 7 12 6.5 12 6.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Achievement rays */}
      <Path
        d="M17 3L18 2M17.5 5L19 4.5M17 7L18 8"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.7}
      />

      {/* Sparkle */}
      <Circle cx="8" cy="5" r="0.8" fill={color} opacity={0.5} />
    </Svg>
  );
};

export default SmuppyPeakFlagIcon;
