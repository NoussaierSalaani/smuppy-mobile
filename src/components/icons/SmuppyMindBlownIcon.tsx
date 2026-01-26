import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface SmuppyMindBlownIconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

/**
 * Smuppy Mind Blown Icon - Head with explosion effect
 * Used for "Wow", "Amazing", "Mind blown" reactions
 */
const SmuppyMindBlownIcon: React.FC<SmuppyMindBlownIconProps> = ({
  size = 24,
  color = '#AF52DE',
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
      {/* Head base */}
      <Circle
        cx="12"
        cy="14"
        r="7"
        fill={color}
      />
      {/* Face highlight */}
      <Circle
        cx="12"
        cy="14"
        r="5"
        fill="#FFFFFF"
        opacity={0.2}
      />
      {/* Eyes - wide open in amazement */}
      <Circle cx="9.5" cy="13" r="1.5" fill="#FFFFFF" />
      <Circle cx="14.5" cy="13" r="1.5" fill="#FFFFFF" />
      <Circle cx="9.5" cy="13" r="0.8" fill="#1C1C1E" />
      <Circle cx="14.5" cy="13" r="0.8" fill="#1C1C1E" />
      {/* Mouth - O shape */}
      <Circle
        cx="12"
        cy="16.5"
        r="1.5"
        stroke="#1C1C1E"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Explosion lines from top of head */}
      <Path
        d="M12 7V3M8 8L5 4M16 8L19 4M6 11L2 10M18 11L22 10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Explosion particles */}
      <Circle cx="12" cy="1" r="1" fill={color} />
      <Circle cx="4" cy="3" r="0.8" fill={color} opacity={0.8} />
      <Circle cx="20" cy="3" r="0.8" fill={color} opacity={0.8} />
      <Circle cx="1" cy="9" r="0.6" fill={color} opacity={0.6} />
      <Circle cx="23" cy="9" r="0.6" fill={color} opacity={0.6} />
      {/* Small star sparkles */}
      <Path
        d="M7 2L7.5 1L8 2L7.5 3L7 2Z"
        fill={color}
      />
      <Path
        d="M16 2L16.5 1L17 2L16.5 3L16 2Z"
        fill={color}
      />
    </Svg>
  );
};

export default SmuppyMindBlownIcon;
