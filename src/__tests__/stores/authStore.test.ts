/**
 * Auth Store Tests
 * Tests for session management, clearAuth, and state mutations
 */

import { useAuthStore, Session } from '../../stores/authStore';

describe('AuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. Initial State
  // ==========================================================================
  describe('Initial State', () => {
    it('should have null session initially', () => {
      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
    });
  });

  // ==========================================================================
  // 2. setSession
  // ==========================================================================
  describe('setSession', () => {
    it('should set session with access and refresh tokens', () => {
      const mockSession: Session = {
        access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-access',
        refresh_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-refresh',
      };

      useAuthStore.getState().setSession(mockSession);
      const state = useAuthStore.getState();

      expect(state.session).toEqual(mockSession);
      expect(state.session?.access_token).toBe(mockSession.access_token);
      expect(state.session?.refresh_token).toBe(mockSession.refresh_token);
    });

    it('should set session with user field', () => {
      const mockSession: Session = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        user: { sub: 'user-uuid-1234', email: 'test@example.com' },
      };

      useAuthStore.getState().setSession(mockSession);
      const state = useAuthStore.getState();

      expect(state.session?.user).toEqual({ sub: 'user-uuid-1234', email: 'test@example.com' });
    });

    it('should set session with additional arbitrary fields', () => {
      const mockSession: Session = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expires_in: 3600,
        token_type: 'Bearer',
      };

      useAuthStore.getState().setSession(mockSession);
      const state = useAuthStore.getState();

      expect(state.session?.expires_in).toBe(3600);
      expect(state.session?.token_type).toBe('Bearer');
    });

    it('should set session to null', () => {
      // First set a session
      useAuthStore.getState().setSession({
        access_token: 'access-123',
        refresh_token: 'refresh-456',
      });
      expect(useAuthStore.getState().session).not.toBeNull();

      // Then clear it via setSession(null)
      useAuthStore.getState().setSession(null);
      expect(useAuthStore.getState().session).toBeNull();
    });

    it('should replace existing session with new session', () => {
      const firstSession: Session = {
        access_token: 'old-access',
        refresh_token: 'old-refresh',
      };
      const secondSession: Session = {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      };

      useAuthStore.getState().setSession(firstSession);
      expect(useAuthStore.getState().session?.access_token).toBe('old-access');

      useAuthStore.getState().setSession(secondSession);
      expect(useAuthStore.getState().session?.access_token).toBe('new-access');
      expect(useAuthStore.getState().session?.refresh_token).toBe('new-refresh');
    });

    it('should handle session with empty string tokens', () => {
      const mockSession: Session = {
        access_token: '',
        refresh_token: '',
      };

      useAuthStore.getState().setSession(mockSession);
      const state = useAuthStore.getState();

      expect(state.session).toEqual(mockSession);
      expect(state.session?.access_token).toBe('');
      expect(state.session?.refresh_token).toBe('');
    });
  });

  // ==========================================================================
  // 3. clearAuth
  // ==========================================================================
  describe('clearAuth', () => {
    it('should clear session to null', () => {
      useAuthStore.getState().setSession({
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        user: { sub: 'user-1' },
      });
      expect(useAuthStore.getState().session).not.toBeNull();

      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().session).toBeNull();
    });

    it('should be safe to call when session is already null', () => {
      expect(useAuthStore.getState().session).toBeNull();

      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().session).toBeNull();
    });

    it('should be safe to call multiple times', () => {
      useAuthStore.getState().setSession({
        access_token: 'access-123',
        refresh_token: 'refresh-456',
      });

      useAuthStore.getState().clearAuth();
      useAuthStore.getState().clearAuth();
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().session).toBeNull();
    });
  });

  // ==========================================================================
  // 4. State Lifecycle (set -> clear -> set)
  // ==========================================================================
  describe('State Lifecycle', () => {
    it('should support full lifecycle: set -> clear -> set', () => {
      // 1. Set initial session
      const session1: Session = {
        access_token: 'first-access',
        refresh_token: 'first-refresh',
      };
      useAuthStore.getState().setSession(session1);
      expect(useAuthStore.getState().session?.access_token).toBe('first-access');

      // 2. Clear
      useAuthStore.getState().clearAuth();
      expect(useAuthStore.getState().session).toBeNull();

      // 3. Set new session
      const session2: Session = {
        access_token: 'second-access',
        refresh_token: 'second-refresh',
      };
      useAuthStore.getState().setSession(session2);
      expect(useAuthStore.getState().session?.access_token).toBe('second-access');
    });

    it('should maintain state isolation (clearAuth does not affect subsequent setSession)', () => {
      useAuthStore.getState().setSession({
        access_token: 'before-clear',
        refresh_token: 'before-refresh',
        user: { id: 'user-1' },
      });

      useAuthStore.getState().clearAuth();

      const newSession: Session = {
        access_token: 'after-clear',
        refresh_token: 'after-refresh',
      };
      useAuthStore.getState().setSession(newSession);

      const state = useAuthStore.getState();
      expect(state.session?.access_token).toBe('after-clear');
      // Old user field should not persist
      expect(state.session?.user).toBeUndefined();
    });
  });
});
