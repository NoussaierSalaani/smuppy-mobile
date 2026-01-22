import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ViewStyle } from 'react-native';

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
  color = '#1A2B3D',
  filled = false,
  style,
}) => {
  // Unified path: Heart outline with ECG integrated through the middle
  // The ECG "cuts" through the heart creating two distinct areas
  const heartWithECGPath =
    // Start from left side, go up to top of left lobe
    "M2 9.5C2 6 4.5 3 8 3c2 0 3.5 1.2 4 2.5" +
    // Continue to center where ECG starts, then ECG wave
    "L12 5.5" +
    // Right lobe top
    "C12.5 4.2 14 3 16 3c3.5 0 6 3 6 6.5" +
    // Right side going down to ECG entry point
    "c0 2-1 3.5-2 5" +
    // ECG enters from right
    "L17 12" +
    // ECG spike pattern (the characteristic heart monitor line)
    "l-1.5 3.5l-2-7l-2 7l-1.5-3.5" +
    // ECG exits to left
    "L7 12" +
    // Continue left side down
    "c-1-1.5-2-3-2-5" +
    // Close left side going back up (not needed since we have start point)
    "";

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
        {/* ECG line in white for filled version */}
        <Path
          d="M4.5 10.5h3l1.5 3 2.5-6 2.5 6 1.5-3h4"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  // Outline version matching the reference image:
  // Heart outline that integrates ECG as part of the shape
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
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M16.5 3C19.58 3 22 5.42 22 8.5c0 1.8-0.8 3.4-2 4.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Top curves connecting to center */}
      <Path
        d="M7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* ECG line across the middle */}
      <Path
        d="M4 13h3l1.5 3 3.5-8 3.5 8 1.5-3h3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Bottom point of heart */}
      <Path
        d="M4 13c1.5 2.5 5 6.5 8 8.35C15 19.5 18.5 15.5 20 13"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
};

export default SmuppyHeartIcon;
