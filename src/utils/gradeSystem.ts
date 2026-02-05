/**
 * Grade System — Decorative frames around avatars for 1M+ fans profiles
 *
 * Grades: Champion (1M-4.9M), Elite (5M-9.9M), Goat (10M+)
 * Sub-levels per grade: Bronze, Argent, Or
 * Special: Vert Smuppy — reserved for top 5 users of the entire app
 */

export type GradeName = 'champion' | 'elite' | 'goat';
export type SubLevelName = 'bronze' | 'argent' | 'or';

export interface GradeInfo {
  grade: GradeName;
  subLevel: SubLevelName;
  color: string;
  label: string;
  isVertSmuppy: boolean;
}

const SUB_LEVEL_COLORS: Record<SubLevelName, string> = {
  bronze: '#CD7F32',
  argent: '#C0C0C0',
  or: '#FFD700',
};

const VERT_SMUPPY_COLOR = '#0BCF93';

const GRADE_THRESHOLDS: { grade: GradeName; min: number; max: number; label: string }[] = [
  { grade: 'champion', min: 1_000_000, max: 4_999_999, label: 'Champion' },
  { grade: 'elite', min: 5_000_000, max: 9_999_999, label: 'Elite' },
  { grade: 'goat', min: 10_000_000, max: Infinity, label: 'GOAT' },
];

const SUB_LEVEL_THRESHOLD_LOW = 0.33;
const SUB_LEVEL_THRESHOLD_MID = 0.66;
const GOAT_RANGE = 90_000_000;

function getSubLevel(fanCount: number, min: number, max: number): SubLevelName {
  const range = max === Infinity ? GOAT_RANGE : max - min;
  const progress = (fanCount - min) / range;

  if (progress < SUB_LEVEL_THRESHOLD_LOW) return 'bronze';
  if (progress < SUB_LEVEL_THRESHOLD_MID) return 'argent';
  return 'or';
}

function formatSubLevelLabel(subLevel: SubLevelName): string {
  return subLevel.charAt(0).toUpperCase() + subLevel.slice(1);
}

/**
 * Get grade info for a given fan count.
 * Returns null if fanCount < 1M (no grade).
 * Pass isTopFive=true for the top 5 users app-wide (Vert Smuppy override).
 */
export function getGrade(fanCount: number, isTopFive = false): GradeInfo | null {
  if (fanCount < 1_000_000) return null;

  for (const tier of GRADE_THRESHOLDS) {
    if (fanCount >= tier.min && fanCount <= tier.max) {
      const subLevel = getSubLevel(fanCount, tier.min, tier.max);
      return {
        grade: tier.grade,
        subLevel,
        color: isTopFive ? VERT_SMUPPY_COLOR : SUB_LEVEL_COLORS[subLevel],
        label: `${tier.label} ${isTopFive ? 'Vert Smuppy' : formatSubLevelLabel(subLevel)}`,
        isVertSmuppy: isTopFive,
      };
    }
  }

  return null;
}

/**
 * Get frame colors (primary + secondary glow) for rendering.
 */
export function getGradeColors(color: string): { primary: string; glow: string } {
  return {
    primary: color,
    glow: color + '66',
  };
}
