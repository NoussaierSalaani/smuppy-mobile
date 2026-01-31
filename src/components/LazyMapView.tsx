// src/components/LazyMapView.tsx
// Lazy-loaded MapView component to improve initial load performance
import React, { useState, useEffect, forwardRef, memo } from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import Constants from 'expo-constants';
import { useTheme } from '../hooks/useTheme';

const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

// Types for MapView props (Mapbox-compatible)
interface LazyMapViewProps {
  style?: ViewStyle;
  centerCoordinate?: [number, number]; // [lng, lat]
  zoomLevel?: number;
  onPress?: (event: any) => void;
  children?: React.ReactNode;
  showsUserLocation?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
}

// Lazy-loaded MapView component
const LazyMapView = memo(forwardRef<any, LazyMapViewProps>((props, ref) => {
  const { colors } = useTheme();
  const [MapViewComponent, setMapViewComponent] = useState<any>(null);
  const [CameraComponent, setCameraComponent] = useState<any>(null);
  const [LocationPuckComponent, setLocationPuckComponent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadMapView = async () => {
      try {
        const maps = await import('@rnmapbox/maps');
        if (mounted) {
          setMapViewComponent(() => maps.default.MapView);
          setCameraComponent(() => maps.default.Camera);
          setLocationPuckComponent(() => maps.default.LocationPuck);
          setIsLoading(false);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to load MapView:', error);
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

// Export MarkerView separately for use in parent components
export const LazyMarker = memo(({ children, coordinate, ...props }: any) => {
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

  if (!MarkerViewComponent) return null;

  // Convert coordinate from {latitude, longitude} to [lng, lat]
  const coord = coordinate
    ? [coordinate.longitude, coordinate.latitude]
    : props.coordinateArray;

  return (
    <MarkerViewComponent coordinate={coord} {...props}>
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
