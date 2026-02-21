/**
 * Platform Config Tests
 * Tests for platform detection constants (IS_IOS, IS_ANDROID, KEYBOARD_BEHAVIOR).
 *
 * Since these values are evaluated at module load time, we use jest.isolateModules
 * to test each platform configuration independently.
 */

describe('Platform Config', () => {
  afterEach(() => {
    jest.resetModules();
  });

  describe('when Platform.OS is ios', () => {
    beforeEach(() => {
      jest.mock('react-native', () => ({
        Platform: { OS: 'ios' },
      }));
    });

    it('should set IS_IOS to true', () => {
      jest.isolateModules(() => {
        const { IS_IOS } = require('../../config/platform');
        expect(IS_IOS).toBe(true);
      });
    });

    it('should set IS_ANDROID to false', () => {
      jest.isolateModules(() => {
        const { IS_ANDROID } = require('../../config/platform');
        expect(IS_ANDROID).toBe(false);
      });
    });

    it('should set KEYBOARD_BEHAVIOR to "padding"', () => {
      jest.isolateModules(() => {
        const { KEYBOARD_BEHAVIOR } = require('../../config/platform');
        expect(KEYBOARD_BEHAVIOR).toBe('padding');
      });
    });
  });

  describe('when Platform.OS is android', () => {
    beforeEach(() => {
      jest.mock('react-native', () => ({
        Platform: { OS: 'android' },
      }));
    });

    it('should set IS_IOS to false', () => {
      jest.isolateModules(() => {
        const { IS_IOS } = require('../../config/platform');
        expect(IS_IOS).toBe(false);
      });
    });

    it('should set IS_ANDROID to true', () => {
      jest.isolateModules(() => {
        const { IS_ANDROID } = require('../../config/platform');
        expect(IS_ANDROID).toBe(true);
      });
    });

    it('should set KEYBOARD_BEHAVIOR to "height"', () => {
      jest.isolateModules(() => {
        const { KEYBOARD_BEHAVIOR } = require('../../config/platform');
        expect(KEYBOARD_BEHAVIOR).toBe('height');
      });
    });
  });
});
