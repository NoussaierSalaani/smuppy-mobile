/**
 * Responsive Utilities Tests
 * Tests for screen dimension responsive utilities.
 */

jest.mock('react-native', () => ({
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
}));

// Must clear module cache so our mock takes effect
beforeAll(() => {
  jest.resetModules();
});

describe('Responsive Utils', () => {
  // Re-import after mocking to get the mock values
  let responsive: typeof import('../../utils/responsive');

  beforeAll(async () => {
    responsive = await import('../../utils/responsive');
  });

  describe('SCREEN_WIDTH and SCREEN_HEIGHT', () => {
    it('should export SCREEN_WIDTH from Dimensions', () => {
      expect(responsive.SCREEN_WIDTH).toBe(375);
    });

    it('should export SCREEN_HEIGHT from Dimensions', () => {
      expect(responsive.SCREEN_HEIGHT).toBe(812);
    });
  });

  describe('WIDTH_CAPPED', () => {
    it('should cap width at MAX_SCALE_WIDTH (430) for phone screens', () => {
      // 375 < 430, so WIDTH_CAPPED = 375
      expect(responsive.WIDTH_CAPPED).toBe(375);
    });
  });

  describe('HEIGHT_CAPPED', () => {
    it('should cap height at MAX_SCALE_HEIGHT (932) for phone screens', () => {
      // 812 < 932, so HEIGHT_CAPPED = 812
      expect(responsive.HEIGHT_CAPPED).toBe(812);
    });
  });

  describe('normalize', () => {
    it('should scale a pixel value relative to 390px base', () => {
      // normalize(size) = Math.round(size * (WIDTH_CAPPED / BASE_WIDTH))
      // = Math.round(100 * (375 / 390)) = Math.round(96.15...) = 96
      const result = responsive.normalize(100);
      expect(result).toBe(Math.round(100 * (375 / 390)));
    });

    it('should return 0 for 0', () => {
      expect(responsive.normalize(0)).toBe(0);
    });

    it('should handle large values', () => {
      const result = responsive.normalize(500);
      expect(result).toBe(Math.round(500 * (375 / 390)));
    });
  });

  describe('wp (width percentage)', () => {
    it('should return percentage of real screen width', () => {
      // wp(50) = (50 * 375) / 100 = 187.5
      expect(responsive.wp(50)).toBe(187.5);
    });

    it('should return 0 for 0%', () => {
      expect(responsive.wp(0)).toBe(0);
    });

    it('should return full width for 100%', () => {
      expect(responsive.wp(100)).toBe(375);
    });
  });

  describe('sp (scaled percentage)', () => {
    it('should return percentage of capped width', () => {
      // sp(50) = (50 * WIDTH_CAPPED) / 100 = (50 * 375) / 100 = 187.5
      expect(responsive.sp(50)).toBe(187.5);
    });

    it('should return 0 for 0%', () => {
      expect(responsive.sp(0)).toBe(0);
    });

    it('should return capped width for 100%', () => {
      expect(responsive.sp(100)).toBe(375);
    });
  });

  describe('hp (height percentage)', () => {
    it('should return percentage of capped height', () => {
      // hp(50) = (50 * HEIGHT_CAPPED) / 100 = (50 * 812) / 100 = 406
      expect(responsive.hp(50)).toBe(406);
    });

    it('should return 0 for 0%', () => {
      expect(responsive.hp(0)).toBe(0);
    });

    it('should return capped height for 100%', () => {
      expect(responsive.hp(100)).toBe(812);
    });
  });
});

describe('Responsive Utils - iPad scenario', () => {
  let responsiveIpad: typeof import('../../utils/responsive');

  beforeAll(async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      Dimensions: {
        get: jest.fn(() => ({ width: 1024, height: 1366 })),
      },
    }));
    responsiveIpad = await import('../../utils/responsive');
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should cap WIDTH_CAPPED at 430 on iPad', () => {
    expect(responsiveIpad.WIDTH_CAPPED).toBe(430);
  });

  it('should cap HEIGHT_CAPPED at 932 on iPad', () => {
    expect(responsiveIpad.HEIGHT_CAPPED).toBe(932);
  });

  it('should still expose real screen dimensions', () => {
    expect(responsiveIpad.SCREEN_WIDTH).toBe(1024);
    expect(responsiveIpad.SCREEN_HEIGHT).toBe(1366);
  });

  it('wp should use real screen width, not capped', () => {
    expect(responsiveIpad.wp(100)).toBe(1024);
  });

  it('sp should use capped width', () => {
    expect(responsiveIpad.sp(100)).toBe(430);
  });
});
