import { useModerationStore } from '../../stores/moderationStore';

describe('moderationStore', () => {
  beforeEach(() => {
    useModerationStore.setState({
      status: null,
      reason: null,
      suspendedUntil: null,
    });
  });

  describe('Initial state', () => {
    it('status defaults to null', () => {
      expect(useModerationStore.getState().status).toBeNull();
    });

    it('reason defaults to null', () => {
      expect(useModerationStore.getState().reason).toBeNull();
    });

    it('suspendedUntil defaults to null', () => {
      expect(useModerationStore.getState().suspendedUntil).toBeNull();
    });
  });

  describe('setModeration', () => {
    it('sets suspended status with reason', () => {
      useModerationStore.getState().setModeration('suspended', 'Spam detected');
      const state = useModerationStore.getState();
      expect(state.status).toBe('suspended');
      expect(state.reason).toBe('Spam detected');
    });

    it('sets banned status with reason', () => {
      useModerationStore.getState().setModeration('banned', 'Repeated violations');
      const state = useModerationStore.getState();
      expect(state.status).toBe('banned');
      expect(state.reason).toBe('Repeated violations');
    });

    it('sets suspendedUntil when provided', () => {
      useModerationStore.getState().setModeration('suspended', 'Temporary ban', '2026-03-01T00:00:00Z');
      const state = useModerationStore.getState();
      expect(state.status).toBe('suspended');
      expect(state.reason).toBe('Temporary ban');
      expect(state.suspendedUntil).toBe('2026-03-01T00:00:00Z');
    });

    it('sets suspendedUntil to null when not provided', () => {
      useModerationStore.getState().setModeration('banned', 'Permanent ban');
      expect(useModerationStore.getState().suspendedUntil).toBeNull();
    });

    it('overwrites previous moderation state', () => {
      useModerationStore.getState().setModeration('suspended', 'First offense', '2026-04-01T00:00:00Z');
      useModerationStore.getState().setModeration('banned', 'Escalated to ban');
      const state = useModerationStore.getState();
      expect(state.status).toBe('banned');
      expect(state.reason).toBe('Escalated to ban');
      expect(state.suspendedUntil).toBeNull();
    });
  });

  describe('clearModeration', () => {
    it('clears all fields to null', () => {
      useModerationStore.getState().setModeration('suspended', 'Some reason', '2026-05-01T00:00:00Z');
      useModerationStore.getState().clearModeration();
      const state = useModerationStore.getState();
      expect(state.status).toBeNull();
      expect(state.reason).toBeNull();
      expect(state.suspendedUntil).toBeNull();
    });

    it('works after suspension', () => {
      useModerationStore.getState().setModeration('suspended', 'Spam', '2026-06-15T12:00:00Z');
      useModerationStore.getState().clearModeration();
      const state = useModerationStore.getState();
      expect(state.status).toBeNull();
      expect(state.reason).toBeNull();
      expect(state.suspendedUntil).toBeNull();
    });

    it('works after ban', () => {
      useModerationStore.getState().setModeration('banned', 'Harassment');
      useModerationStore.getState().clearModeration();
      const state = useModerationStore.getState();
      expect(state.status).toBeNull();
      expect(state.reason).toBeNull();
      expect(state.suspendedUntil).toBeNull();
    });

    it('is safe to call when already cleared', () => {
      useModerationStore.getState().clearModeration();
      const state = useModerationStore.getState();
      expect(state.status).toBeNull();
      expect(state.reason).toBeNull();
      expect(state.suspendedUntil).toBeNull();
    });

    it('is safe to call multiple times', () => {
      useModerationStore.getState().setModeration('banned', 'Test');
      useModerationStore.getState().clearModeration();
      useModerationStore.getState().clearModeration();
      useModerationStore.getState().clearModeration();
      expect(useModerationStore.getState().status).toBeNull();
    });
  });

  describe('Lifecycle: set -> clear -> set', () => {
    it('should support full moderation lifecycle', () => {
      // 1. Set suspended
      useModerationStore.getState().setModeration('suspended', 'Warning', '2026-06-01T00:00:00Z');
      expect(useModerationStore.getState().status).toBe('suspended');

      // 2. Clear (appeal success)
      useModerationStore.getState().clearModeration();
      expect(useModerationStore.getState().status).toBeNull();

      // 3. New violation -> banned
      useModerationStore.getState().setModeration('banned', 'Repeated offense');
      expect(useModerationStore.getState().status).toBe('banned');
      expect(useModerationStore.getState().suspendedUntil).toBeNull();
    });

    it('should handle empty string suspendedUntil as falsy (falls back to null)', () => {
      useModerationStore.getState().setModeration('suspended', 'Test', '');
      // Empty string is falsy, so || null gives null
      expect(useModerationStore.getState().suspendedUntil).toBeNull();
    });
  });
});
