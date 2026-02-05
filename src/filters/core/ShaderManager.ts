/**
 * Shader Manager
 * Manages Skia shaders for real-time filter effects
 */

import { Skia, SkRuntimeEffect } from '@shopify/react-native-skia';
import { FILTER_IDS, ShaderUniforms } from '../types';

// Shader source code for each filter
const SHADER_SOURCES: Record<string, string> = {
  // Gym Lighting - Perfect studio lighting simulation
  [FILTER_IDS.GYM_LIGHTING]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Normalize coordinates
      float2 uv = coord / resolution;

      // Add soft top-down lighting
      float lightY = 1.0 - uv.y;
      float softLight = smoothstep(0.0, 1.0, lightY * 0.5 + 0.5);

      // Enhance contrast
      half3 enhanced = (color.rgb - 0.5) * (1.0 + intensity * 0.3) + 0.5;

      // Add warm fill light
      half3 warmLight = half3(1.02, 1.0, 0.98);
      enhanced *= mix(half3(1.0), warmLight, intensity * 0.3);

      // Apply soft lighting
      enhanced = mix(enhanced, enhanced * (0.9 + softLight * 0.2), intensity);

      // Slight vignette for focus
      float vignette = 1.0 - smoothstep(0.5, 1.5, length(uv - 0.5) * 1.5);
      enhanced *= mix(1.0, vignette * 0.3 + 0.7, intensity * 0.5);

      return half4(clamp(enhanced, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Natural Glow - Soft radiant skin glow
  [FILTER_IDS.NATURAL_GLOW]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Simple glow: brighten midtones, soften shadows
      half luma = dot(color.rgb, half3(0.299, 0.587, 0.114));

      // Lift shadows slightly
      half shadowLift = smoothstep(0.0, 0.5, luma) * intensity * 0.15;

      // Boost highlights gently
      half highlightBoost = smoothstep(0.5, 1.0, luma) * intensity * 0.1;

      // Skin tone enhancement (warm tones)
      half3 glowColor = color.rgb + shadowLift;
      glowColor = glowColor * (1.0 + highlightBoost);

      // Add slight warmth
      glowColor.r += intensity * 0.02;
      glowColor.g += intensity * 0.01;

      // Soft bloom effect
      half bloom = smoothstep(0.6, 1.0, luma) * intensity * 0.2;
      glowColor += bloom;

      return half4(clamp(glowColor, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Golden Hour - Warm golden lighting
  [FILTER_IDS.GOLDEN_HOUR]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Golden color grading
      half3 golden = half3(1.0, 0.85, 0.6);
      half3 shadow = half3(0.3, 0.2, 0.4);

      half luma = dot(color.rgb, half3(0.299, 0.587, 0.114));

      // Apply golden tint to highlights
      half3 tinted = mix(color.rgb, color.rgb * golden, smoothstep(0.3, 0.8, luma) * intensity * 0.6);

      // Cool shadows for contrast
      tinted = mix(tinted, tinted + shadow * 0.1, (1.0 - luma) * intensity * 0.3);

      // Increase warmth
      tinted.r += intensity * 0.08;
      tinted.g += intensity * 0.03;
      tinted.b -= intensity * 0.05;

      // Soft contrast
      tinted = (tinted - 0.5) * (1.0 + intensity * 0.15) + 0.5;

      return half4(clamp(tinted, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Tan & Tone - Bronze tan with definition
  [FILTER_IDS.TAN_TONE]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Detect skin tones (simplified)
      half3 skinRef = half3(0.8, 0.6, 0.5);
      half skinDist = length(color.rgb - skinRef);
      half skinMask = 1.0 - smoothstep(0.2, 0.6, skinDist);

      // Tan color shift
      half3 tanColor = half3(0.95, 0.8, 0.65);
      half3 tanned = mix(color.rgb, color.rgb * tanColor, skinMask * intensity * 0.4);

      // Increase saturation on skin
      half luma = dot(tanned, half3(0.299, 0.587, 0.114));
      half3 saturated = mix(half3(luma), tanned, 1.0 + skinMask * intensity * 0.2);

      // Local contrast for definition (muscle tone)
      half3 defined = (saturated - 0.5) * (1.0 + intensity * 0.25) + 0.5;

      // Darken shadows for depth
      half shadowMask = smoothstep(0.0, 0.4, luma);
      defined = mix(defined * 0.85, defined, shadowMask + (1.0 - intensity * 0.3));

      return half4(clamp(defined, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Muscle Boost - Enhanced muscle definition
  [FILTER_IDS.MUSCLE_BOOST]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Sample neighboring pixels for edge detection
      float2 offset = 1.0 / resolution;
      half4 left = image.eval(coord - float2(offset.x, 0.0));
      half4 right = image.eval(coord + float2(offset.x, 0.0));
      half4 up = image.eval(coord - float2(0.0, offset.y));
      half4 down = image.eval(coord + float2(0.0, offset.y));

      // Calculate local gradient (edge strength)
      half3 gradX = right.rgb - left.rgb;
      half3 gradY = down.rgb - up.rgb;
      half edgeStrength = length(gradX) + length(gradY);

      // Enhance edges (muscle definition)
      half luma = dot(color.rgb, half3(0.299, 0.587, 0.114));
      half3 enhanced = color.rgb;

      // Boost contrast on edges
      half edgeBoost = smoothstep(0.02, 0.15, edgeStrength) * intensity;
      enhanced = (enhanced - 0.5) * (1.0 + edgeBoost * 0.5) + 0.5;

      // Darken valleys (between muscles)
      half valleyMask = smoothstep(0.05, 0.2, edgeStrength);
      enhanced = mix(enhanced * (1.0 - intensity * 0.15), enhanced, valleyMask);

      // Highlight peaks
      half peakMask = smoothstep(0.6, 0.9, luma) * valleyMask;
      enhanced += peakMask * intensity * 0.1;

      return half4(clamp(enhanced, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Sweat Glow - Workout sweat effect
  [FILTER_IDS.SWEAT_GLOW]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Detect highlights (potential sweat areas)
      half luma = dot(color.rgb, half3(0.299, 0.587, 0.114));
      half highlightMask = smoothstep(0.6, 0.85, luma);

      // Skin tone detection for selective glow
      half3 skinRef = half3(0.75, 0.6, 0.5);
      half skinDist = length(color.rgb - skinRef);
      half skinMask = 1.0 - smoothstep(0.15, 0.5, skinDist);

      // Combined mask: highlights on skin
      half sweatMask = highlightMask * skinMask;

      // Add specular highlights
      half specular = pow(highlightMask, 3.0) * sweatMask * intensity;
      half3 glowing = color.rgb + specular * 0.3;

      // Slight wet look (increased saturation in highlights)
      half3 wetLook = mix(half3(luma), glowing, 1.0 + sweatMask * intensity * 0.15);

      // Add subtle shimmer (time-based)
      float shimmer = sin(time * 2.0 + coord.x * 0.1 + coord.y * 0.1) * 0.5 + 0.5;
      wetLook += sweatMask * shimmer * intensity * 0.05;

      return half4(clamp(wetLook, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Energy Aura - Colorful energy effect
  [FILTER_IDS.ENERGY_AURA]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half3 hsl2rgb(half3 c) {
      half3 rgb = clamp(abs(mod(c.x * 6.0 + half3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
    }

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Calculate luminance for edge detection
      float2 offset = 2.0 / resolution;
      half4 left = image.eval(coord - float2(offset.x, 0.0));
      half4 right = image.eval(coord + float2(offset.x, 0.0));
      half4 up = image.eval(coord - float2(0.0, offset.y));
      half4 down = image.eval(coord + float2(0.0, offset.y));

      half edgeX = length(right.rgb - left.rgb);
      half edgeY = length(down.rgb - up.rgb);
      half edge = (edgeX + edgeY) * 0.5;

      // Create aura effect on edges
      half auraMask = smoothstep(0.05, 0.25, edge);

      // Animated rainbow color
      half hue = fract(time * 0.2 + coord.y / resolution.y * 0.5);
      half3 auraColor = hsl2rgb(half3(hue, 0.8, 0.6));

      // Glow falloff
      half glow = auraMask * intensity;

      // Blend aura with original
      half3 result = mix(color.rgb, color.rgb + auraColor * 0.5, glow);

      // Add pulsing effect
      half pulse = sin(time * 3.0) * 0.5 + 0.5;
      result += auraColor * auraMask * pulse * intensity * 0.2;

      return half4(clamp(result, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Neon Outline - Glowing body outline
  [FILTER_IDS.NEON_OUTLINE]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Edge detection with multiple samples
      float2 offset = 1.5 / resolution;
      half4 samples[8];
      samples[0] = image.eval(coord + float2(-offset.x, -offset.y));
      samples[1] = image.eval(coord + float2(0.0, -offset.y));
      samples[2] = image.eval(coord + float2(offset.x, -offset.y));
      samples[3] = image.eval(coord + float2(-offset.x, 0.0));
      samples[4] = image.eval(coord + float2(offset.x, 0.0));
      samples[5] = image.eval(coord + float2(-offset.x, offset.y));
      samples[6] = image.eval(coord + float2(0.0, offset.y));
      samples[7] = image.eval(coord + float2(offset.x, offset.y));

      // Sobel edge detection
      half3 gx = -samples[0].rgb - 2.0*samples[3].rgb - samples[5].rgb + samples[2].rgb + 2.0*samples[4].rgb + samples[7].rgb;
      half3 gy = -samples[0].rgb - 2.0*samples[1].rgb - samples[2].rgb + samples[5].rgb + 2.0*samples[6].rgb + samples[7].rgb;
      half edge = length(gx) + length(gy);

      // Neon color cycling
      half hue = fract(time * 0.3);
      half3 neonColor;
      if (hue < 0.33) {
        neonColor = half3(0.0, 1.0, 1.0); // Cyan
      } else if (hue < 0.66) {
        neonColor = half3(1.0, 0.0, 1.0); // Magenta
      } else {
        neonColor = half3(1.0, 1.0, 0.0); // Yellow
      }

      // Apply neon glow on edges
      half neonStrength = smoothstep(0.1, 0.4, edge) * intensity;
      half3 result = mix(color.rgb, color.rgb + neonColor * 0.8, neonStrength);

      // Add bloom to neon
      result += neonColor * pow(neonStrength, 2.0) * 0.3;

      return half4(clamp(result, half3(0.0), half3(1.0)), color.a);
    }
  `,

  // Lightning Flex - Electric effect on movement
  [FILTER_IDS.LIGHTNING_FLEX]: `
    uniform shader image;
    uniform float intensity;
    uniform float2 resolution;
    uniform float time;

    half4 main(float2 coord) {
      half4 color = image.eval(coord);

      // Noise-based lightning pattern
      float2 uv = coord / resolution;
      float noise = fract(sin(dot(uv * 50.0 + time * 10.0, float2(12.9898, 78.233))) * 43758.5453);

      // Edge detection for body outline
      float2 offset = 1.0 / resolution;
      half4 left = image.eval(coord - float2(offset.x, 0.0));
      half4 right = image.eval(coord + float2(offset.x, 0.0));
      half edge = length(right.rgb - left.rgb);
      half edgeMask = smoothstep(0.08, 0.2, edge);

      // Lightning effect on edges
      half lightning = step(0.97, noise) * edgeMask;

      // Electric blue color
      half3 electricBlue = half3(0.3, 0.7, 1.0);
      half3 electricWhite = half3(0.9, 0.95, 1.0);

      // Branch effect
      float branch = step(0.995, fract(sin(coord.y * 0.5 + time * 20.0) * 100.0));
      half3 lightningColor = mix(electricBlue, electricWhite, branch);

      // Apply lightning
      half3 result = mix(color.rgb, lightningColor, lightning * intensity);

      // Add glow around lightning
      result += electricBlue * edgeMask * intensity * 0.15 * (0.5 + 0.5 * sin(time * 10.0));

      return half4(clamp(result, half3(0.0), half3(1.0)), color.a);
    }
  `,
};

// Compiled shaders cache
const compiledShaders: Map<string, SkRuntimeEffect | null> = new Map();

/**
 * ShaderManager - Handles shader compilation and management
 */
export class ShaderManager {
  private static instance: ShaderManager;

  private constructor() {
    this.precompileShaders();
  }

  static getInstance(): ShaderManager {
    if (!ShaderManager.instance) {
      ShaderManager.instance = new ShaderManager();
    }
    return ShaderManager.instance;
  }

  /**
   * Precompile all shaders for better performance
   */
  private precompileShaders(): void {
    for (const [filterId, source] of Object.entries(SHADER_SOURCES)) {
      try {
        const effect = Skia.RuntimeEffect.Make(source);
        compiledShaders.set(filterId, effect);
      } catch (error) {
        if (__DEV__) console.warn(`Failed to compile shader for ${filterId}:`, error);
        compiledShaders.set(filterId, null);
      }
    }
  }

  /**
   * Get compiled shader for a filter
   */
  getShader(filterId: string): SkRuntimeEffect | null {
    return compiledShaders.get(filterId) ?? null;
  }

  /**
   * Check if shader exists for filter
   */
  hasShader(filterId: string): boolean {
    return compiledShaders.has(filterId) && compiledShaders.get(filterId) !== null;
  }

  /**
   * Get all available shader filter IDs
   */
  getAvailableFilters(): string[] {
    return Array.from(compiledShaders.entries())
      .filter(([_, shader]) => shader !== null)
      .map(([id]) => id);
  }

  /**
   * Create shader uniforms with default values
   */
  createUniforms(
    intensity: number = 0.5,
    resolution: [number, number] = [1080, 1920],
    time: number = 0
  ): ShaderUniforms {
    return {
      intensity,
      resolution,
      time,
    };
  }
}

// Export singleton instance
export const shaderManager = ShaderManager.getInstance();
