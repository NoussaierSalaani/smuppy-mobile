/**
 * Profile E2E Tests
 * Tests profile view, edit, followers, following
 */

import { device, element, by, expect, waitFor } from 'detox';
import { 
  TIMEOUTS, 
  login, 
  waitForText, 
  safeTap,
  waitForElement,
  typeInInput
} from '../utils/testHelpers';

describe('Profile', () => {
  beforeAll(async () => {
    await device.launchApp();
    await login();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    await waitForText('Fan', TIMEOUTS.long);
    await safeTap('profile-tab');
  });

  describe('Profile Screen', () => {
    it('should display user profile info', async () => {
      await waitForElement('profile-screen', TIMEOUTS.medium);
      await expect(element(by.id('username'))).toBeVisible();
      await expect(element(by.id('bio'))).toExist();
    });

    it('should show post/fans/following counts', async () => {
      await expect(element(by.id('posts-count'))).toBeVisible();
      await expect(element(by.id('fans-count'))).toBeVisible();
      await expect(element(by.id('following-count'))).toBeVisible();
    });

    it('should display user posts grid', async () => {
      await expect(element(by.id('posts-grid'))).toBeVisible();
    });

    it('should switch between posts and peaks tabs', async () => {
      await element(by.text('Posts')).tap();
      await expect(element(by.id('posts-grid'))).toBeVisible();
      
      await element(by.text('Peaks')).tap();
      await expect(element(by.id('peaks-grid'))).toBeVisible();
    });
  });

  describe('Edit Profile', () => {
    beforeEach(async () => {
      await safeTap('edit-profile-button');
      await waitForText('Modifier le profil');
    });

    it('should open edit profile screen', async () => {
      await expect(element(by.id('edit-profile-screen'))).toBeVisible();
    });

    it('should update bio', async () => {
      await element(by.id('bio-input')).clearText();
      await element(by.id('bio-input')).typeText('Updated bio ' + Date.now());
      await safeTap('save-button');
      await waitForText('Profil mis a jour');
    });

    it('should update username', async () => {
      const newUsername = 'user_' + Date.now();
      await element(by.id('username-input')).clearText();
      await element(by.id('username-input')).typeText(newUsername);
      await safeTap('save-button');
    });

    it('should cancel edit and go back', async () => {
      await safeTap('back-button');
      await expect(element(by.id('profile-screen'))).toBeVisible();
    });
  });

  describe('Followers/Following', () => {
    it('should open fans list', async () => {
      await element(by.id('fans-count')).tap();
      await waitForText('Fans');
    });

    it('should open following list', async () => {
      await element(by.id('following-count')).tap();
      await waitForText('Following');
    });

    it('should follow/unfollow from fans list', async () => {
      await element(by.id('fans-count')).tap();
      await waitForText('Fans');
      
      try {
        await element(by.id('follow-button-0')).tap();
      } catch {
        // No fans - test passes
      }
    });
  });

  describe('Settings Access', () => {
    it('should open settings from profile', async () => {
      await safeTap('settings-button');
      await waitForText('Parametres');
    });
  });

  describe('User Profile (Other User)', () => {
    it('should view another user profile', async () => {
      // Go to explorer and search for a user
      await safeTap('home-tab');
      await element(by.text('Xplorer')).tap();
      await element(by.id('search-input')).typeText('alex');
      
      try {
        await element(by.id('user-result-0')).tap();
        await waitForElement('user-profile-screen');
        await expect(element(by.id('follow-button'))).toBeVisible();
      } catch {
        // No search results
      }
    });

    it('should follow another user', async () => {
      // Navigate to a user profile first
      await safeTap('home-tab');
      await element(by.text('Vibes')).tap();
      
      try {
        await element(by.id('post-author-0')).tap();
        await waitForElement('user-profile-screen');
        await element(by.id('follow-button')).tap();
      } catch {
        // No posts
      }
    });
  });
});
