/**
 * Theme Configuration Tests
 * Tests for colors, spacing, typography, and theme utility functions.
 */

import {
  COLORS,
  DARK_COLORS,
  GRADIENTS,
  DARK_GRADIENTS,
  FORM,
  DARK_FORM,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  SIZES,
  SHADOWS,
  DARK_SHADOWS,
  BORDERS,
  ANIMATION,
  Z_INDEX,
  HIT_SLOP,
  getThemeColors,
  getThemeGradients,
  getThemeForm,
  getThemeShadows,
} from '../../config/theme';

describe('Theme Config', () => {
  describe('COLORS', () => {
    it('should have primary color', () => {
      expect(COLORS.primary).toBe('#0EBF8A');
    });

    it('should have error color', () => {
      expect(COLORS.error).toBe('#FF3B30');
    });

    it('should have white', () => {
      expect(COLORS.white).toBe('#FFFFFF');
    });

    it('should have background colors', () => {
      expect(COLORS.background).toBeDefined();
      expect(COLORS.backgroundSecondary).toBeDefined();
    });

    it('should have gray scale', () => {
      expect(COLORS.gray50).toBeDefined();
      expect(COLORS.gray100).toBeDefined();
      expect(COLORS.gray200).toBeDefined();
      expect(COLORS.gray900).toBeDefined();
    });

    it('should have badge colors', () => {
      expect(COLORS.badgeVerified).toBeDefined();
      expect(COLORS.badgeCreator).toBeDefined();
      expect(COLORS.badgePremium).toBeDefined();
    });
  });

  describe('DARK_COLORS', () => {
    it('should have primary color', () => {
      expect(DARK_COLORS.primary).toBe('#0EBF8A');
    });

    it('should have dark background', () => {
      expect(DARK_COLORS.background).toBe('#0D0D0D');
    });

    it('should have light text for dark theme', () => {
      expect(DARK_COLORS.text).toBe('#E5E7EB');
    });
  });

  describe('GRADIENTS', () => {
    it('should have primary gradient with 3 colors', () => {
      expect(GRADIENTS.primary).toHaveLength(3);
    });

    it('should have button gradient', () => {
      expect(GRADIENTS.button).toBeDefined();
      expect(GRADIENTS.button.length).toBeGreaterThan(0);
    });

    it('should have start/end points', () => {
      expect(GRADIENTS.primaryStart).toEqual({ x: 0, y: 0 });
      expect(GRADIENTS.primaryEnd).toEqual({ x: 1, y: 0 });
    });

    it('should have live gradient', () => {
      expect(GRADIENTS.live).toHaveLength(2);
    });
  });

  describe('DARK_GRADIENTS', () => {
    it('should have primary gradient', () => {
      expect(DARK_GRADIENTS.primary).toBeDefined();
      expect(DARK_GRADIENTS.primary).toHaveLength(3);
    });
  });

  describe('FORM', () => {
    it('should have input dimensions', () => {
      expect(FORM.inputHeight).toBe(56);
      expect(FORM.inputRadius).toBe(28);
    });

    it('should have button dimensions', () => {
      expect(FORM.buttonHeight).toBe(56);
      expect(FORM.buttonRadius).toBe(28);
    });

    it('should have input colors', () => {
      expect(FORM.inputBorder).toBeDefined();
      expect(FORM.inputBorderFocus).toBeDefined();
      expect(FORM.inputBorderError).toBeDefined();
    });
  });

  describe('DARK_FORM', () => {
    it('should have same structure as FORM', () => {
      expect(Object.keys(DARK_FORM).sort()).toEqual(Object.keys(FORM).sort());
    });

    it('should have dark theme input border', () => {
      expect(DARK_FORM.inputBorder).toBe('#3A3A3C');
    });
  });

  describe('FONTS', () => {
    it('should have primary font family', () => {
      expect(FONTS.primary).toBe('WorkSans');
    });

    it('should have secondary font family', () => {
      expect(FONTS.secondary).toBe('Poppins');
    });

    it('should have weight definitions', () => {
      expect(FONTS.weights.regular).toBe('400');
      expect(FONTS.weights.bold).toBe('700');
    });
  });

  describe('TYPOGRAPHY', () => {
    it('should have page title style', () => {
      expect(TYPOGRAPHY.pageTitle).toHaveProperty('fontFamily');
      expect(TYPOGRAPHY.pageTitle).toHaveProperty('fontSize');
      expect(TYPOGRAPHY.pageTitle).toHaveProperty('lineHeight');
    });

    it('should have body style', () => {
      expect(TYPOGRAPHY.body.fontSize).toBe(16);
    });

    it('should have caption style', () => {
      expect(TYPOGRAPHY.caption.fontSize).toBe(12);
    });

    it('should have all expected typography variants', () => {
      const expectedKeys = [
        'pageTitle', 'sectionHeader', 'title1', 'title2', 'title3', 'title4',
        'subtitle', 'buttonLarge', 'buttonMedium', 'buttonSmall',
        'body', 'bodySmall', 'label', 'caption', 'tiny', 'navLabel',
      ];
      expectedKeys.forEach((key) => {
        expect(TYPOGRAPHY).toHaveProperty(key);
      });
    });
  });

  describe('SPACING', () => {
    it('should have expected spacing values', () => {
      expect(SPACING.xs).toBe(4);
      expect(SPACING.sm).toBe(8);
      expect(SPACING.md).toBe(12);
      expect(SPACING.base).toBe(16);
      expect(SPACING.lg).toBe(20);
      expect(SPACING.xl).toBe(24);
    });

    it('should have section spacing', () => {
      expect(SPACING.section).toBe(80);
    });
  });

  describe('SIZES', () => {
    it('should have radius values', () => {
      expect(SIZES.radiusSm).toBe(8);
      expect(SIZES.radiusMd).toBe(12);
      expect(SIZES.radiusButton).toBe(28);
      expect(SIZES.radiusFull).toBe(9999);
    });

    it('should have button sizes', () => {
      expect(SIZES.buttonXl).toBe(56);
      expect(SIZES.buttonSm).toBe(28);
    });

    it('should have avatar sizes', () => {
      expect(SIZES.avatarXs).toBe(24);
      expect(SIZES.avatarSm).toBe(32);
      expect(SIZES.avatarMd).toBe(50);
      expect(SIZES.avatarLg).toBe(100);
    });

    it('should have icon sizes', () => {
      expect(SIZES.iconSm).toBe(16);
      expect(SIZES.iconMd).toBe(20);
      expect(SIZES.iconLg).toBe(24);
    });

    it('should have badge sizes', () => {
      expect(SIZES.badgeSm).toBe(14);
      expect(SIZES.badgeMd).toBe(16);
    });

    it('should have navigation sizes', () => {
      expect(SIZES.headerHeight).toBe(56);
      expect(SIZES.bottomNavHeight).toBe(67);
    });
  });

  describe('SHADOWS', () => {
    it('should have none shadow', () => {
      expect(SHADOWS.none.shadowOpacity).toBe(0);
    });

    it('should have card shadow', () => {
      expect(SHADOWS.card.shadowColor).toBe('#000');
      expect(SHADOWS.card.elevation).toBeGreaterThan(0);
    });

    it('should have button shadow with primary color', () => {
      expect(SHADOWS.button.shadowColor).toBe('#0EBF8A');
    });
  });

  describe('DARK_SHADOWS', () => {
    it('should have same structure as SHADOWS', () => {
      expect(Object.keys(DARK_SHADOWS).sort()).toEqual(Object.keys(SHADOWS).sort());
    });
  });

  describe('BORDERS', () => {
    it('should have expected border widths', () => {
      expect(BORDERS.none).toBe(0);
      expect(BORDERS.thin).toBe(1);
      expect(BORDERS.medium).toBe(1.5);
      expect(BORDERS.thick).toBe(2);
    });
  });

  describe('ANIMATION', () => {
    it('should have timing values in ms', () => {
      expect(ANIMATION.fast).toBe(150);
      expect(ANIMATION.normal).toBe(200);
      expect(ANIMATION.slow).toBe(300);
    });
  });

  describe('Z_INDEX', () => {
    it('should have expected z-index values', () => {
      expect(Z_INDEX.base).toBe(0);
      expect(Z_INDEX.modal).toBe(40);
      expect(Z_INDEX.tooltip).toBe(60);
    });

    it('should have increasing z-index values', () => {
      expect(Z_INDEX.base).toBeLessThan(Z_INDEX.dropdown);
      expect(Z_INDEX.dropdown).toBeLessThan(Z_INDEX.sticky);
      expect(Z_INDEX.sticky).toBeLessThan(Z_INDEX.modal);
      expect(Z_INDEX.modal).toBeLessThan(Z_INDEX.tooltip);
    });
  });

  describe('HIT_SLOP', () => {
    it('should have symmetrical hit areas', () => {
      const { small, medium, large, xlarge } = HIT_SLOP;
      expect(small.top).toBe(small.bottom);
      expect(small.left).toBe(small.right);
      expect(medium.top).toBe(10);
      expect(large.top).toBe(15);
      expect(xlarge.top).toBe(20);
    });
  });

  describe('getThemeColors', () => {
    it('should return COLORS for light mode', () => {
      const colors = getThemeColors('light');
      expect(colors.primary).toBe(COLORS.primary);
      expect(colors.background).toBe(COLORS.background);
    });

    it('should return DARK_COLORS for dark mode', () => {
      const colors = getThemeColors('dark');
      expect(colors.background).toBe(DARK_COLORS.background);
    });
  });

  describe('getThemeGradients', () => {
    it('should return GRADIENTS for light mode', () => {
      const gradients = getThemeGradients('light');
      expect(gradients.primary).toEqual(GRADIENTS.primary);
    });

    it('should return DARK_GRADIENTS for dark mode', () => {
      const gradients = getThemeGradients('dark');
      expect(gradients.primary).toEqual(DARK_GRADIENTS.primary);
    });
  });

  describe('getThemeForm', () => {
    it('should return FORM for light mode', () => {
      const form = getThemeForm('light');
      expect(form.inputBorder).toBe(FORM.inputBorder);
    });

    it('should return DARK_FORM for dark mode', () => {
      const form = getThemeForm('dark');
      expect(form.inputBorder).toBe(DARK_FORM.inputBorder);
    });
  });

  describe('getThemeShadows', () => {
    it('should return SHADOWS for light mode', () => {
      const shadows = getThemeShadows('light');
      expect(shadows.card).toEqual(SHADOWS.card);
    });

    it('should return DARK_SHADOWS for dark mode', () => {
      const shadows = getThemeShadows('dark');
      expect(shadows.card).toEqual(DARK_SHADOWS.card);
    });
  });
});
