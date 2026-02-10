import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ViewStyle } from 'react-native';
import { COLORS } from '../../config/theme';

interface SmuppyDoubleFlexIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Double Flex Icon - Two symmetrical flexing arms
 * Classic bodybuilder double bicep pose with power lines
 * Used for "Strong", "Beast mode", "Impressive" reactions
 */
const SmuppyDoubleFlexIcon: React.FC<SmuppyDoubleFlexIconProps> = ({
  size = 24,
  color = COLORS.primary,
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
        {/* Left flexing arm */}
        <Path
          d="M2 16C2 16 2.5 14 3.5 13C4.5 12 5 12 5.5 12.5C6 13 6 14 6.5 14.5C7 15 7.5 14 8 13C8.5 12 8.5 10 8 9C7.5 8 6.5 8 6 8.5L5 10L4 9C4 9 3.5 7 4.5 6C5.5 5 7 5 8 6C9 7 10 9 10 11C10 13 9 15 8 16C7 17 5 17 4 16.5L2 16Z"
          fill={color}
        />
        {/* Left bicep bulge highlight */}
        <Path
          d="M5 10C5.5 9.5 6.5 9.5 7 10C7.5 10.5 7.5 11.5 7 12"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity={0.4}
        />

        {/* Right flexing arm (mirrored) */}
        <Path
          d="M22 16C22 16 21.5 14 20.5 13C19.5 12 19 12 18.5 12.5C18 13 18 14 17.5 14.5C17 15 16.5 14 16 13C15.5 12 15.5 10 16 9C16.5 8 17.5 8 18 8.5L19 10L20 9C20 9 20.5 7 19.5 6C18.5 5 17 5 16 6C15 7 14 9 14 11C14 13 15 15 16 16C17 17 19 17 20 16.5L22 16Z"
          fill={color}
        />
        {/* Right bicep bulge highlight */}
        <Path
          d="M19 10C18.5 9.5 17.5 9.5 17 10C16.5 10.5 16.5 11.5 17 12"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity={0.4}
        />

        {/* Power lines on top */}
        <Path
          d="M12 2V5M8 3L9 5M16 3L15 5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Side power sparks */}
        <Path
          d="M1 10L2 11M23 10L22 11M1 13L2.5 13M21.5 13L23 13"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={0.6}
        />

        {/* Center energy burst */}
        <Path
          d="M11 8L12 7L13 8M11 19L12 20L13 19"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
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
      {/* Left flexing arm outline */}
      <Path
        d="M2 16C2 16 2.5 14 3.5 13C4.5 12 5 12 5.5 12.5C6 13 6 14 6.5 14.5C7 15 7.5 14 8 13C8.5 12 8.5 10 8 9C7.5 8 6.5 8 6 8.5L5 10L4 9C4 9 3.5 7 4.5 6C5.5 5 7 5 8 6C9 7 10 9 10 11C10 13 9 15 8 16C7 17 5 17 4 16.5L2 16Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Left bicep definition */}
      <Path
        d="M5.5 10C6 9.5 7 9.5 7.5 10.5"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Right flexing arm outline (mirrored) */}
      <Path
        d="M22 16C22 16 21.5 14 20.5 13C19.5 12 19 12 18.5 12.5C18 13 18 14 17.5 14.5C17 15 16.5 14 16 13C15.5 12 15.5 10 16 9C16.5 8 17.5 8 18 8.5L19 10L20 9C20 9 20.5 7 19.5 6C18.5 5 17 5 16 6C15 7 14 9 14 11C14 13 15 15 16 16C17 17 19 17 20 16.5L22 16Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Right bicep definition */}
      <Path
        d="M18.5 10C18 9.5 17 9.5 16.5 10.5"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Power lines */}
      <Path
        d="M12 2V4M8 3L9 4.5M16 3L15 4.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default SmuppyDoubleFlexIcon;
