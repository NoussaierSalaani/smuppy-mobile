// src/components/LazyMapView.tsx
// Lazy-loaded MapView component to improve initial load performance
import React, { useState, useEffect, forwardRef, memo } from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import type { Feature } from 'geojson';
import Constants from 'expo-constants';
import { useTheme } from '../hooks/useTheme';

let tokenSet = false;

// Types for MapView props (Mapbox-compatible)
interface LazyMapViewProps {
  style?: ViewStyle;
  centerCoordinate?: [number, number]; // [lng, lat]
  zoomLevel?: number;
  onPress?: (feature: Feature) => void;
  children?: React.ReactNode;
  showsUserLocation?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
}

// Lazy-loaded MapView component
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mapbox types not available at top level due to lazy import
const LazyMapView = memo(forwardRef<any, LazyMapViewProps>((props, ref) => {
  const { colors } = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamically loaded native components
  const [MapViewComponent, setMapViewComponent] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [CameraComponent, setCameraComponent] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [LocationPuckComponent, setLocationPuckComponent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadMapView = async () => {
      try {
        const maps = await import('@rnmapbox/maps');
        if (!tokenSet) {
          const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
          if (mapboxToken) maps.default.setAccessToken(mapboxToken);
          tokenSet = true;
        }
        if (mounted) {
          setMapViewComponent(() => maps.default.MapView);
          setCameraComponent(() => maps.default.Camera);
          setLocationPuckComponent(() => maps.default.LocationPuck);
          setIsLoading(false);
        }
      } catch (error) {
        if (__DEV__) console.warn('Failed to load MapView:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadMapView();

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading || !MapViewComponent) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.darkGray }, props.style]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { centerCoordinate, zoomLevel, showsUserLocation, scrollEnabled, zoomEnabled, onPress, style, children } = props;

  return (
    <MapViewComponent
      ref={ref}
      style={style}
      onPress={onPress}
      scrollEnabled={scrollEnabled}
      zoomEnabled={zoomEnabled}
    >
      {CameraComponent && centerCoordinate && (
        <CameraComponent centerCoordinate={centerCoordinate} zoomLevel={zoomLevel ?? 12} />
      )}
      {showsUserLocation && LocationPuckComponent && <LocationPuckComponent />}
      {children}
    </MapViewComponent>
  );
}));

// Props for the lazy-loaded MarkerView
interface LazyMarkerProps {
  children: React.ReactElement;
  coordinate?: { latitude: number; longitude: number };
  coordinateArray?: [number, number];
}

// Export MarkerView separately for use in parent components
export const LazyMarker = memo(({ children, coordinate, coordinateArray }: LazyMarkerProps) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamically loaded native component
  const [MarkerViewComponent, setMarkerViewComponent] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import('@rnmapbox/maps').then((maps) => {
      if (mounted) {
        setMarkerViewComponent(() => maps.default.MarkerView);
      }
    });
    return () => { mounted = false; };
  }, []);

  // Convert coordinate from {latitude, longitude} to [lng, lat]
  const coord: [number, number] | undefined = coordinate
    ? [coordinate.longitude, coordinate.latitude]
    : coordinateArray;

  if (!MarkerViewComponent || !coord) return null;

  return (
    <MarkerViewComponent coordinate={coord}>
      {children}
    </MarkerViewComponent>
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
