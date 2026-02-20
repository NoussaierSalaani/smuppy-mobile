import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ViewStyle } from 'react-native';

type SmuppyFireIconProps = Readonly<{
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
}>;

/**
 * Smuppy Fire Icon - Flame with energy pulse lines
 * Used for "Hot" content, trending posts, and intensity indicators
 */
const SmuppyFireIcon: React.FC<SmuppyFireIconProps> = ({
  size = 24,
  color = '#FF6B35',
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
        {/* Main flame - filled */}
        <Path
          d="M12 23C16.4183 23 20 19.4183 20 15C20 11.5 17.5 8.5 16 7C16 9 14.5 10 13 9C13 7 12 4 9 2C9 5 7 7 5 9C3.5 10.5 4 13 4 15C4 19.4183 7.58172 23 12 23Z"
          fill={color}
        />
        {/* Inner flame highlight */}
        <Path
          d="M12 20C14.2091 20 16 18.2091 16 16C16 14 14.5 12.5 14 12C14 13 13 13.5 12 13C12 12 11.5 10.5 10 9.5C10 11 9 12 8 13C7.25 13.75 7.5 15 7.5 16C7.5 18.2091 9.79086 20 12 20Z"
          fill="#FFD93D"
        />
        {/* Energy pulse lines */}
        <Path
          d="M2 12C2.5 11 3 10.5 3.5 10M21.5 10C21 10.5 20.5 11 20 12"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={0.7}
        />
        <Path
          d="M1 15C1.8 14.5 2.3 14 2.8 13.5M22 15C21.2 14.5 20.7 14 20.2 13.5"
          stroke={color}
          strokeWidth="1.2"
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
      {/* Main flame outline */}
      <Path
        d="M12 23C16.4183 23 20 19.4183 20 15C20 11.5 17.5 8.5 16 7C16 9 14.5 10 13 9C13 7 12 4 9 2C9 5 7 7 5 9C3.5 10.5 4 13 4 15C4 19.4183 7.58172 23 12 23Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner flame */}
      <Path
        d="M12 19C13.6569 19 15 17.6569 15 16C15 14.5 14 13.5 13.5 13C13.5 13.8 12.8 14.2 12 13.8C12 13 11.6 11.8 10.5 11C10.5 12.2 9.8 13 9 13.5C8.4 14 8.5 15 8.5 16C8.5 17.6569 10.3431 19 12 19Z"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Energy pulse lines */}
      <Path
        d="M2.5 11.5C3 11 3.3 10.5 3.8 10M20.5 11.5C20 11 19.7 10.5 19.2 10"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity={0.6}
      />
    </Svg>
  );
};

export default SmuppyFireIcon;

// Export variants for easy use
export const SmuppyFireOutline: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#FF6B35',
}) => <SmuppyFireIcon size={size} color={color} filled={false} />;

export const SmuppyFireFilled: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#FF6B35',
}) => <SmuppyFireIcon size={size} color={color} filled={true} />;
