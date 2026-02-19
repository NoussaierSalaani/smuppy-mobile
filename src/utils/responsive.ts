/**
 * Responsive utilities for iPad-safe element sizing.
 *
 * All element widths/heights are capped at iPhone 16 Pro Max dimensions
 * (430 × 932 pt) so UI never scales beyond phone proportions on iPad.
 *
 * Use raw SCREEN_WIDTH / SCREEN_HEIGHT only for full-bleed layouts,
 * scroll offsets, or absolute positioning that must span the real screen.
 */
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BASE_WIDTH = 390; // iPhone 14 design base
const MAX_SCALE_WIDTH = 430; // iPhone 16 Pro Max
const MAX_SCALE_HEIGHT = 932;

/** Capped width — use for grid columns, cards, chips, modals */
export const WIDTH_CAPPED = Math.min(SCREEN_WIDTH, MAX_SCALE_WIDTH);

/** Capped height — use for proportional vertical sizing */
export const HEIGHT_CAPPED = Math.min(SCREEN_HEIGHT, MAX_SCALE_HEIGHT);

/** Raw screen width — only for full-bleed / scroll-offset / positioning */
export { SCREEN_WIDTH, SCREEN_HEIGHT };

/** Scale a pixel value relative to 390 px base, capped for iPad */
export const normalize = (size: number): number =>
  Math.round(size * (WIDTH_CAPPED / BASE_WIDTH));

/** Width percentage of *real* screen (uncapped — positioning / scroll) */
export const wp = (pct: number): number => (pct * SCREEN_WIDTH) / 100;

/** Scaled percentage of *capped* width (element sizing) */
export const sp = (pct: number): number => (pct * WIDTH_CAPPED) / 100;

/** Height percentage of *capped* height (element sizing) */
export const hp = (pct: number): number => (pct * HEIGHT_CAPPED) / 100;
