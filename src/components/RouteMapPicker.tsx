/**
 * RouteMapPicker
 * Reusable map component for selecting locations and drawing routes.
 * Used in: CreateEventScreen, CreateGroupScreen, SuggestSpotScreen
 *
 * Features:
 * - Tap to set single location OR start/end points
 * - Mapbox Directions API for intelligent route calculation
 * - Walking/cycling profile based on activity type
 * - Distance, duration, difficulty display
 * - Waypoint support (tap to add intermediate points)
 * - Undo / clear controls
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { MapView, Camera, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, GRADIENTS } from '../config/theme';
import {
  calculateRoute,
  formatDistance,
  formatDuration,
  getRouteProfile,
  type Coordinate,
  type RouteResult,
} from '../services/mapbox-directions';
import type { RouteProfile, DifficultyLevel } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const normalize = (size: number) => Math.round(size * (SCREEN_WIDTH / 390));

// ============================================
// TYPES
// ============================================

export interface RouteMapPickerProps {
  /** Mode: 'location' for single point, 'route' for start/end with directions */
  mode: 'location' | 'route';
  /** Activity type to determine route profile (running, cycling, etc.) */
  activityType?: string;
  /** Lock location to a specific point (pro business non-premium) */
  lockedLocation?: { latitude: number; longitude: number; address?: string };
  /** Location name input value */
  locationName: string;
  /** Callback when location name changes */
  onLocationNameChange: (name: string) => void;
  /** Callback when coordinates are selected (single location mode) */
  onCoordinateSelect?: (coord: { lat: number; lng: number }) => void;
  /** Callback when a route is calculated */
  onRouteCalculated?: (result: RouteResult & {
    start: Coordinate;
    end: Coordinate;
    waypoints: Coordinate[];
    profile: RouteProfile;
  }) => void;
  /** Callback when route is cleared */
  onRouteClear?: () => void;
}

export interface RouteMapPickerRef {
  clearRoute: () => void;
}

const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  easy: '#4ECDC4',
  medium: '#FFD700',
  hard: '#FF6B6B',
  expert: '#9B59B6',
};

// ============================================
// COMPONENT
// ============================================

export default function RouteMapPicker({
  mode,
  activityType = 'walking',
  lockedLocation,
  locationName,
  onLocationNameChange,
  onCoordinateSelect,
  onRouteCalculated,
  onRouteClear,
}: RouteMapPickerProps) {
  const cameraRef = useRef<Camera>(null);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Single location mode
  const [selectedPoint, setSelectedPoint] = useState<Coordinate | null>(
    lockedLocation ? { lat: lockedLocation.latitude, lng: lockedLocation.longitude } : null
  );

  // Route mode
  const [routeStart, setRouteStart] = useState<Coordinate | null>(null);
  const [routeEnd, setRouteEnd] = useState<Coordinate | null>(null);
  const [waypoints, setWaypoints] = useState<Coordinate[]>([]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);

  const profile = getRouteProfile(activityType);

  // ============================================
  // INIT
  // ============================================

  const getUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (_e) { /* Location unavailable */ }
  }, []);

  useEffect(() => {
    if (!lockedLocation) {
      getUserLocation();
    }
  }, [lockedLocation, getUserLocation]);

  // ============================================
  // ROUTE CALCULATION
  // ============================================

  const computeRoute = useCallback(async (
    start: Coordinate,
    end: Coordinate,
    wp: Coordinate[],
  ) => {
    setIsCalculating(true);
    try {
      const result = await calculateRoute(start, end, wp, profile);
      setRouteResult(result);

      // Build GeoJSON for map display
      setRouteGeoJSON({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: result.geojson,
        }],
      });

      onRouteCalculated?.({
        ...result,
        start,
        end,
        waypoints: wp,
        profile,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.warn('[RouteMapPicker] Route calculation failed:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsCalculating(false);
    }
  }, [profile, onRouteCalculated]);

  // ============================================
  // MAP INTERACTION
  // ============================================

  const handleMapPress = useCallback((event: any) => {
    if (lockedLocation) return; // Location is locked

    const { geometry } = event;
    if (!geometry?.coordinates) return;

    const [lng, lat] = geometry.coordinates;
    const coord: Coordinate = { lat, lng };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (mode === 'location') {
      setSelectedPoint(coord);
      onCoordinateSelect?.(coord);
      return;
    }

    // Route mode
    if (!routeStart) {
      setRouteStart(coord);
    } else if (!routeEnd) {
      setRouteEnd(coord);
      computeRoute(routeStart, coord, waypoints);
    } else {
      // Add waypoint and recalculate
      const newWaypoints = [...waypoints, coord];
      setWaypoints(newWaypoints);
      computeRoute(routeStart, routeEnd, newWaypoints);
    }
  }, [mode, lockedLocation, routeStart, routeEnd, waypoints, computeRoute, onCoordinateSelect]);

  const undoLastPoint = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (waypoints.length > 0) {
      const newWaypoints = waypoints.slice(0, -1);
      setWaypoints(newWaypoints);
      if (routeStart && routeEnd) {
        computeRoute(routeStart, routeEnd, newWaypoints);
      }
    } else if (routeEnd) {
      setRouteEnd(null);
      setRouteResult(null);
      setRouteGeoJSON(null);
      onRouteClear?.();
    } else if (routeStart) {
      setRouteStart(null);
    }
  }, [waypoints, routeStart, routeEnd, computeRoute, onRouteClear]);

  const clearAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRouteStart(null);
    setRouteEnd(null);
    setWaypoints([]);
    setRouteResult(null);
    setRouteGeoJSON(null);
    setSelectedPoint(null);
    onRouteClear?.();
  }, [onRouteClear]);

  const centerOnUser = useCallback(() => {
    const center = lockedLocation
      ? { lat: lockedLocation.latitude, lng: lockedLocation.longitude }
      : userLocation;
    if (center && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [center.lng, center.lat],
        zoomLevel: 14,
        animationDuration: 600,
      });
    }
  }, [userLocation, lockedLocation]);

  // ============================================
  // DEFAULT CENTER
  // ============================================

  const defaultCenter: [number, number] = lockedLocation
    ? [lockedLocation.longitude, lockedLocation.latitude]
    : userLocation
    ? [userLocation.lng, userLocation.lat]
    : [-73.5673, 45.5017]; // Montreal fallback

  // ============================================
  // RENDER
  // ============================================

  const hasPoints = mode === 'route' ? !!routeStart : !!selectedPoint;

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          styleURL="mapbox://styles/mapbox/streets-v12"
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
          onPress={handleMapPress}
        >
          <Camera
            ref={cameraRef}
            zoomLevel={13}
            centerCoordinate={defaultCenter}
            animationMode="flyTo"
            animationDuration={500}
          />

          {/* Single location pin */}
          {mode === 'location' && selectedPoint && (
            <MarkerView coordinate={[selectedPoint.lng, selectedPoint.lat]}>
              <View style={styles.pinContainer}>
                <LinearGradient colors={GRADIENTS.primary} style={styles.pin}>
                  <Ionicons name="location" size={normalize(20)} color={COLORS.white} />
                </LinearGradient>
                <View style={styles.pinShadow} />
              </View>
            </MarkerView>
          )}

          {/* Route start pin */}
          {mode === 'route' && routeStart && (
            <MarkerView coordinate={[routeStart.lng, routeStart.lat]}>
              <View style={styles.routePinContainer}>
                <View style={[styles.routePin, { backgroundColor: '#4ECDC4' }]}>
                  <Text style={styles.routePinText}>S</Text>
                </View>
              </View>
            </MarkerView>
          )}

          {/* Route end pin */}
          {mode === 'route' && routeEnd && (
            <MarkerView coordinate={[routeEnd.lng, routeEnd.lat]}>
              <View style={styles.routePinContainer}>
                <View style={[styles.routePin, { backgroundColor: '#FF6B6B' }]}>
                  <Text style={styles.routePinText}>E</Text>
                </View>
              </View>
            </MarkerView>
          )}

          {/* Waypoints */}
          {waypoints.map((wp, index) => (
            <MarkerView key={`wp-${index}`} coordinate={[wp.lng, wp.lat]}>
              <View style={styles.routePinContainer}>
                <View style={[styles.routePin, { backgroundColor: COLORS.primary }]}>
                  <Text style={styles.routePinText}>{index + 1}</Text>
                </View>
              </View>
            </MarkerView>
          ))}

          {/* Route line */}
          {routeGeoJSON && (
            <ShapeSource id="routeLine" shape={routeGeoJSON}>
              <LineLayer
                id="routeLineLayer"
                style={{
                  lineColor: COLORS.primary,
                  lineWidth: 4,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 0.85,
                }}
              />
            </ShapeSource>
          )}
        </MapView>

        {/* Map controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.mapControlButton} onPress={centerOnUser}>
            <Ionicons name="navigate" size={normalize(20)} color={COLORS.primary} />
          </TouchableOpacity>
          {hasPoints && (
            <>
              <TouchableOpacity style={styles.mapControlButton} onPress={undoLastPoint}>
                <Ionicons name="arrow-undo" size={normalize(20)} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapControlButton} onPress={clearAll}>
                <Ionicons name="trash-outline" size={normalize(20)} color="#FF6B6B" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Loading overlay */}
        {isCalculating && (
          <View style={styles.calculatingOverlay}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.calculatingText}>Calculating route...</Text>
          </View>
        )}

        {/* Hint text */}
        {!hasPoints && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>
              {lockedLocation
                ? 'Location is set to your business address'
                : mode === 'route'
                ? 'Tap to set the start point'
                : 'Tap to set the location'}
            </Text>
          </View>
        )}

        {mode === 'route' && routeStart && !routeEnd && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Tap to set the end point</Text>
          </View>
        )}

        {mode === 'route' && routeEnd && !isCalculating && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Tap to add waypoints</Text>
          </View>
        )}
      </View>

      {/* Location name input */}
      <View style={styles.locationInput}>
        <Ionicons name="location-outline" size={normalize(18)} color={COLORS.gray} />
        <TextInput
          style={styles.locationTextInput}
          placeholder="Location name (e.g. Parc Lafontaine)"
          placeholderTextColor={COLORS.gray400}
          value={locationName}
          onChangeText={onLocationNameChange}
          editable={!lockedLocation}
        />
      </View>

      {/* Route info card */}
      {routeResult && (
        <View style={styles.routeInfoCard}>
          <View style={styles.routeInfoRow}>
            <View style={styles.routeInfoItem}>
              <Ionicons name="map-outline" size={normalize(16)} color={COLORS.primary} />
              <Text style={styles.routeInfoValue}>{formatDistance(routeResult.distanceKm)}</Text>
              <Text style={styles.routeInfoLabel}>Distance</Text>
            </View>
            <View style={styles.routeInfoDivider} />
            <View style={styles.routeInfoItem}>
              <Ionicons name="time-outline" size={normalize(16)} color={COLORS.primary} />
              <Text style={styles.routeInfoValue}>{formatDuration(routeResult.durationMin)}</Text>
              <Text style={styles.routeInfoLabel}>Est. time</Text>
            </View>
            <View style={styles.routeInfoDivider} />
            <View style={styles.routeInfoItem}>
              <Ionicons name="trending-up" size={normalize(16)} color={DIFFICULTY_COLORS[routeResult.difficulty]} />
              <Text style={[styles.routeInfoValue, { color: DIFFICULTY_COLORS[routeResult.difficulty] }]}>
                {routeResult.difficulty.charAt(0).toUpperCase() + routeResult.difficulty.slice(1)}
              </Text>
              <Text style={styles.routeInfoLabel}>Difficulty</Text>
            </View>
          </View>
          <Text style={styles.routeInfoProfile}>
            Route optimized for {profile === 'cycling' ? 'cycling paths' : 'pedestrian paths'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    height: 300,
    borderRadius: normalize(16),
    overflow: 'hidden',
    backgroundColor: COLORS.gray100,
  },
  map: {
    flex: 1,
  },

  // Pins
  pinContainer: { alignItems: 'center' },
  pin: {
    width: normalize(36),
    height: normalize(36),
    borderRadius: normalize(18),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pinShadow: {
    width: normalize(12),
    height: normalize(4),
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: normalize(6),
    marginTop: 2,
  },
  routePinContainer: { alignItems: 'center' },
  routePin: {
    width: normalize(30),
    height: normalize(30),
    borderRadius: normalize(15),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  routePinText: {
    fontSize: normalize(13),
    fontWeight: '700',
    color: COLORS.white,
  },

  // Map controls
  mapControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8,
  },
  mapControlButton: {
    width: normalize(38),
    height: normalize(38),
    borderRadius: normalize(19),
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  // Calculating overlay
  calculatingOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: normalize(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  calculatingText: {
    fontSize: normalize(12),
    color: COLORS.gray,
    fontWeight: '500',
  },

  // Hint
  hintContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: normalize(10),
    alignItems: 'center',
  },
  hintText: {
    fontSize: normalize(12),
    color: COLORS.white,
    fontWeight: '500',
  },

  // Location input
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: normalize(12),
    paddingHorizontal: 14,
    height: normalize(44),
    marginTop: 12,
    gap: 10,
  },
  locationTextInput: {
    flex: 1,
    fontSize: normalize(14),
    color: COLORS.dark,
  },

  // Route info card
  routeInfoCard: {
    backgroundColor: COLORS.white,
    borderRadius: normalize(14),
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
  },
  routeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  routeInfoItem: {
    alignItems: 'center',
    gap: 4,
  },
  routeInfoValue: {
    fontSize: normalize(16),
    fontWeight: '700',
    color: COLORS.dark,
  },
  routeInfoLabel: {
    fontSize: normalize(11),
    color: COLORS.gray,
  },
  routeInfoDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.grayBorder,
  },
  routeInfoProfile: {
    fontSize: normalize(11),
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: 10,
  },
});
