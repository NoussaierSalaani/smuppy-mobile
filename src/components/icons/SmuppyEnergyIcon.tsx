import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyEnergyIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Energy Icon - Lightning bolt with circular energy pulse
 * Used for boosts, challenges, power-ups, and energy indicators
 */
const SmuppyEnergyIcon: React.FC<SmuppyEnergyIconProps> = ({
  size = 24,
  color = '#FFD93D',
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
        {/* Outer energy ring */}
        <Circle
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="4 2"
          fill="none"
          opacity={0.4}
        />
        {/* Inner energy ring */}
        <Circle
          cx="12"
          cy="12"
          r="7"
          stroke={color}
          strokeWidth="1"
          fill="none"
          opacity={0.3}
        />
        {/* Lightning bolt - filled */}
        <Path
          d="M13 2L4.5 12.5H11L10 22L18.5 10.5H12L13 2Z"
          fill={color}
        />
        {/* Lightning highlight */}
        <Path
          d="M12.5 5L7 12.5H10.5L10 18L15.5 11H12L12.5 5Z"
          fill="#FFFFFF"
          opacity={0.3}
        />
        {/* Energy sparks */}
        <Path
          d="M19 6L20 5M5 18L4 19M20 16L21.5 16.5M2.5 7.5L4 8"
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
      {/* Outer energy ring */}
      <Circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="1.2"
        strokeDasharray="4 2"
        fill="none"
        opacity={0.4}
      />
      {/* Lightning bolt outline */}
      <Path
        d="M13 2L4.5 12.5H11L10 22L18.5 10.5H12L13 2Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Energy sparks */}
      <Path
        d="M19 5L20 4M4 19L3 20M21 14L22 14.5"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity={0.5}
      />
    </Svg>
  );
};

export default SmuppyEnergyIcon;

// Export variants
export const SmuppyEnergyOutline: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#FFD93D',
}) => <SmuppyEnergyIcon size={size} color={color} filled={false} />;

export const SmuppyEnergyFilled: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#FFD93D',
}) => <SmuppyEnergyIcon size={size} color={color} filled={true} />;
