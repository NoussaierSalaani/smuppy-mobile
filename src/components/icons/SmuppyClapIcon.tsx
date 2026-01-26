import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyClapIconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

/**
 * Smuppy Clap Icon - Clapping hands with energy burst
 * Used for "Bravo", "Well done", "Applause" reactions
 */
const SmuppyClapIcon: React.FC<SmuppyClapIconProps> = ({
  size = 24,
  color = '#FF9500',
  style,
}) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      {/* Left hand */}
      <Path
        d="M7 13L5 11C4.5 10.5 4.5 9.5 5 9C5.5 8.5 6.5 8.5 7 9L8 10L6 7C5.5 6.5 5.5 5.5 6 5C6.5 4.5 7.5 4.5 8 5L10 8L9 6C8.5 5.3 8.7 4.3 9.5 4C10.3 3.7 11 4.2 11.5 5L13 8"
        fill={color}
      />
      {/* Right hand */}
      <Path
        d="M17 13L19 11C19.5 10.5 19.5 9.5 19 9C18.5 8.5 17.5 8.5 17 9L16 10L18 7C18.5 6.5 18.5 5.5 18 5C17.5 4.5 16.5 4.5 16 5L14 8L15 6C15.5 5.3 15.3 4.3 14.5 4C13.7 3.7 13 4.2 12.5 5L11 8"
        fill={color}
      />
      {/* Hands meeting point highlight */}
      <Path
        d="M10 12C10 12 11 11 12 11C13 11 14 12 14 12L13.5 15C13.5 15 13 16 12 16C11 16 10.5 15 10.5 15L10 12Z"
        fill={color}
      />
      {/* Impact burst lines */}
      <Path
        d="M12 2V4M7 4L8.5 5.5M17 4L15.5 5.5M4 9H6M18 9H20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Small sparkles */}
      <Path
        d="M5 3L5.5 2M19 3L18.5 2M3 7L2 6.5M21 7L22 6.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.6}
      />
      {/* Lower hands/wrists */}
      <Path
        d="M9 16L8 20C8 20 9 21 12 21C15 21 16 20 16 20L15 16"
        fill={color}
        opacity={0.8}
      />
    </Svg>
  );
};

export default SmuppyClapIcon;
