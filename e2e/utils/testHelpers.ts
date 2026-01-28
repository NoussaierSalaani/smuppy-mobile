/**
 * Smuppy E2E Test Helpers
 * Reusable utilities for Detox tests
 */

import { device, element, by, waitFor } from 'detox';

// Test credentials
export const TEST_CREDENTIALS = {
  email: 'e2e-test@smuppy.com',
  password: 'Test123!@#',
  username: 'e2e_test_user'
};

// Timeouts
export const TIMEOUTS = {
  short: 5000,
  medium: 10000,
  long: 30000,
  animation: 1000
};

// Wait for element with custom timeout
export async function waitForElement(
  testID: string,
  timeout: number = TIMEOUTS.medium
) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

// Wait for text to appear
export async function waitForText(
  text: string,
  timeout: number = TIMEOUTS.medium
) {
  await waitFor(element(by.text(text)))
    .toBeVisible()
    .withTimeout(timeout);
}

// Safe tap - waits for element then taps
export async function safeTap(testID: string) {
  await waitForElement(testID);
  await element(by.id(testID)).tap();
}

// Safe tap on text
export async function safeTapText(text: string) {
  await waitForText(text);
  await element(by.text(text)).tap();
}

// Type text in input
export async function typeInInput(testID: string, text: string) {
  await waitForElement(testID);
  await element(by.id(testID)).clearText();
  await element(by.id(testID)).typeText(text);
}

// Login helper
export async function login(
  email: string = TEST_CREDENTIALS.email,
  password: string = TEST_CREDENTIALS.password
) {
  await safeTapText('Se connecter');
  await typeInInput('email-input', email);
  await safeTap('continue-button');
  await typeInInput('password-input', password);
  await safeTap('login-button');
  await waitForText('Fan', TIMEOUTS.long);
}

// Logout helper
export async function logout() {
  await safeTap('profile-tab');
  await safeTap('settings-button');
  await element(by.id('settings-scroll')).scrollTo('bottom');
  await safeTapText('Deconnexion');
  await safeTapText('Confirmer');
}

// Navigate to tab
export async function navigateToTab(tabName: 'home' | 'search' | 'create' | 'peaks' | 'profile') {
  await safeTap(tabName + '-tab');
}

// Take screenshot for debugging
export async function takeScreenshot(name: string) {
  await device.takeScreenshot(name);
}

// Clear app state
export async function clearAppState() {
  await device.clearKeychain();
  await device.launchApp({ delete: true });
}
