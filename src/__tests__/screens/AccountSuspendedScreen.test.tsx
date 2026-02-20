/**
 * AccountSuspendedScreen Tests
 *
 * Tests that the AccountSuspendedScreen correctly wires props to
 * ModerationStatusScreen, that the formatTimeRemaining logic produces
 * the right human-readable strings, and that the logout callback works.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Mocks — declared before imports so they are hoisted by Jest
// ---------------------------------------------------------------------------

let mockReason: string | null = null;
let mockSuspendedUntil: string | null = null;

jest.mock('../../stores/moderationStore', () => ({
  useModerationStore: jest.fn(() => ({
    reason: mockReason,
    suspendedUntil: mockSuspendedUntil,
  })),
}));

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/backend', () => ({
  signOut: mockSignOut,
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      gray50: '#F9F9F9',
      grayBorder: '#E0E0E0',
      gray: '#999999',
      dark: '#333333',
      background: '#FFFFFF',
      white: '#FFFFFF',
    },
  })),
}));

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (s: any) => s },
  Linking: { openURL: jest.fn() },
  Platform: { OS: 'ios', select: (o: any) => o.ios },
  useColorScheme: () => 'light',
}));

/**
 * Mock ModerationStatusScreen to capture the props the parent passes in.
 * The additionalInfo prop is stored so we can render and inspect it.
 */
let capturedProps: Record<string, any> = {};

jest.mock('../../components/ModerationStatusScreen', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => {
      capturedProps = { ...props };
      // Render the additionalInfo (duration card) so we can find it in the tree
      return React.createElement(
        'ModerationStatusScreen',
        null,
        props.additionalInfo || null,
      );
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
import AccountSuspendedScreen from '../../screens/moderation/AccountSuspendedScreen';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderScreen() {
  let root: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(React.createElement(AccountSuspendedScreen));
  });
  return root!;
}

/**
 * Recursively extract all text strings from a react-test-renderer JSON tree.
 */
function extractAllText(node: any): string[] {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  const texts: string[] = [];
  if (Array.isArray(node)) {
    for (const child of node) {
      texts.push(...extractAllText(child));
    }
  } else if (node.children) {
    for (const child of node.children) {
      texts.push(...extractAllText(child));
    }
  }
  return texts;
}

/**
 * Render the screen and extract all text strings from the rendered tree.
 */
function getDurationCardText(): string[] {
  const tree = renderScreen();
  const json = tree.toJSON();
  return extractAllText(json);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReason = null;
  mockSuspendedUntil = null;
  capturedProps = {};
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountSuspendedScreen', () => {
  // -----------------------------------------------------------------------
  // Static props forwarded to ModerationStatusScreen
  // -----------------------------------------------------------------------

  describe('props forwarding', () => {
    it('passes the correct title', () => {
      renderScreen();
      expect(capturedProps.title).toBe('Account Suspended');
    });

    it('passes the correct description', () => {
      renderScreen();
      expect(capturedProps.description).toBe(
        'Your account has been temporarily suspended for violating our community guidelines.',
      );
    });

    it('passes the correct iconName', () => {
      renderScreen();
      expect(capturedProps.iconName).toBe('time-outline');
    });

    it('passes the correct iconColor', () => {
      renderScreen();
      expect(capturedProps.iconColor).toBe('#FF9500');
    });

    it('passes the correct notice text', () => {
      renderScreen();
      expect(capturedProps.notice).toBe(
        'During the suspension, you cannot post, comment, or send messages. You can still browse content.',
      );
    });

    it('passes the correct defaultReason', () => {
      renderScreen();
      expect(capturedProps.defaultReason).toBe('Community guidelines violation');
    });

    it('does not pass showAppealButton', () => {
      renderScreen();
      expect(capturedProps.showAppealButton).toBeUndefined();
    });

    it('does not pass titleColor (uses default)', () => {
      renderScreen();
      expect(capturedProps.titleColor).toBeUndefined();
    });

    it('does not pass appealButtonLabel', () => {
      renderScreen();
      expect(capturedProps.appealButtonLabel).toBeUndefined();
    });

    it('does not pass appealButtonColor', () => {
      renderScreen();
      expect(capturedProps.appealButtonColor).toBeUndefined();
    });

    it('does not pass onAppeal', () => {
      renderScreen();
      expect(capturedProps.onAppeal).toBeUndefined();
    });

    it('passes additionalInfo as a React element', () => {
      renderScreen();
      expect(capturedProps.additionalInfo).toBeDefined();
      expect(React.isValidElement(capturedProps.additionalInfo)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Reason from moderation store
  // -----------------------------------------------------------------------

  describe('reason from store', () => {
    it('forwards a non-null reason from the moderation store', () => {
      mockReason = 'Inappropriate content';
      renderScreen();
      expect(capturedProps.reason).toBe('Inappropriate content');
    });

    it('forwards null reason when the store has no reason', () => {
      mockReason = null;
      renderScreen();
      expect(capturedProps.reason).toBeNull();
    });

    it('forwards an empty string reason', () => {
      mockReason = '';
      renderScreen();
      expect(capturedProps.reason).toBe('');
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
  // Duration card / formatTimeRemaining
  // -----------------------------------------------------------------------

  describe('duration card — formatTimeRemaining', () => {
    // --- null / past ---

    it('shows "until further notice" when suspendedUntil is null', () => {
      mockSuspendedUntil = null;
      const texts = getDurationCardText();
      expect(texts).toContain('until further notice');
    });

    it('shows "ending soon" when suspendedUntil is in the past', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-20T12:00:00Z'));
      mockSuspendedUntil = '2026-02-20T11:00:00Z'; // 1 hour ago
      const texts = getDurationCardText();
      expect(texts).toContain('ending soon');
    });

    it('shows "ending soon" when suspendedUntil equals now exactly', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-20T12:00:00Z'));
      mockSuspendedUntil = '2026-02-20T12:00:00Z';
      const texts = getDurationCardText();
      expect(texts).toContain('ending soon');
    });

    // --- Days ---

    it('shows "3 days remaining" for a 3-day suspension', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 3 * ONE_DAY_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('3 days remaining');
    });

    it('shows "1 day remaining" (singular) when just over 1 day', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(
        now.getTime() + 1 * ONE_DAY_MS + 30 * ONE_MINUTE_MS,
      ).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('1 day remaining');
    });

    it('shows "7 days remaining" for a week-long suspension', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 7 * ONE_DAY_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('7 days remaining');
    });

    it('shows "2 days remaining" for exactly 2 days', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 2 * ONE_DAY_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('2 days remaining');
    });

    // --- Hours ---

    it('shows "5 hours remaining" for a 5-hour suspension', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 5 * ONE_HOUR_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('5 hours remaining');
    });

    it('shows "1 hour remaining" (singular) when just over 1 hour', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(
        now.getTime() + 1 * ONE_HOUR_MS + 15 * ONE_MINUTE_MS,
      ).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('1 hour remaining');
    });

    it('shows "23 hours remaining" for just under 1 day', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(
        now.getTime() + 23 * ONE_HOUR_MS + 30 * ONE_MINUTE_MS,
      ).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('23 hours remaining');
    });

    it('shows "12 hours remaining" for exactly 12 hours', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 12 * ONE_HOUR_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('12 hours remaining');
    });

    // --- Minutes ---

    it('shows "45 minutes remaining" for a 45-minute suspension', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 45 * ONE_MINUTE_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('45 minutes remaining');
    });

    it('shows "1 minute remaining" (singular) when just over 1 minute', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(
        now.getTime() + 1 * ONE_MINUTE_MS + 30 * 1000,
      ).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('1 minute remaining');
    });

    it('shows "0 minute remaining" (singular) when less than 1 minute is left', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 30 * 1000).toISOString(); // 30 seconds
      const texts = getDurationCardText();
      // 0 minutes: the source uses `minutes > 1` for plural, so 0 is singular
      expect(texts).toContain('0 minute remaining');
    });

    it('shows "30 minutes remaining" for exactly 30 minutes', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 30 * ONE_MINUTE_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('30 minutes remaining');
    });

    // --- Duration label ---

    it('renders the "Duration" label in the duration card', () => {
      mockSuspendedUntil = null;
      const texts = getDurationCardText();
      expect(texts).toContain('Duration');
    });

    // --- Boundary: exactly 24 hours should show days ---

    it('shows "1 day remaining" for exactly 24 hours (boundary)', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 24 * ONE_HOUR_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('1 day remaining');
    });

    // --- Boundary: exactly 60 minutes should show hours ---

    it('shows "1 hour remaining" for exactly 60 minutes (boundary)', () => {
      jest.useFakeTimers();
      const now = new Date('2026-02-20T12:00:00Z');
      jest.setSystemTime(now);
      mockSuspendedUntil = new Date(now.getTime() + 60 * ONE_MINUTE_MS).toISOString();
      const texts = getDurationCardText();
      expect(texts).toContain('1 hour remaining');
    });
  });

  // -----------------------------------------------------------------------
  // Rendered output smoke tests
  // -----------------------------------------------------------------------

  describe('rendered output', () => {
    it('renders without crashing', () => {
      expect(() => renderScreen()).not.toThrow();
    });

    it('renders a ModerationStatusScreen element at the root', () => {
      const tree = renderScreen();
      const json = tree.toJSON() as any;
      expect(json.type).toBe('ModerationStatusScreen');
    });

    it('renders the duration card as children of ModerationStatusScreen', () => {
      const tree = renderScreen();
      const json = tree.toJSON() as any;
      expect(json.children).toBeTruthy();
      expect(json.children.length).toBeGreaterThan(0);
    });

    it('renders with all expected prop keys', () => {
      renderScreen();
      const expectedKeys = [
        'iconName',
        'iconColor',
        'title',
        'description',
        'reason',
        'defaultReason',
        'notice',
        'onLogout',
        'additionalInfo',
      ];
      for (const key of expectedKeys) {
        expect(capturedProps).toHaveProperty(key);
      }
    });
  });
});
