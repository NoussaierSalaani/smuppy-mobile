import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { ViewStyle } from 'react-native';

type SmuppyRunnerIconProps = Readonly<{
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}>;

/**
 * Smuppy Runner Icon - Running figure with energy trail
 * Used for "Energy", "Speed", "Go!" reactions
 * Dynamic fitness icon showing motion and energy
 */
const SmuppyRunnerIcon: React.FC<SmuppyRunnerIconProps> = ({
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
        {/* Head */}
        <Circle cx="17" cy="5" r="2.5" fill={color} />

        {/* Body in running pose */}
        <Path
          d="M15 7L12 11L14 13L11 17L13 19"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Front arm */}
        <Path
          d="M15 9L18 7L20 8"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Back arm */}
        <Path
          d="M13 10L10 12"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Back leg */}
        <Path
          d="M12 13L9 15L7 14"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Energy trail lines */}
        <Path
          d="M4 8H7M3 12H6M4 16H7"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          opacity={0.8}
        />

        {/* Speed particles */}
        <Circle cx="2" cy="10" r="1" fill={color} opacity={0.5} />
        <Circle cx="1" cy="14" r="0.8" fill={color} opacity={0.4} />
        <Circle cx="3" cy="18" r="0.6" fill={color} opacity={0.3} />
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
      {/* Head */}
      <Circle cx="17" cy="5" r="2" stroke={color} strokeWidth="1.8" fill="none" />

      {/* Body in running pose */}
      <Path
        d="M15 7L12 11L14 13L11 17L13 19"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Arms */}
      <Path
        d="M15 9L18 7L20 8M13 10L10 12"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Back leg */}
      <Path
        d="M12 13L9 15L7 14"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Energy trail lines */}
      <Path
        d="M4 8H6M3 12H5M4 16H6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.6}
      />
    </Svg>
  );
};

export default SmuppyRunnerIcon;
