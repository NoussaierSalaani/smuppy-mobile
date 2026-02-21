/**
 * mapbox-safe Tests
 * Tests the safe Mapbox import wrapper that guards against missing native modules.
 */

// Define __DEV__ global (normally set by React Native bundler)
(globalThis as Record<string, unknown>).__DEV__ = true;

// Mock react-native
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

// Mock React
jest.mock('react', () => ({
  __esModule: true,
  default: { createElement: jest.fn() },
}));

// @rnmapbox/maps is not installed in test env, so require will fail naturally

describe('mapbox-safe', () => {
  it('should set isMapboxAvailable to false when native module is missing', () => {
    const { isMapboxAvailable } = require('../../utils/mapbox-safe');
    expect(isMapboxAvailable).toBe(false);
  });

  it('should export null for all Mapbox components when unavailable', () => {
    const {
      Mapbox,
      MapView,
      Camera,
      MarkerView,
      PointAnnotation,
      LocationPuck,
      ShapeSource,
      LineLayer,
    } = require('../../utils/mapbox-safe');

    expect(Mapbox).toBeUndefined();
    expect(MapView).toBeUndefined();
    expect(Camera).toBeUndefined();
    expect(MarkerView).toBeUndefined();
    expect(PointAnnotation).toBeUndefined();
    expect(LocationPuck).toBeUndefined();
    expect(ShapeSource).toBeUndefined();
    expect(LineLayer).toBeUndefined();
  });

  it('should export MapPlaceholder component', () => {
    const { MapPlaceholder } = require('../../utils/mapbox-safe');
    expect(MapPlaceholder).toBeDefined();
    expect(typeof MapPlaceholder).toBe('function');
  });

});
