/**
 * AccountBannedScreen Tests
 *
 * Tests that the AccountBannedScreen correctly wires props to
 * ModerationStatusScreen and that logout / contact-support callbacks
 * behave as expected.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Mocks — declared before imports so they are hoisted by Jest
// ---------------------------------------------------------------------------

let mockReason: string | null = null;

jest.mock('../../stores/moderationStore', () => ({
  useModerationStore: jest.fn(() => ({ reason: mockReason })),
}));

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/backend', () => ({
  signOut: mockSignOut,
}));

const mockOpenURL = jest.fn().mockResolvedValue(undefined);
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (s: any) => s },
  Linking: { openURL: mockOpenURL },
  Platform: { OS: 'ios', select: (o: any) => o.ios },
  useColorScheme: () => 'light',
}));

/**
 * Mock ModerationStatusScreen to capture the props the parent passes in.
 * We store the latest props on every render so individual tests can inspect
 * them and invoke callbacks.
 */
let capturedProps: Record<string, any> = {};

jest.mock('../../components/ModerationStatusScreen', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => {
      capturedProps = { ...props };
      return React.createElement('ModerationStatusScreen', props);
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  SafeAreaProvider: 'SafeAreaProvider',
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AccountBannedScreen from '../../screens/moderation/AccountBannedScreen';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderScreen() {
  let root: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(React.createElement(AccountBannedScreen));
  });
  return root!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReason = null;
  capturedProps = {};
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountBannedScreen', () => {
  // -----------------------------------------------------------------------
  // Static props forwarded to ModerationStatusScreen
  // -----------------------------------------------------------------------

  describe('props forwarding', () => {
    it('passes the correct title to ModerationStatusScreen', () => {
      renderScreen();
      expect(capturedProps.title).toBe('Account Banned');
    });

    it('passes the correct titleColor', () => {
      renderScreen();
      expect(capturedProps.titleColor).toBe('#FF3B30');
    });

    it('passes the correct description', () => {
      renderScreen();
      expect(capturedProps.description).toBe(
        'Your account has been permanently banned due to repeated violations of our community guidelines.',
      );
    });

    it('passes the correct iconName', () => {
      renderScreen();
      expect(capturedProps.iconName).toBe('ban-outline');
    });

    it('passes the correct iconColor', () => {
      renderScreen();
      expect(capturedProps.iconColor).toBe('#FF3B30');
    });

    it('passes the correct notice text', () => {
      renderScreen();
      expect(capturedProps.notice).toBe(
        'If you believe this was a mistake, you can contact our support team to file an appeal.',
      );
    });

    it('passes the correct defaultReason', () => {
      renderScreen();
      expect(capturedProps.defaultReason).toBe('Repeated community guidelines violations');
    });

    it('sets showAppealButton to true', () => {
      renderScreen();
      expect(capturedProps.showAppealButton).toBe(true);
    });

    it('sets appealButtonLabel to "Contact Support"', () => {
      renderScreen();
      expect(capturedProps.appealButtonLabel).toBe('Contact Support');
    });

    it('sets appealButtonColor to #FF3B30', () => {
      renderScreen();
      expect(capturedProps.appealButtonColor).toBe('#FF3B30');
    });
  });

  // -----------------------------------------------------------------------
  // Reason from moderation store
  // -----------------------------------------------------------------------

  describe('reason from store', () => {
    it('forwards a non-null reason from the moderation store', () => {
      mockReason = 'Hate speech and harassment';
      renderScreen();
      expect(capturedProps.reason).toBe('Hate speech and harassment');
    });

    it('forwards null reason when the store has no reason', () => {
      mockReason = null;
      renderScreen();
      expect(capturedProps.reason).toBeNull();
    });

    it('forwards an empty string reason from the store', () => {
      mockReason = '';
      renderScreen();
      expect(capturedProps.reason).toBe('');
    });

    it('forwards a long reason string from the store', () => {
      mockReason = 'This account was banned for multiple violations including spam, harassment, and inappropriate content that violates our terms of service.';
      renderScreen();
      expect(capturedProps.reason).toBe(mockReason);
    });
  });

  // -----------------------------------------------------------------------
  // Logout handler
  // -----------------------------------------------------------------------

  describe('logout', () => {
    it('calls backend.signOut when the logout callback is invoked', async () => {
      renderScreen();
      await act(async () => {
        await capturedProps.onLogout();
      });
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('passes onLogout as a function to ModerationStatusScreen', () => {
      renderScreen();
      expect(typeof capturedProps.onLogout).toBe('function');
    });

    it('awaits the signOut promise', async () => {
      let resolved = false;
      mockSignOut.mockImplementationOnce(() => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve();
          }, 0);
        });
      });
      renderScreen();
      await act(async () => {
        await capturedProps.onLogout();
      });
      expect(resolved).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Contact support handler
  // -----------------------------------------------------------------------

  describe('contact support', () => {
    it('calls Linking.openURL with a mailto URL when appeal callback is invoked', () => {
      renderScreen();
      act(() => {
        capturedProps.onAppeal();
      });

      expect(mockOpenURL).toHaveBeenCalledTimes(1);
      const calledURL: string = mockOpenURL.mock.calls[0][0];
      expect(calledURL).toContain('mailto:support@smuppy.com');
    });

    it('includes the correct subject in the mailto URL', () => {
      renderScreen();
      act(() => {
        capturedProps.onAppeal();
      });

      const calledURL: string = mockOpenURL.mock.calls[0][0];
      const expectedSubject = encodeURIComponent('Account Ban Appeal');
      expect(calledURL).toContain(`subject=${expectedSubject}`);
    });

    it('includes a body with the appeal prompt in the mailto URL', () => {
      renderScreen();
      act(() => {
        capturedProps.onAppeal();
      });

      const calledURL: string = mockOpenURL.mock.calls[0][0];
      expect(calledURL).toContain('body=');
      const expectedBodyFragment = encodeURIComponent('I would like to appeal my account ban.');
      expect(calledURL).toContain(expectedBodyFragment);
    });

    it('includes the full expected body text', () => {
      renderScreen();
      act(() => {
        capturedProps.onAppeal();
      });

      const calledURL: string = mockOpenURL.mock.calls[0][0];
      const expectedBody = encodeURIComponent(
        'I would like to appeal my account ban.\n\nPlease describe why you believe this was a mistake:\n',
      );
      expect(calledURL).toContain(`body=${expectedBody}`);
    });

    it('catches errors from Linking.openURL silently', () => {
      mockOpenURL.mockReturnValueOnce(Promise.reject(new Error('Cannot open URL')));
      renderScreen();

      // Should not throw
      expect(() => {
        act(() => {
          capturedProps.onAppeal();
        });
      }).not.toThrow();
    });

    it('passes onAppeal as a function to ModerationStatusScreen', () => {
      renderScreen();
      expect(typeof capturedProps.onAppeal).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // Rendered output smoke tests
  // -----------------------------------------------------------------------

  describe('rendered output', () => {
    it('renders without crashing', () => {
      expect(() => renderScreen()).not.toThrow();
    });

    it('renders a ModerationStatusScreen element', () => {
      const tree = renderScreen();
      const json = tree.toJSON() as any;
      expect(json.type).toBe('ModerationStatusScreen');
    });

    it('renders with all expected prop keys', () => {
      renderScreen();
      const expectedKeys = [
        'iconName',
        'iconColor',
        'title',
        'titleColor',
        'description',
        'reason',
        'defaultReason',
        'notice',
        'showAppealButton',
        'appealButtonLabel',
        'appealButtonColor',
        'onLogout',
        'onAppeal',
      ];
      for (const key of expectedKeys) {
        expect(capturedProps).toHaveProperty(key);
      }
    });

    it('does not pass additionalInfo prop (only suspended screen uses it)', () => {
      renderScreen();
      expect(capturedProps.additionalInfo).toBeUndefined();
    });
  });
});
