/**
 * Safe Mapbox import wrapper.
 * Guards against missing native module so the app doesn't crash
 * when built without native Mapbox support (e.g., Expo Go or JS-only dev builds).
 *
 * Usage:
 *   import { Mapbox, MapView, Camera, MarkerView, isMapboxAvailable } from '../../utils/mapbox-safe';
 *   if (!isMapboxAvailable) return <Text>Map not available</Text>;
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Mapbox: any = null;

try {
  _Mapbox = require('@rnmapbox/maps');
} catch {
  if (__DEV__) console.warn('[Mapbox] Native module not available');
}

export const isMapboxAvailable = _Mapbox !== null;

// Re-export Mapbox namespace (the default export) and named components.
// All consumers MUST guard with `isMapboxAvailable` before rendering.
// We use `any` for the runtime fallback — at runtime these are either real
// Mapbox components or null. TypeScript consumers see the original types.
export const Mapbox = _Mapbox?.default;
export const MapView = _Mapbox?.MapView;
export const Camera = _Mapbox?.Camera;
export const MarkerView = _Mapbox?.MarkerView;
export const PointAnnotation = _Mapbox?.PointAnnotation;
export const LocationPuck = _Mapbox?.LocationPuck;
export const ShapeSource = _Mapbox?.ShapeSource;
export const LineLayer = _Mapbox?.LineLayer;

/** Placeholder shown when Mapbox is not available */
export function MapPlaceholder({ style }: Readonly<{ style?: object }>) {
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.placeholderText}>Map not available</Text>
      <Text style={styles.placeholderSubtext}>Rebuild with: npx expo run:ios</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  placeholderText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderSubtext: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});
