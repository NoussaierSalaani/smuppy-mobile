/**
 * Auth Flow E2E Tests
 * Tests signup, login, logout, and password reset
 */

import { device, element, by, expect, waitFor } from 'detox';
import { 
  TEST_CREDENTIALS, 
  TIMEOUTS, 
  waitForText, 
  safeTap, 
  safeTapText,
  typeInInput,
  clearAppState 
} from '../utils/testHelpers';

describe('Authentication', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe('Welcome Screen', () => {
    it('should show welcome screen on fresh start', async () => {
      await clearAppState();
      await waitForText('Bienvenue');
      await expect(element(by.text('Creer un compte'))).toBeVisible();
      await expect(element(by.text('Se connecter'))).toBeVisible();
    });
  });

  describe('Signup Flow', () => {
    beforeEach(async () => {
      await clearAppState();
    });

    it('should navigate through account type selection', async () => {
      await safeTapText('Creer un compte');
      await waitForText('Type de compte');
      
      // Check all account types are visible
      await expect(element(by.text('Personnel'))).toBeVisible();
      await expect(element(by.text('Pro Creator'))).toBeVisible();
      await expect(element(by.text('Pro Business'))).toBeVisible();
    });

    it('should complete personal account signup flow', async () => {
      await safeTapText('Creer un compte');
      
      // Account type
      await safeTapText('Personnel');
      await safeTap('continue-button');
      
      // Personal info
      await waitForText('Informations');
      await typeInInput('name-input', 'Test User');
      await safeTapText('Homme');
      await safeTap('continue-button');
      
      // Interests
      await waitForText('Interets');
      await safeTapText('Fitness');
      await safeTapText('Yoga');
      await safeTap('continue-button');
      
      // Profile setup
      await waitForText('Profil');
      await typeInInput('username-input', 'testuser_' + Date.now());
      await safeTap('continue-button');
      
      // Email/Password
      await waitForText('Email');
      await typeInInput('email-input', 'test' + Date.now() + '@smuppy.com');
      await typeInInput('password-input', TEST_CREDENTIALS.password);
      await safeTap('signup-button');
      
      // Should show verification screen
      await waitForText('Verifier', TIMEOUTS.long);
    });
  });

  describe('Login Flow', () => {
    beforeEach(async () => {
      await clearAppState();
    });

    it('should login with valid credentials', async () => {
      await safeTapText('Se connecter');
      await typeInInput('email-input', TEST_CREDENTIALS.email);
      await safeTap('continue-button');
      await typeInInput('password-input', TEST_CREDENTIALS.password);
      await safeTap('login-button');
      
      // Should navigate to main feed
      await waitForText('Fan', TIMEOUTS.long);
    });

    it('should show error with invalid credentials', async () => {
      await safeTapText('Se connecter');
      await typeInInput('email-input', 'wrong@email.com');
      await safeTap('continue-button');
      await typeInInput('password-input', 'wrongpassword');
      await safeTap('login-button');
      
      // Should show error
      await waitForText('Erreur', TIMEOUTS.medium);
    });
  });
});
