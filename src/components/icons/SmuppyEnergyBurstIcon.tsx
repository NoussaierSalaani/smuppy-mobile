import React from 'react';
import Svg, { Path, Circle, Polygon } from 'react-native-svg';
import { ViewStyle } from 'react-native';

type SmuppyEnergyBurstIconProps = Readonly<{
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}>;

/**
 * Smuppy Energy Burst Icon - 100% Original Design
 * Abstract energy representation: pulsing concentric waves
 * emanating from a unique geometric core with floating particles
 * Used for "Energy", "Boost", "Power up" reactions
 *
 * Design elements:
 * - Central diamond/rhombus core (unique shape)
 * - Concentric pulse rings radiating outward
 * - Asymmetric energy particles floating around
 * - Dynamic motion trails
 */
const SmuppyEnergyBurstIcon: React.FC<SmuppyEnergyBurstIconProps> = ({
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
        {/* Outer pulse ring */}
        <Circle
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="1.5"
          fill="none"
          opacity={0.3}
          strokeDasharray="4 2"
        />

        {/* Middle pulse ring */}
        <Circle
          cx="12"
          cy="12"
          r="7"
          stroke={color}
          strokeWidth="1.8"
          fill="none"
          opacity={0.5}
        />

        {/* Inner glow */}
        <Circle cx="12" cy="12" r="4" fill={color} opacity={0.3} />

        {/* Central diamond core - unique geometric shape */}
        <Polygon
          points="12,6 16,12 12,18 8,12"
          fill={color}
        />

        {/* Core highlight */}
        <Path
          d="M12 8L14 12L12 16"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
        />

        {/* Energy burst rays - asymmetric for originality */}
        <Path
          d="M12 2V4M12 20V22"
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
          d="M2 12H4M20 12H22"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Path
          d="M4.5 19.5L6 18M18 6L19.5 4.5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Floating energy particles - asymmetric positions */}
        <Circle cx="5" cy="8" r="1.2" fill={color} opacity={0.8} />
        <Circle cx="19" cy="16" r="1" fill={color} opacity={0.7} />
        <Circle cx="7" cy="18" r="0.8" fill={color} opacity={0.6} />
        <Circle cx="17" cy="6" r="0.9" fill={color} opacity={0.7} />
        <Circle cx="3" cy="14" r="0.7" fill={color} opacity={0.5} />
        <Circle cx="21" cy="10" r="0.6" fill={color} opacity={0.5} />

        {/* Motion trails from core */}
        <Path
          d="M10 10L7 7M14 10L17 7M10 14L7 17M14 14L17 17"
          stroke={color}
          strokeWidth="1.5"
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
      {/* Outer pulse ring */}
      <Circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity={0.4}
        strokeDasharray="3 2"
      />

      {/* Middle pulse ring */}
      <Circle
        cx="12"
        cy="12"
        r="6"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        opacity={0.6}
      />

      {/* Central diamond core - outline */}
      <Polygon
        points="12,7 15,12 12,17 9,12"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Energy burst rays */}
      <Path
        d="M12 2V4M12 20V22"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <Path
        d="M4.5 4.5L6 6M18 18L19.5 19.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.7}
      />
      <Path
        d="M2 12H4M20 12H22"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <Path
        d="M4.5 19.5L6 18M18 6L19.5 4.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.7}
      />

      {/* Floating energy particles */}
      <Circle cx="5" cy="8" r="1" fill={color} opacity={0.6} />
      <Circle cx="19" cy="16" r="0.8" fill={color} opacity={0.5} />
      <Circle cx="17" cy="6" r="0.7" fill={color} opacity={0.5} />
    </Svg>
  );
};

export default SmuppyEnergyBurstIcon;
