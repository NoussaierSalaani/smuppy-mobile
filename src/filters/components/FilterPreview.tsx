/**
 * Filter Preview Component
 * Renders camera feed with applied Skia filter in real-time
 */

import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import {
  Canvas,
  Image,
  useImage,
  Skia,
  useCanvasRef,
  Group,
  Fill,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  runOnJS,
  useFrameCallback,
} from 'react-native-reanimated';
import { useFilters } from '../FilterContext';
import { shaderManager } from '../core/ShaderManager';
import { filterEngine } from '../core/FilterEngine';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FilterPreviewProps {
  imageSource?: string;
  width?: number;
  height?: number;
  showFps?: boolean;
  children?: React.ReactNode;
}

export function FilterPreview({
  imageSource,
  width = SCREEN_WIDTH,
  height = SCREEN_HEIGHT,
  showFps = false,
  children,
}: FilterPreviewProps) {
  const { activeFilter } = useFilters();

  // Animation time for shader effects
  const time = useSharedValue(0);

  // Frame callback for animation
  useFrameCallback((frameInfo) => {
    time.value = (frameInfo.timestamp / 1000) % 1000; // Wrap to prevent overflow
  });

  // Load image if provided
  const image = useImage(imageSource || '');

  // Get shader for active filter
  const shader = useMemo(() => {
    if (!activeFilter) return null;
    return shaderManager.getShader(activeFilter.filterId);
  }, [activeFilter?.filterId]);

  // Render filter effect
  const renderFilteredContent = useCallback(() => {
    if (!activeFilter || !shader) {
      // No filter - render placeholder or children
      return (
        <Fill color="transparent" />
      );
    }

    // Create uniforms array for shader
    const uniforms = [
      activeFilter.intensity,
      width,
      height,
      time.value,
    ];

    return (
      <Group>
        {image && (
          <Image
            image={image}
            x={0}
            y={0}
            width={width}
            height={height}
            fit="cover"
          />
        )}
      </Group>
    );
  }, [activeFilter, shader, image, width, height]);

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {renderFilteredContent()}
      </Canvas>

      {/* Overlay children (overlays, UI elements) */}
      {children}

      {/* FPS counter */}
      {showFps && (
        <View style={styles.fpsContainer}>
          <Animated.Text style={styles.fpsText}>
            {Math.round(filterEngine.getFps())} FPS
          </Animated.Text>
        </View>
      )}
    </View>
  );
}

/**
 * Filter Preview Overlay
 * Use this component to overlay filter preview on top of camera
 */
interface FilterOverlayProps {
  width?: number;
  height?: number;
}

export function FilterOverlay({
  width = SCREEN_WIDTH,
  height = SCREEN_HEIGHT,
}: FilterOverlayProps) {
  const { activeFilter, activeOverlays } = useFilters();
  const time = useSharedValue(0);

  // Frame callback for animations
  useFrameCallback((frameInfo) => {
    time.value = (frameInfo.timestamp / 1000) % 1000;
  });

  // Get shader
  const shader = useMemo(() => {
    if (!activeFilter) return null;
    return shaderManager.getShader(activeFilter.filterId);
  }, [activeFilter?.filterId]);

  if (!activeFilter || !shader) {
    return null;
  }

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Fill color="transparent" />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  fpsContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  fpsText: {
    color: '#00E676',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
