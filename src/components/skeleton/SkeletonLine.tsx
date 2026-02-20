import React from 'react';
import { ViewStyle } from 'react-native';
import SkeletonBase from './SkeletonBase';

type SkeletonLineProps = Readonly<{
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
}>;

const SkeletonLine = ({ width = '100%', height = 14, style }: SkeletonLineProps) => {
  return <SkeletonBase width={width} height={height} borderRadius={7} style={style} />;
};

export default React.memo(SkeletonLine);
