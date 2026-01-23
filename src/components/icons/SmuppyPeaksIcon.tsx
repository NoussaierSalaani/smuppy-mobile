import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyPeaksIconProps {
  size?: number;
  color?: string;
  gradientColors?: [string, string];
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * SmuppyPeaksIcon - Mountain peak icon for Peaks feature
 *
 * A stylized double mountain peak with the main peak prominent
 * Clean, modern design that works at all sizes
 *
 * Used in:
 * - Create options popup
 * - Bottom navigation
 * - Peak screens headers
 */
const SmuppyPeaksIcon: React.FC<SmuppyPeaksIconProps> = ({
  size = 24,
  color = '#0A0A0F',
  gradientColors,
  filled = true,
  style,
}) => {
  const useGradient = gradientColors && gradientColors.length === 2;

  if (filled) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={style}
      >
        {useGradient && (
          <Defs>
            <LinearGradient id="peakGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradientColors[0]} />
              <Stop offset="1" stopColor={gradientColors[1]} />
            </LinearGradient>
          </Defs>
        )}

        {/* Main peak - larger, centered */}
        <Path
          d="M12 3L20 19H4L12 3Z"
          fill={useGradient ? 'url(#peakGradient)' : color}
        />

        {/* Snow cap accent */}
        <Path
          d="M12 3L14.5 8L12 6.5L9.5 8L12 3Z"
          fill="white"
          opacity={0.9}
        />

        {/* Secondary smaller peak behind */}
        <Path
          d="M18 11L22 19H16L18 11Z"
          fill={useGradient ? 'url(#peakGradient)' : color}
          opacity={0.5}
        />
      </Svg>
    );
  }

  // Outline version
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      {/* Main peak outline */}
      <Path
        d="M12 4L19 18H5L12 4Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Snow cap line */}
      <Path
        d="M10 9L12 6L14 9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
      />

      {/* Secondary peak hint */}
      <Path
        d="M17 12L20 18"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.4}
      />
    </Svg>
  );
};

export default SmuppyPeaksIcon;
