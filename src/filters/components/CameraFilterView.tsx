/**
 * Camera Filter View
 * A reusable component that wraps CameraView with AR filter support
 */

import React, { forwardRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { CameraView, CameraType, CameraMode } from 'expo-camera';
import { Canvas, Group, useImage, Image } from '@shopify/react-native-skia';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useFilters } from '../../stores/filterStore';
import { shaderManager } from '../core/ShaderManager';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CameraFilterViewProps {
  facing: CameraType;
  mode?: CameraMode;
  style?: import('react-native').ViewStyle;
  children?: React.ReactNode;
  onCameraReady?: () => void;
}

/**
 * CameraFilterView - Camera with AR filter overlay
 *
 * Note: Due to expo-camera limitations, filters are rendered as an overlay.
 * For actual filter baking into video, post-processing is required.
 */
export const CameraFilterView = forwardRef<CameraView, CameraFilterViewProps>(
  ({ facing, mode = 'video', style, children, onCameraReady }, ref) => {
    const { activeFilter } = useFilters();

    // Animation time for shader effects
    const time = useSharedValue(0);

    // Frame callback for animation
    useFrameCallback((frameInfo) => {
      time.value = (frameInfo.timestamp / 1000) % 1000;
    });

    // Get shader for active filter
    // Only recompute when filterId changes, not when other activeFilter props change
    const shader = useMemo(() => {
      if (!activeFilter) return null;
      return shaderManager.getShader(activeFilter.filterId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFilter?.filterId]);

    return (
      <View style={[styles.container, style]}>
        {/* Camera View */}
        <CameraView
          ref={ref}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode={mode}
          onCameraReady={onCameraReady}
        />

        {/* Filter info overlay (visual indicator only) */}
        {activeFilter && shader && (
          <View style={styles.filterIndicator} pointerEvents="none">
            {/* The actual filter effect will be applied during post-processing */}
          </View>
        )}

        {/* Children (UI elements like record button, header, etc.) */}
        {children}
      </View>
    );
  }
);

/**
 * FilteredImageView - Display an image with filter applied
 * Use this for previewing filtered images/video frames
 */
interface FilteredImageViewProps {
  imageSource: string;
  width?: number;
  height?: number;
  style?: import('react-native').ViewStyle;
}

export function FilteredImageView({
  imageSource,
  width = SCREEN_WIDTH,
  height = SCREEN_HEIGHT,
  style,
}: FilteredImageViewProps) {
  const { activeFilter } = useFilters();
  const image = useImage(imageSource);
  const time = useSharedValue(0);

  useFrameCallback((frameInfo) => {
    time.value = (frameInfo.timestamp / 1000) % 1000;
  });

  // Only recompute when filterId changes, not when other activeFilter props change
  const shader = useMemo(() => {
    if (!activeFilter) return null;
    return shaderManager.getShader(activeFilter.filterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter?.filterId]);

  if (!image) {
    return <View style={[styles.container, { width, height }, style]} />;
  }

  // If no filter, just show the image
  if (!activeFilter || !shader) {
    return (
      <Canvas style={[{ width, height }, style]}>
        <Image
          image={image}
          x={0}
          y={0}
          width={width}
          height={height}
          fit="cover"
        />
      </Canvas>
    );
  }

  // With filter applied
  return (
    <Canvas style={[{ width, height }, style]}>
      <Group>
        <Image
          image={image}
          x={0}
          y={0}
          width={width}
          height={height}
          fit="cover"
        />
        {/* Filter shader would be applied here via runtime shader */}
        {/* Note: Full shader integration requires additional Skia setup */}
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  filterIndicator: {
    ...StyleSheet.absoluteFillObject,
    // Visual filter effect would go here
    // For now, actual filtering happens in post-processing
  },
});
