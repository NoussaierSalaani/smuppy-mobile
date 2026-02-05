/**
 * Grade System Tests
 * Tests for decorative avatar frames based on fan count
 */
import { getGrade, getGradeColors, GradeInfo } from '../../utils/gradeSystem';

describe('getGrade', () => {
  it('should return null for fan counts below 1M', () => {
    expect(getGrade(0)).toBeNull();
    expect(getGrade(500000)).toBeNull();
    expect(getGrade(999999)).toBeNull();
  });

  it('should return Champion grade for 1M-4.9M fans', () => {
    const grade = getGrade(1000000) as GradeInfo;
    expect(grade).not.toBeNull();
    expect(grade.grade).toBe('champion');
    expect(grade.isVertSmuppy).toBe(false);
  });

  it('should return Champion Bronze for low range', () => {
    const grade = getGrade(1000000) as GradeInfo;
    expect(grade.subLevel).toBe('bronze');
    expect(grade.label).toBe('Champion Bronze');
  });

  it('should return Champion Argent for mid range', () => {
    const grade = getGrade(2500000) as GradeInfo;
    expect(grade.subLevel).toBe('argent');
    expect(grade.label).toBe('Champion Argent');
  });

  it('should return Champion Or for high range', () => {
    const grade = getGrade(4500000) as GradeInfo;
    expect(grade.subLevel).toBe('or');
    expect(grade.label).toBe('Champion Or');
  });

  it('should return Elite grade for 5M-9.9M fans', () => {
    const grade = getGrade(5000000) as GradeInfo;
    expect(grade.grade).toBe('elite');
    expect(grade.label).toContain('Elite');
  });

  it('should return GOAT grade for 10M+ fans', () => {
    const grade = getGrade(10000000) as GradeInfo;
    expect(grade.grade).toBe('goat');
    expect(grade.label).toContain('GOAT');
  });

  it('should return GOAT for very high counts', () => {
    const grade = getGrade(100000000) as GradeInfo;
    expect(grade.grade).toBe('goat');
    expect(grade.subLevel).toBe('or');
  });

  it('should override with Vert Smuppy for top 5 users', () => {
    const grade = getGrade(5000000, true) as GradeInfo;
    expect(grade.isVertSmuppy).toBe(true);
    expect(grade.color).toBe('#0BCF93');
    expect(grade.label).toContain('Vert Smuppy');
  });

  it('should still return null for top 5 with < 1M fans', () => {
    expect(getGrade(500000, true)).toBeNull();
  });
});

describe('getGradeColors', () => {
  it('should return primary and glow colors', () => {
    const colors = getGradeColors('#CD7F32');
    expect(colors.primary).toBe('#CD7F32');
    expect(colors.glow).toBe('#CD7F3266');
  });

  it('should append 66 opacity to glow', () => {
    const colors = getGradeColors('#FFD700');
    expect(colors.glow).toBe('#FFD70066');
  });
});
