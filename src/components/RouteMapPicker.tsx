/**
 * RouteMapPicker
 * Reusable map component for selecting locations and drawing routes.
 * Used in: CreateEventScreen (event + group modes)
 *
 * UX:
 * - Map on top, address fields below
 * - Route mode: "Departure" + "Arrival" fields, auto-calculate route when both set
 * - Location mode: single "Location" field
 * - User can type address (Nominatim search) OR tap on map (reverse geocode fills active field)
 * - Stats card: distance, duration, difficulty, elevation (route mode only)
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Keyboard,
} from 'react-native';
import { MapView, Camera, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
type _OnPressEvent = { geometry: { coordinates: [number, number] } };
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { GRADIENTS, COLORS } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import {
  searchNominatim,
  reverseGeocodeNominatim,
  formatNominatimResult,
  type NominatimSearchResult,
} from '../config/api';
import {
  calculateRoute,
  formatDistance,
  formatDuration,
  getRouteProfile,
  type Coordinate,
  type RouteResult,
} from '../services/mapbox-directions';
import type { RouteProfile, DifficultyLevel } from '../types';
import type { FeatureCollection } from 'geojson';

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
  easy: COLORS.teal,
  medium: COLORS.gold,
  hard: COLORS.heartRed,
  expert: COLORS.purple,
};

type ActiveField = 'departure' | 'arrival' | 'location';

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
  const { colors } = useTheme();
  const cameraRef = useRef<Camera>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Active field for map tap → determines which field gets filled
  const [activeField, setActiveField] = useState<ActiveField>(
    mode === 'route' ? 'departure' : 'location'
  );

  // Single location mode
  const [selectedPoint, setSelectedPoint] = useState<Coordinate | null>(
    lockedLocation ? { lat: lockedLocation.latitude, lng: lockedLocation.longitude } : null
  );
  const [locationAddress, setLocationAddress] = useState(lockedLocation?.address || locationName || '');

  // Route mode — departure
  const [departureCoord, setDepartureCoord] = useState<Coordinate | null>(null);
  const [departureAddress, setDepartureAddress] = useState('');
  const [departureSearch, setDepartureSearch] = useState('');
  const [departureSuggestions, setDepartureSuggestions] = useState<NominatimSearchResult[]>([]);
  const [searchingDeparture, setSearchingDeparture] = useState(false);

  // Route mode — arrival
  const [arrivalCoord, setArrivalCoord] = useState<Coordinate | null>(null);
  const [arrivalAddress, setArrivalAddress] = useState('');
  const [arrivalSearch, setArrivalSearch] = useState('');
  const [arrivalSuggestions, setArrivalSuggestions] = useState<NominatimSearchResult[]>([]);
  const [searchingArrival, setSearchingArrival] = useState(false);

  // Location mode — search
  const [locationSearch, setLocationSearch] = useState(locationName || '');
  const [locationSuggestions, setLocationSuggestions] = useState<NominatimSearchResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);

  // Route data
  const [waypoints, setWaypoints] = useState<Coordinate[]>([]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<FeatureCollection | null>(null);

  const profile = getRouteProfile(activityType);

  const styles = useMemo(() => createStyles(colors), [colors]);

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

  // Cleanup search timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // ============================================
  // NOMINATIM SEARCH (debounced)
  // ============================================

  const searchAddress = useCallback((query: string, field: ActiveField) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (query.length < 3) {
      if (field === 'departure') setDepartureSuggestions([]);
      else if (field === 'arrival') setArrivalSuggestions([]);
      else setLocationSuggestions([]);
      return;
    }

    const setSearching = field === 'departure' ? setSearchingDeparture
      : field === 'arrival' ? setSearchingArrival
      : setSearchingLocation;

    setSearching(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchNominatim(query, { limit: 5 });
        if (field === 'departure') setDepartureSuggestions(results);
        else if (field === 'arrival') setArrivalSuggestions(results);
        else setLocationSuggestions(results);
      } catch (_e) {
        // Search failed silently
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  // ============================================
  // REVERSE GEOCODE (map tap → address)
  // ============================================

  const reverseGeocode = useCallback(async (coord: Coordinate): Promise<string> => {
    try {
      const result = await reverseGeocodeNominatim(coord.lat, coord.lng);
      if (result) {
        const formatted = formatNominatimResult(result);
        return formatted.mainText + (formatted.secondaryText ? ', ' + formatted.secondaryText : '');
      }
    } catch (_e) { /* Reverse geocode failed */ }
    return `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
  }, []);

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
      if (__DEV__) console.warn('[RouteMapPicker] Route calculation failed:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsCalculating(false);
    }
  }, [profile, onRouteCalculated]);

  // Auto-calculate when both departure and arrival are set
  useEffect(() => {
    if (mode === 'route' && departureCoord && arrivalCoord) {
      computeRoute(departureCoord, arrivalCoord, waypoints);
    }
  }, [mode, departureCoord, arrivalCoord, waypoints, computeRoute]);

  // ============================================
  // MAP INTERACTION
  // ============================================

  const fitMapToPoints = useCallback((points: Coordinate[]) => {
    if (!cameraRef.current || points.length < 2) return;
    const lngs = points.map(p => p.lng);
    const lats = points.map(p => p.lat);
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
    cameraRef.current.fitBounds(ne, sw, [60, 60, 60, 60], 600);
  }, []);

  const handleMapPress = useCallback(async (event: any) => {
    if (lockedLocation) return;

    const { geometry } = event;
    if (!geometry?.coordinates) return;

    const [lng, lat] = geometry.coordinates;
    const coord: Coordinate = { lat, lng };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (mode === 'location') {
      setSelectedPoint(coord);
      onCoordinateSelect?.(coord);
      // Reverse geocode to fill address
      const address = await reverseGeocode(coord);
      setLocationAddress(address);
      setLocationSearch(address);
      onLocationNameChange(address);
      setLocationSuggestions([]);
      return;
    }

    // Route mode — fill active field
    if (activeField === 'departure' || (!departureCoord && !arrivalCoord)) {
      setDepartureCoord(coord);
      const address = await reverseGeocode(coord);
      setDepartureAddress(address);
      setDepartureSearch(address);
      setDepartureSuggestions([]);
      // Auto-advance to arrival
      setActiveField('arrival');
      // Move camera to show both points if arrival already exists
      if (arrivalCoord) {
        fitMapToPoints([coord, arrivalCoord]);
      }
    } else if (activeField === 'arrival' || (departureCoord && !arrivalCoord)) {
      setArrivalCoord(coord);
      const address = await reverseGeocode(coord);
      setArrivalAddress(address);
      setArrivalSearch(address);
      setArrivalSuggestions([]);
      // Fit map to show full route
      if (departureCoord) {
        fitMapToPoints([departureCoord, coord]);
      }
    } else {
      // Both set — add waypoint
      const newWaypoints = [...waypoints, coord];
      setWaypoints(newWaypoints);
    }
  }, [mode, lockedLocation, activeField, departureCoord, arrivalCoord, waypoints, reverseGeocode, onCoordinateSelect, onLocationNameChange, fitMapToPoints]);

  // ============================================
  // SUGGESTION SELECT
  // ============================================

  const selectSuggestion = useCallback((result: NominatimSearchResult, field: ActiveField) => {
    const formatted = formatNominatimResult(result);
    const address = formatted.mainText + (formatted.secondaryText ? ', ' + formatted.secondaryText : '');
    const coord: Coordinate = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();

    if (field === 'location') {
      setSelectedPoint(coord);
      setLocationAddress(address);
      setLocationSearch(address);
      setLocationSuggestions([]);
      onCoordinateSelect?.(coord);
      onLocationNameChange(address);
      // Fly camera to selected point
      cameraRef.current?.setCamera({
        centerCoordinate: [coord.lng, coord.lat],
        zoomLevel: 15,
        animationDuration: 600,
      });
    } else if (field === 'departure') {
      setDepartureCoord(coord);
      setDepartureAddress(address);
      setDepartureSearch(address);
      setDepartureSuggestions([]);
      setActiveField('arrival');
      cameraRef.current?.setCamera({
        centerCoordinate: [coord.lng, coord.lat],
        zoomLevel: 14,
        animationDuration: 600,
      });
      if (arrivalCoord) fitMapToPoints([coord, arrivalCoord]);
    } else {
      setArrivalCoord(coord);
      setArrivalAddress(address);
      setArrivalSearch(address);
      setArrivalSuggestions([]);
      if (departureCoord) fitMapToPoints([departureCoord, coord]);
    }
  }, [departureCoord, arrivalCoord, onCoordinateSelect, onLocationNameChange, fitMapToPoints]);

  // ============================================
  // CLEAR / UNDO
  // ============================================

  const undoLastPoint = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (waypoints.length > 0) {
      setWaypoints(prev => prev.slice(0, -1));
    } else if (arrivalCoord) {
      setArrivalCoord(null);
      setArrivalAddress('');
      setArrivalSearch('');
      setRouteResult(null);
      setRouteGeoJSON(null);
      setActiveField('arrival');
      onRouteClear?.();
    } else if (departureCoord) {
      setDepartureCoord(null);
      setDepartureAddress('');
      setDepartureSearch('');
      setActiveField('departure');
    }
  }, [waypoints, arrivalCoord, departureCoord, onRouteClear]);

  const clearAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDepartureCoord(null);
    setDepartureAddress('');
    setDepartureSearch('');
    setArrivalCoord(null);
    setArrivalAddress('');
    setArrivalSearch('');
    setWaypoints([]);
    setRouteResult(null);
    setRouteGeoJSON(null);
    setSelectedPoint(null);
    setLocationAddress('');
    setLocationSearch('');
    setActiveField(mode === 'route' ? 'departure' : 'location');
    onRouteClear?.();
    onLocationNameChange('');
  }, [mode, onRouteClear, onLocationNameChange]);

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
  // RENDER HELPERS
  // ============================================

  const hasPoints = mode === 'route' ? !!departureCoord : !!selectedPoint;

  const renderSuggestionList = (
    suggestions: NominatimSearchResult[],
    field: ActiveField,
  ) => {
    if (suggestions.length === 0) return null;
    return (
      <View style={styles.suggestionsContainer}>
        {suggestions.map((result) => {
          const formatted = formatNominatimResult(result);
          return (
            <TouchableOpacity
              key={result.place_id.toString()}
              style={styles.suggestionItem}
              onPress={() => selectSuggestion(result, field)}
            >
              <Ionicons name="location" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionMain} numberOfLines={1}>{formatted.mainText}</Text>
                {formatted.secondaryText ? (
                  <Text style={styles.suggestionSub} numberOfLines={1}>{formatted.secondaryText}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ============================================
  // RENDER
  // ============================================

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
                  <Ionicons name="location" size={normalize(20)} color={colors.white} />
                </LinearGradient>
                <View style={styles.pinShadow} />
              </View>
            </MarkerView>
          )}

          {/* Route start pin */}
          {mode === 'route' && departureCoord && (
            <MarkerView coordinate={[departureCoord.lng, departureCoord.lat]}>
              <View style={styles.routePinContainer}>
                <View style={[styles.routePin, { backgroundColor: '#4ECDC4' }]}>
                  <Text style={styles.routePinText}>S</Text>
                </View>
              </View>
            </MarkerView>
          )}

          {/* Route end pin */}
          {mode === 'route' && arrivalCoord && (
            <MarkerView coordinate={[arrivalCoord.lng, arrivalCoord.lat]}>
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
                <View style={[styles.routePin, { backgroundColor: colors.primary }]}>
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
                  lineColor: colors.primary,
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
            <Ionicons name="navigate" size={normalize(20)} color={colors.primary} />
          </TouchableOpacity>
          {hasPoints && (
            <>
              <TouchableOpacity style={styles.mapControlButton} onPress={undoLastPoint}>
                <Ionicons name="arrow-undo" size={normalize(20)} color={colors.primary} />
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
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.calculatingText}>Calculating route...</Text>
          </View>
        )}

        {/* Hint text */}
        {mode === 'route' && !departureCoord && !arrivalCoord && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Tap map or search an address for departure</Text>
          </View>
        )}
        {mode === 'route' && departureCoord && !arrivalCoord && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Now set the arrival point</Text>
          </View>
        )}
        {mode === 'route' && departureCoord && arrivalCoord && !isCalculating && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Tap to add waypoints</Text>
          </View>
        )}
        {mode === 'location' && !selectedPoint && !lockedLocation && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Tap map or search an address</Text>
          </View>
        )}
        {lockedLocation && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Location is set to your business address</Text>
          </View>
        )}
      </View>

      {/* ============================================ */}
      {/* ADDRESS FIELDS — below the map               */}
      {/* ============================================ */}

      {mode === 'route' ? (
        <View style={styles.fieldsContainer}>
          {/* Departure field */}
          <View style={styles.fieldRow}>
            <View style={[styles.fieldDot, { backgroundColor: '#4ECDC4' }]} />
            <View style={styles.fieldConnector} />
            <View style={styles.fieldInputWrapper}>
              <TextInput
                style={[
                  styles.fieldInput,
                  activeField === 'departure' && styles.fieldInputActive,
                ]}
                placeholder="Departure address"
                placeholderTextColor={colors.gray}
                value={departureSearch}
                onChangeText={(text) => {
                  setDepartureSearch(text);
                  setActiveField('departure');
                  searchAddress(text, 'departure');
                }}
                onFocus={() => setActiveField('departure')}
              />
              {searchingDeparture && <ActivityIndicator size="small" color={colors.primary} style={styles.fieldSpinner} />}
              {departureAddress && !searchingDeparture && (
                <TouchableOpacity
                  style={styles.fieldClear}
                  onPress={() => {
                    setDepartureCoord(null);
                    setDepartureAddress('');
                    setDepartureSearch('');
                    setDepartureSuggestions([]);
                    setRouteResult(null);
                    setRouteGeoJSON(null);
                    setActiveField('departure');
                    onRouteClear?.();
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={colors.gray} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {renderSuggestionList(departureSuggestions, 'departure')}

          {/* Arrival field */}
          <View style={styles.fieldRow}>
            <View style={[styles.fieldDot, { backgroundColor: '#FF6B6B' }]} />
            <View style={{ width: 12 }} />
            <View style={styles.fieldInputWrapper}>
              <TextInput
                style={[
                  styles.fieldInput,
                  activeField === 'arrival' && styles.fieldInputActive,
                ]}
                placeholder="Arrival address"
                placeholderTextColor={colors.gray}
                value={arrivalSearch}
                onChangeText={(text) => {
                  setArrivalSearch(text);
                  setActiveField('arrival');
                  searchAddress(text, 'arrival');
                }}
                onFocus={() => setActiveField('arrival')}
              />
              {searchingArrival && <ActivityIndicator size="small" color={colors.primary} style={styles.fieldSpinner} />}
              {arrivalAddress && !searchingArrival && (
                <TouchableOpacity
                  style={styles.fieldClear}
                  onPress={() => {
                    setArrivalCoord(null);
                    setArrivalAddress('');
                    setArrivalSearch('');
                    setArrivalSuggestions([]);
                    setRouteResult(null);
                    setRouteGeoJSON(null);
                    setActiveField('arrival');
                    onRouteClear?.();
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={colors.gray} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {renderSuggestionList(arrivalSuggestions, 'arrival')}
        </View>
      ) : (
        <View style={styles.fieldsContainer}>
          {/* Single location field */}
          <View style={styles.fieldRow}>
            <Ionicons name="location-outline" size={normalize(18)} color={colors.primary} />
            <View style={{ width: 10 }} />
            <View style={styles.fieldInputWrapper}>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputActive]}
                placeholder="Search address or place..."
                placeholderTextColor={colors.gray}
                value={locationSearch}
                onChangeText={(text) => {
                  setLocationSearch(text);
                  searchAddress(text, 'location');
                }}
                editable={!lockedLocation}
              />
              {searchingLocation && <ActivityIndicator size="small" color={colors.primary} style={styles.fieldSpinner} />}
              {locationAddress && !searchingLocation && !lockedLocation && (
                <TouchableOpacity
                  style={styles.fieldClear}
                  onPress={() => {
                    setSelectedPoint(null);
                    setLocationAddress('');
                    setLocationSearch('');
                    setLocationSuggestions([]);
                    onLocationNameChange('');
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={colors.gray} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {renderSuggestionList(locationSuggestions, 'location')}
        </View>
      )}

      {/* ============================================ */}
      {/* ROUTE STATS CARD                             */}
      {/* ============================================ */}

      {routeResult && (
        <View style={styles.routeInfoCard}>
          <View style={styles.routeInfoRow}>
            <View style={styles.routeInfoItem}>
              <Ionicons name="map-outline" size={normalize(18)} color={colors.primary} />
              <Text style={styles.routeInfoValue}>{formatDistance(routeResult.distanceKm)}</Text>
              <Text style={styles.routeInfoLabel}>Distance</Text>
            </View>
            <View style={styles.routeInfoDivider} />
            <View style={styles.routeInfoItem}>
              <Ionicons name="time-outline" size={normalize(18)} color={colors.primary} />
              <Text style={styles.routeInfoValue}>{formatDuration(routeResult.durationMin)}</Text>
              <Text style={styles.routeInfoLabel}>Est. time</Text>
            </View>
            <View style={styles.routeInfoDivider} />
            <View style={styles.routeInfoItem}>
              <Ionicons name="trending-up" size={normalize(18)} color={DIFFICULTY_COLORS[routeResult.difficulty]} />
              <Text style={[styles.routeInfoValue, { color: DIFFICULTY_COLORS[routeResult.difficulty] }]}>
                {routeResult.difficulty.charAt(0).toUpperCase() + routeResult.difficulty.slice(1)}
              </Text>
              <Text style={styles.routeInfoLabel}>Difficulty</Text>
            </View>
            {routeResult.elevationGain > 0 && (
              <>
                <View style={styles.routeInfoDivider} />
                <View style={styles.routeInfoItem}>
                  <Ionicons name="arrow-up" size={normalize(18)} color="#FF9800" />
                  <Text style={styles.routeInfoValue}>{Math.round(routeResult.elevationGain)}m</Text>
                  <Text style={styles.routeInfoLabel}>Elevation</Text>
                </View>
              </>
            )}
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    height: 280,
    borderRadius: normalize(16),
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
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
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  routePinText: {
    fontSize: normalize(13),
    fontWeight: '700',
    color: colors.white,
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
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
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
    color: colors.gray,
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
    color: colors.white,
    fontWeight: '500',
  },

  // Address fields
  fieldsContainer: {
    marginTop: 14,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  fieldDot: {
    width: normalize(12),
    height: normalize(12),
    borderRadius: normalize(6),
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  fieldConnector: {
    width: 12,
  },
  fieldInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldInput: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: normalize(12),
    paddingHorizontal: 14,
    height: normalize(44),
    fontSize: normalize(14),
    color: colors.dark,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  fieldInputActive: {
    borderColor: colors.primary + '40',
    backgroundColor: colors.white,
  },
  fieldSpinner: {
    position: 'absolute',
    right: 14,
  },
  fieldClear: {
    position: 'absolute',
    right: 12,
  },

  // Suggestions
  suggestionsContainer: {
    backgroundColor: colors.white,
    borderRadius: normalize(12),
    marginBottom: 8,
    marginLeft: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionMain: {
    fontSize: normalize(14),
    fontWeight: '500',
    color: colors.dark,
  },
  suggestionSub: {
    fontSize: normalize(12),
    color: colors.gray,
    marginTop: 2,
  },

  // Route info card
  routeInfoCard: {
    backgroundColor: colors.white,
    borderRadius: normalize(14),
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
    color: colors.dark,
  },
  routeInfoLabel: {
    fontSize: normalize(11),
    color: colors.gray,
  },
  routeInfoDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  routeInfoProfile: {
    fontSize: normalize(11),
    color: colors.gray,
    textAlign: 'center',
    marginTop: 10,
  },
});
