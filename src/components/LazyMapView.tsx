// src/components/LazyMapView.tsx
// Lazy-loaded MapView component to improve initial load performance
import React, { useState, useEffect, forwardRef, memo } from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../config/theme';

// Types for MapView props (subset of react-native-maps)
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface LazyMapViewProps {
  style?: ViewStyle;
  region?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  onPress?: (event: any) => void;
  children?: React.ReactNode;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
}

// Lazy-loaded MapView component
const LazyMapView = memo(forwardRef<any, LazyMapViewProps>((props, ref) => {
  const [MapViewComponent, setMapViewComponent] = useState<any>(null);
  const [, setMarkerComponent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadMapView = async () => {
      try {
        const maps = await import('react-native-maps');
        if (mounted) {
          setMapViewComponent(() => maps.default);
          setMarkerComponent(() => maps.Marker);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to load MapView:', error);
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
      <View style={[styles.loadingContainer, props.style]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <MapViewComponent
      ref={ref}
      provider="google"
      {...props}
    />
  );
}));

// Export Marker separately for use in parent components
export const LazyMarker = memo(({ children, ...props }: any) => {
  const [MarkerComponent, setMarkerComponent] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import('react-native-maps').then((maps) => {
      if (mounted) {
        setMarkerComponent(() => maps.Marker);
      }
    });
    return () => { mounted = false; };
  }, []);

  if (!MarkerComponent) return null;

  return <MarkerComponent {...props}>{children}</MarkerComponent>;
});

export default LazyMapView;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
