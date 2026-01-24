/**
 * Filter Engine
 * Core engine for processing camera frames with filters
 */

import { Skia, SkImage, SkCanvas, SkPaint, SkShader, BlendMode, TileMode } from '@shopify/react-native-skia';
import { shaderManager } from './ShaderManager';
import {
  ActiveFilter,
  FilterState,
  ShaderUniforms,
  PoseLandmarks,
} from '../types';

export interface ProcessingOptions {
  width: number;
  height: number;
  time: number;
  bodyPose?: PoseLandmarks | null;
}

/**
 * FilterEngine - Processes camera frames with AR filters
 */
export class FilterEngine {
  private static instance: FilterEngine;
  private startTime: number;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 0;

  private constructor() {
    this.startTime = Date.now();
  }

  static getInstance(): FilterEngine {
    if (!FilterEngine.instance) {
      FilterEngine.instance = new FilterEngine();
    }
    return FilterEngine.instance;
  }

  /**
   * Get current animation time in seconds
   */
  getTime(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Get current FPS
   */
  getFps(): number {
    return this.currentFps;
  }

  /**
   * Update FPS counter
   */
  private updateFps(): void {
    this.frameCount++;
    const now = Date.now();
    const elapsed = now - this.lastFpsUpdate;

    if (elapsed >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  /**
   * Create shader paint for a filter
   */
  createFilterPaint(
    filterId: string,
    imageShader: SkShader,
    uniforms: ShaderUniforms
  ): SkPaint | null {
    const effect = shaderManager.getShader(filterId);
    if (!effect) {
      console.warn(`No shader found for filter: ${filterId}`);
      return null;
    }

    try {
      const paint = Skia.Paint();

      const shader = effect.makeShaderWithChildren(
        [
          uniforms.intensity,
          uniforms.resolution[0],
          uniforms.resolution[1],
          uniforms.time,
        ],
        [imageShader]
      );

      if (shader) {
        paint.setShader(shader);
      }

      return paint;
    } catch (error) {
      console.error(`Error creating filter paint for ${filterId}:`, error);
      return null;
    }
  }

  /**
   * Apply filter to a Skia canvas
   */
  applyFilterToCanvas(
    canvas: SkCanvas,
    image: SkImage,
    filter: ActiveFilter,
    options: ProcessingOptions
  ): void {
    this.updateFps();

    const { width, height, time } = options;

    // Create image shader
    const imageShader = image.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      undefined,
      undefined
    );

    if (!imageShader) {
      // Fallback: draw original image
      canvas.drawImage(image, 0, 0);
      return;
    }

    // Create uniforms
    const uniforms: ShaderUniforms = {
      intensity: filter.intensity,
      resolution: [width, height],
      time: time,
    };

    // Create filter paint
    const filterPaint = this.createFilterPaint(filter.filterId, imageShader, uniforms);

    if (filterPaint) {
      // Draw with filter
      canvas.drawRect(
        { x: 0, y: 0, width, height },
        filterPaint
      );
    } else {
      // Fallback: draw original image
      canvas.drawImage(image, 0, 0);
    }
  }

  /**
   * Process image with filter and return new image
   */
  async processImage(
    sourceImage: SkImage,
    filter: ActiveFilter,
    options: ProcessingOptions
  ): Promise<SkImage | null> {
    const { width, height } = options;

    try {
      // Create offscreen surface
      const surface = Skia.Surface.MakeOffscreen(width, height);
      if (!surface) {
        console.error('Failed to create offscreen surface');
        return null;
      }

      const canvas = surface.getCanvas();

      // Apply filter
      this.applyFilterToCanvas(canvas, sourceImage, filter, options);

      // Get result image
      surface.flush();
      const resultImage = surface.makeImageSnapshot();

      return resultImage;
    } catch (error) {
      console.error('Error processing image:', error);
      return null;
    }
  }

  /**
   * Check if a filter requires body tracking
   */
  filterRequiresBodyTracking(filterId: string): boolean {
    const bodyTrackingFilters = [
      'muscle_boost',
      'sweat_glow',
      'energy_aura',
      'lightning_flex',
      'neon_outline',
    ];
    return bodyTrackingFilters.includes(filterId);
  }

  /**
   * Get recommended intensity range for a filter
   */
  getIntensityRange(filterId: string): { min: number; max: number; default: number } {
    const ranges: Record<string, { min: number; max: number; default: number }> = {
      muscle_boost: { min: 0.2, max: 0.8, default: 0.5 },
      tan_tone: { min: 0.2, max: 0.7, default: 0.5 },
      sweat_glow: { min: 0.2, max: 0.6, default: 0.4 },
      gym_lighting: { min: 0.3, max: 0.9, default: 0.6 },
      natural_glow: { min: 0.2, max: 0.7, default: 0.5 },
      golden_hour: { min: 0.2, max: 0.8, default: 0.5 },
      energy_aura: { min: 0.3, max: 0.9, default: 0.6 },
      lightning_flex: { min: 0.4, max: 1.0, default: 0.7 },
      neon_outline: { min: 0.3, max: 0.8, default: 0.5 },
    };

    return ranges[filterId] || { min: 0, max: 1, default: 0.5 };
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.startTime = Date.now();
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.currentFps = 0;
  }
}

// Export singleton instance
export const filterEngine = FilterEngine.getInstance();
