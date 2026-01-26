import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyFlexIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Flex Icon - Flexing bicep with energy/power lines
 * Used for "Strong", "Impressive", "Power" reactions
 */
const SmuppyFlexIcon: React.FC<SmuppyFlexIconProps> = ({
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
        {/* Flexing arm - filled */}
        <Path
          d="M4 15C4 15 5 14 6 14C7 14 7.5 15 8 16C8.5 17 9 18 10 18.5C11 19 12 19 13 18.5C14 18 14.5 17 15 16C15.5 15 16 13 16 12C16 11 15.5 9 14 8C12.5 7 11 7 10 7.5C9 8 8 9 7 10C6 11 5 12 4.5 13C4 14 4 15 4 15Z"
          fill={color}
        />
        {/* Bicep bulge */}
        <Path
          d="M8 11C8 11 9 9 11 9C13 9 14 11 14 12C14 13 13.5 14 12.5 14.5C11.5 15 10 15 9 14C8 13 8 11 8 11Z"
          fill="#FFFFFF"
          opacity={0.3}
        />
        {/* Fist */}
        <Path
          d="M16 10C16 10 17 9 18 9C19 9 20 10 20 11C20 12 20 13 19 14C18 15 17 15 16 15"
          fill={color}
        />
        {/* Energy/power lines */}
        <Path
          d="M6 6L5 4M10 4L10.5 2M14 5L16 3"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Small energy dots */}
        <Path
          d="M3 8L2 7M18 4L19 3M21 8L22 7"
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
      {/* Flexing arm outline */}
      <Path
        d="M4 15C4 15 5 14 6 14C7 14 7.5 15 8 16C8.5 17 9 18 10 18.5C11 19 12 19 13 18.5C14 18 14.5 17 15 16C15.5 15 16 13 16 12C16 11 15.5 9 14 8C12.5 7 11 7 10 7.5C9 8 8 9 7 10C6 11 5 12 4.5 13C4 14 4 15 4 15Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Bicep definition line */}
      <Path
        d="M9 11C9.5 10 10.5 9.5 12 10C13 10.5 13 11.5 12.5 12.5"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Fist */}
      <Path
        d="M16 11C16.5 10 17.5 9.5 18.5 10C19.5 10.5 20 11.5 19.5 13C19 14 17.5 14.5 16.5 14"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Power lines */}
      <Path
        d="M7 5L6 3M11 3L11.5 1M15 4L17 2"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default SmuppyFlexIcon;

// Export variants
export const SmuppyFlexOutline: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#0EBF8A',
}) => <SmuppyFlexIcon size={size} color={color} filled={false} />;

export const SmuppyFlexFilled: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#0EBF8A',
}) => <SmuppyFlexIcon size={size} color={color} filled={true} />;
