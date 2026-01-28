/**
 * Full App Flow E2E Tests
 * Tests complete user journeys through the app
 */

import { device, element, by, expect, waitFor } from 'detox';
import { 
  TIMEOUTS, 
  waitForText, 
  safeTap,
  safeTapText,
  typeInInput,
  clearAppState,
  takeScreenshot
} from '../utils/testHelpers';

describe('Full User Journey', () => {
  beforeAll(async () => {
    await clearAppState();
  });

  it('Complete new user journey', async () => {
    // Step 1: Welcome Screen
    await waitForText('Bienvenue');
    await takeScreenshot('01-welcome');
    
    // Step 2: Start Signup
    await safeTapText('Creer un compte');
    await waitForText('Type de compte');
    await takeScreenshot('02-account-type');
    
    // Step 3: Select Personal Account
    await safeTapText('Personnel');
    await safeTap('continue-button');
    
    // Step 4: Enter Personal Info
    await waitForText('Informations');
    await typeInInput('name-input', 'E2E Test User');
    await safeTapText('Homme');
    await safeTap('continue-button');
    await takeScreenshot('03-personal-info');
    
    // Step 5: Select Interests
    await waitForText('Interets');
    await safeTapText('Fitness');
    await safeTapText('Yoga');
    await safeTapText('Running');
    await safeTap('continue-button');
    await takeScreenshot('04-interests');
    
    // Step 6: Setup Profile
    await waitForText('Profil');
    const username = 'e2e_user_' + Date.now();
    await typeInInput('username-input', username);
    await safeTap('continue-button');
    await takeScreenshot('05-profile-setup');
    
    // Step 7: Enter Email/Password
    await waitForText('Email');
    const email = 'e2e_' + Date.now() + '@smuppy.com';
    await typeInInput('email-input', email);
    await typeInInput('password-input', 'Test123!@#');
    await takeScreenshot('06-credentials');
    await safeTap('signup-button');
    
    // Step 8: Verify screen appears
    await waitForText('Verifier', TIMEOUTS.long);
    await takeScreenshot('07-verify-code');
    
    console.log('Signup flow completed successfully!');
  });
});

describe('Existing User Journey', () => {
  const TEST_EMAIL = 'e2e-test@smuppy.com';
  const TEST_PASSWORD = 'Test123!@#';

  beforeAll(async () => {
    await device.launchApp({ delete: true });
  });

  it('Complete login and app exploration', async () => {
    // Login
    await waitForText('Bienvenue');
    await safeTapText('Se connecter');
    await typeInInput('email-input', TEST_EMAIL);
    await safeTap('continue-button');
    await typeInInput('password-input', TEST_PASSWORD);
    await safeTap('login-button');
    
    // Wait for main screen
    await waitForText('Fan', TIMEOUTS.long);
    await takeScreenshot('08-logged-in');
    
    // Explore FanFeed
    await element(by.id('fan-feed')).scroll(300, 'down');
    await takeScreenshot('09-fan-feed');
    
    // Switch to Vibes
    await element(by.text('Vibes')).tap();
    await element(by.id('vibes-feed')).scroll(300, 'down');
    await takeScreenshot('10-vibes-feed');
    
    // Switch to Explorer
    await element(by.text('Xplorer')).tap();
    await takeScreenshot('11-explorer');
    
    // Go to Profile
    await safeTap('profile-tab');
    await takeScreenshot('12-profile');
    
    // Open Settings
    await safeTap('settings-button');
    await takeScreenshot('13-settings');
    
    // Go back to feed
    await safeTap('back-button');
    await safeTap('home-tab');
    
    console.log('User journey completed successfully!');
  });
});

describe('Critical Paths', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should handle network errors gracefully', async () => {
    // Simulate offline mode
    await device.setURLBlacklist(['.*api.*']);
    
    await safeTap('profile-tab');
    
    // Should show error or cached content
    await waitFor(element(by.text('Erreur')).or(element(by.id('profile-screen'))))
      .toBeVisible()
      .withTimeout(TIMEOUTS.medium);
    
    // Re-enable network
    await device.setURLBlacklist([]);
  });

  it('should persist login state', async () => {
    // Close and reopen app
    await device.terminateApp();
    await device.launchApp();
    
    // Should still be logged in
    await waitForText('Fan', TIMEOUTS.long);
  });

  it('should handle deep links', async () => {
    await device.openURL({ url: 'smuppy://profile/testuser' });
    await waitForElement('user-profile-screen', TIMEOUTS.medium);
  });
});
