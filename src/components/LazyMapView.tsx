// src/components/LazyMapView.tsx
// Lazy-loaded MapView component to improve initial load performance
import React, { useState, useEffect, memo, forwardRef } from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Mapbox } from '../utils/mapbox-safe';
import type { Feature } from 'geojson';
import { useTheme } from '../hooks/useTheme';

// Token set once in App.js at startup

// Types for MapView props (Mapbox-compatible)
type LazyMapViewProps = Readonly<{
  style?: ViewStyle;
  centerCoordinate?: [number, number]; // [lng, lat]
  zoomLevel?: number;
  onPress?: (feature: Feature) => void;
  children?: React.ReactNode;
  showsUserLocation?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
}>;


// Lazy-loaded MapView component
const LazyMapView = memo(forwardRef<InstanceType<typeof Mapbox.MapView>, LazyMapViewProps>((props, ref) => {
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Defer map rendering to next frame to avoid blocking initial mount
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.darkGray }, props.style]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { centerCoordinate, zoomLevel, showsUserLocation, scrollEnabled, zoomEnabled, onPress, style, children } = props;

  return (
    <Mapbox.MapView
      ref={ref}
      style={style}
      onPress={onPress}
      scrollEnabled={scrollEnabled}
      zoomEnabled={zoomEnabled}
    >
      {centerCoordinate && (
        <Mapbox.Camera centerCoordinate={centerCoordinate} zoomLevel={zoomLevel ?? 12} />
      )}
      {showsUserLocation && <Mapbox.LocationPuck />}
      {children}
    </Mapbox.MapView>
  );
}));

// Props for the lazy-loaded MarkerView
type LazyMarkerProps = Readonly<{
  children: React.ReactElement;
  coordinate?: { latitude: number; longitude: number };
  coordinateArray?: [number, number];
}>;


// Export MarkerView separately for use in parent components
export const LazyMarker = memo(({ children, coordinate, coordinateArray }: LazyMarkerProps) => {
  // Convert coordinate from {latitude, longitude} to [lng, lat]
  const coord: [number, number] | undefined = coordinate
    ? [coordinate.longitude, coordinate.latitude]
    : coordinateArray;

  if (!coord) return null;

  return (
    <Mapbox.MarkerView coordinate={coord} allowOverlap allowOverlapWithPuck>
      <View collapsable={false}>
        {children}
      </View>
    </Mapbox.MarkerView>
  );
});

export default LazyMapView;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor set inline via theme colors.darkGray
  },
});
