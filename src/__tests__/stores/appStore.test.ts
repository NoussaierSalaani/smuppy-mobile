import { useAppStore } from '../../stores/appStore';

describe('appStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      isTabBarVisible: true,
      isOnline: true,
      globalLoading: false,
      errorModal: { visible: false, title: '', message: '' },
      unreadNotifications: 0,
      unreadMessages: 0,
    });
  });

  describe('Initial state', () => {
    it('isTabBarVisible defaults to true', () => {
      expect(useAppStore.getState().isTabBarVisible).toBe(true);
    });

    it('isOnline defaults to true', () => {
      expect(useAppStore.getState().isOnline).toBe(true);
    });

    it('globalLoading defaults to false', () => {
      expect(useAppStore.getState().globalLoading).toBe(false);
    });

    it('errorModal defaults to {visible: false, title: "", message: ""}', () => {
      expect(useAppStore.getState().errorModal).toEqual({
        visible: false,
        title: '',
        message: '',
      });
    });

    it('unreadNotifications defaults to 0', () => {
      expect(useAppStore.getState().unreadNotifications).toBe(0);
    });

    it('unreadMessages defaults to 0', () => {
      expect(useAppStore.getState().unreadMessages).toBe(0);
    });
  });

  describe('setTabBarVisible', () => {
    it('sets to false', () => {
      useAppStore.getState().setTabBarVisible(false);
      expect(useAppStore.getState().isTabBarVisible).toBe(false);
    });

    it('sets to true', () => {
      useAppStore.getState().setTabBarVisible(false);
      useAppStore.getState().setTabBarVisible(true);
      expect(useAppStore.getState().isTabBarVisible).toBe(true);
    });
  });

  describe('setOnline', () => {
    it('sets to false', () => {
      useAppStore.getState().setOnline(false);
      expect(useAppStore.getState().isOnline).toBe(false);
    });

    it('sets to true', () => {
      useAppStore.getState().setOnline(false);
      useAppStore.getState().setOnline(true);
      expect(useAppStore.getState().isOnline).toBe(true);
    });
  });

  describe('setGlobalLoading', () => {
    it('sets to true', () => {
      useAppStore.getState().setGlobalLoading(true);
      expect(useAppStore.getState().globalLoading).toBe(true);
    });

    it('sets back to false', () => {
      useAppStore.getState().setGlobalLoading(true);
      useAppStore.getState().setGlobalLoading(false);
      expect(useAppStore.getState().globalLoading).toBe(false);
    });
  });

  describe('showError / hideError', () => {
    it('showError sets visible=true, title, and message', () => {
      useAppStore.getState().showError('Network Error', 'Unable to connect to server');
      expect(useAppStore.getState().errorModal).toEqual({
        visible: true,
        title: 'Network Error',
        message: 'Unable to connect to server',
      });
    });

    it('hideError sets visible=false but retains title and message', () => {
      useAppStore.getState().showError('Error Title', 'Error message');
      useAppStore.getState().hideError();
      const errorModal = useAppStore.getState().errorModal;
      expect(errorModal.visible).toBe(false);
      expect(errorModal.title).toBe('Error Title');
      expect(errorModal.message).toBe('Error message');
    });

    it('multiple showError calls overwrite each other', () => {
      useAppStore.getState().showError('First Error', 'First message');
      useAppStore.getState().showError('Second Error', 'Second message');
      expect(useAppStore.getState().errorModal).toEqual({
        visible: true,
        title: 'Second Error',
        message: 'Second message',
      });
    });

    it('hideError then showError works correctly', () => {
      useAppStore.getState().showError('Initial Error', 'Initial message');
      useAppStore.getState().hideError();
      expect(useAppStore.getState().errorModal.visible).toBe(false);

      useAppStore.getState().showError('New Error', 'New message');
      expect(useAppStore.getState().errorModal).toEqual({
        visible: true,
        title: 'New Error',
        message: 'New message',
      });
    });
  });

  describe('setUnreadNotifications', () => {
    it('sets with number value', () => {
      useAppStore.getState().setUnreadNotifications(5);
      expect(useAppStore.getState().unreadNotifications).toBe(5);
    });

    it('sets with updater function (prev => prev + 1)', () => {
      useAppStore.getState().setUnreadNotifications(3);
      useAppStore.getState().setUnreadNotifications((prev) => prev + 1);
      expect(useAppStore.getState().unreadNotifications).toBe(4);
    });

    it('updater function receives current value', () => {
      useAppStore.getState().setUnreadNotifications(10);
      useAppStore.getState().setUnreadNotifications((prev) => prev * 2);
      expect(useAppStore.getState().unreadNotifications).toBe(20);
    });

    it('setting to 0 resets', () => {
      useAppStore.getState().setUnreadNotifications(7);
      useAppStore.getState().setUnreadNotifications(0);
      expect(useAppStore.getState().unreadNotifications).toBe(0);
    });
  });

  describe('setUnreadMessages', () => {
    it('sets with number value', () => {
      useAppStore.getState().setUnreadMessages(12);
      expect(useAppStore.getState().unreadMessages).toBe(12);
    });

    it('sets with updater function', () => {
      useAppStore.getState().setUnreadMessages(5);
      useAppStore.getState().setUnreadMessages((prev) => prev + 3);
      expect(useAppStore.getState().unreadMessages).toBe(8);
    });

    it('works correctly with sequential updates', () => {
      useAppStore.getState().setUnreadMessages(1);
      useAppStore.getState().setUnreadMessages((prev) => prev + 1);
      useAppStore.getState().setUnreadMessages((prev) => prev + 1);
      useAppStore.getState().setUnreadMessages(10);
      useAppStore.getState().setUnreadMessages((prev) => prev - 5);
      expect(useAppStore.getState().unreadMessages).toBe(5);
    });
  });

  describe('State Isolation', () => {
    it('setTabBarVisible should not affect other state', () => {
      useAppStore.getState().setGlobalLoading(true);
      useAppStore.getState().setOnline(false);
      useAppStore.getState().setUnreadNotifications(5);

      useAppStore.getState().setTabBarVisible(false);

      const state = useAppStore.getState();
      expect(state.isTabBarVisible).toBe(false);
      expect(state.globalLoading).toBe(true);
      expect(state.isOnline).toBe(false);
      expect(state.unreadNotifications).toBe(5);
    });

    it('showError should not affect badge counts', () => {
      useAppStore.getState().setUnreadNotifications(3);
      useAppStore.getState().setUnreadMessages(7);

      useAppStore.getState().showError('Test', 'Error');

      expect(useAppStore.getState().unreadNotifications).toBe(3);
      expect(useAppStore.getState().unreadMessages).toBe(7);
    });

    it('setOnline should not affect loading state', () => {
      useAppStore.getState().setGlobalLoading(true);
      useAppStore.getState().setOnline(false);

      expect(useAppStore.getState().globalLoading).toBe(true);
      expect(useAppStore.getState().isOnline).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('showError with empty strings', () => {
      useAppStore.getState().showError('', '');
      const modal = useAppStore.getState().errorModal;
      expect(modal.visible).toBe(true);
      expect(modal.title).toBe('');
      expect(modal.message).toBe('');
    });

    it('setUnreadNotifications updater that returns 0', () => {
      useAppStore.getState().setUnreadNotifications(10);
      useAppStore.getState().setUnreadNotifications(() => 0);
      expect(useAppStore.getState().unreadNotifications).toBe(0);
    });
  });
});
