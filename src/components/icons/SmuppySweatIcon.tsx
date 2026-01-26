import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppySweatIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}

/**
 * Smuppy Sweat Icon - Face with sweat drops showing intense effort
 * Used for "Intense", "Hard work", "Effort" reactions
 * Shows the grind and dedication of fitness
 */
const SmuppySweatIcon: React.FC<SmuppySweatIconProps> = ({
  size = 24,
  color = '#5AC8FA',
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
        {/* Face */}
        <Circle cx="12" cy="12" r="9" fill="#FFD93D" />

        {/* Determined eyebrows */}
        <Path
          d="M7 8L10 9M14 9L17 8"
          stroke="#1C1C1E"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Focused eyes */}
        <Circle cx="9" cy="11" r="1.5" fill="#1C1C1E" />
        <Circle cx="15" cy="11" r="1.5" fill="#1C1C1E" />

        {/* Gritting teeth / effort mouth */}
        <Path
          d="M9 16H15"
          stroke="#1C1C1E"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Path
          d="M10 15V17M12 15V17M14 15V17"
          stroke="#1C1C1E"
          strokeWidth="1"
          strokeLinecap="round"
        />

        {/* Sweat drops */}
        <Path
          d="M19 8C19 8 20 10 20 11C20 12.1 19.1 13 18 13C16.9 13 16 12.1 16 11C16 10 17 8 17 8L18 6L19 8Z"
          fill={color}
        />
        <Path
          d="M5 10C5 10 6 11.5 6 12.5C6 13.3 5.3 14 4.5 14C3.7 14 3 13.3 3 12.5C3 11.5 4 10 4 10L4.5 8.5L5 10Z"
          fill={color}
          opacity={0.8}
        />
        <Path
          d="M21 14C21 14 21.5 15 21.5 15.5C21.5 16 21 16.5 20.5 16.5C20 16.5 19.5 16 19.5 15.5C19.5 15 20 14 20 14L20.5 13L21 14Z"
          fill={color}
          opacity={0.6}
        />

        {/* Motion lines showing effort */}
        <Path
          d="M1 6L2 7M23 7L22 8M2 18L3 17"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
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
      {/* Face outline */}
      <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.8" fill="none" />

      {/* Determined eyebrows */}
      <Path
        d="M7 9L10 10M14 10L17 9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Eyes */}
      <Circle cx="9" cy="12" r="1" fill={color} />
      <Circle cx="15" cy="12" r="1" fill={color} />

      {/* Effort mouth */}
      <Path
        d="M9 16H15"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Sweat drops */}
      <Path
        d="M19 7C19 7 20 9 20 10C20 10.8 19.3 11.5 18.5 11.5C17.7 11.5 17 10.8 17 10C17 9 18 7 18 7L18.5 5.5L19 7Z"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      <Path
        d="M4 11L4.5 9L5 11C5 11 5.5 12 5.5 12.5C5.5 13 5 13.5 4.5 13.5C4 13.5 3.5 13 3.5 12.5C3.5 12 4 11 4 11Z"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity={0.7}
      />
    </Svg>
  );
};

export default SmuppySweatIcon;
