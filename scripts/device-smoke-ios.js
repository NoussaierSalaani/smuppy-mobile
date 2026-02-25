#!/usr/bin/env node

const { remote } = require('webdriverio');
const fs = require('node:fs/promises');

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

async function exists(driver, selector, timeout = 0) {
  try {
    const el = await driver.$(selector);
    if (timeout > 0) {
      await el.waitForExist({ timeout });
      return true;
    }
    return await el.isExisting();
  } catch {
    return false;
  }
}

async function tapIfExists(driver, selector, timeout = 3000) {
  try {
    const el = await driver.$(selector);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch {
    return false;
  }
}

async function tapFirstExisting(driver, selectors, timeout = 3000) {
  for (const selector of selectors) {
    if (await tapIfExists(driver, selector, timeout)) return selector;
  }
  return null;
}

async function typeIfExists(driver, selector, value, timeout = 6000) {
  try {
    const el = await driver.$(selector);
    await el.waitForExist({ timeout });
    await el.click();
    await el.setValue(value);
    return true;
  } catch {
    return false;
  }
}

async function typeFirstExisting(driver, selectors, value, timeout = 6000) {
  for (const selector of selectors) {
    if (await typeIfExists(driver, selector, value, timeout)) return selector;
  }
  return null;
}

async function anyExists(driver, selectors, timeout = 0) {
  for (const selector of selectors) {
    if (await exists(driver, selector, timeout)) return true;
  }
  return false;
}

async function firstExisting(driver, selectors, timeout = 0) {
  for (const selector of selectors) {
    if (await exists(driver, selector, timeout)) return selector;
  }
  return null;
}

async function recoverToMainSurface(driver) {
  const MAIN_SELECTORS = [
    '~profile-tab',
    '~home-tab',
    '~Post content',
    '~Like this post',
    '~Share this post',
    '~Posts',
    '~Peaks',
    '~Activities',
    '~Collections',
    '~settings-button',
    '~Settings',
  ];

  const BACK_SELECTORS = [
    '~Back',
    '~Go back',
    '~go-back-button',
    '~back-button',
    '//XCUIElementTypeButton[@name="Back"]',
    '//XCUIElementTypeButton[@name="Done"]',
    '//XCUIElementTypeButton[@name="Close"]',
    '~Go home',
  ];

  for (let i = 0; i < 8; i += 1) {
    if (await anyExists(driver, MAIN_SELECTORS, 300)) return true;
    const backSelector = await firstExisting(driver, BACK_SELECTORS, 500);
    if (backSelector) {
      await tapIfExists(driver, backSelector, 1000);
    } else {
      try {
        await driver.back();
      } catch {
        // ignore and continue recovery loop
      }
    }
    await driver.pause(500);
  }

  return anyExists(driver, MAIN_SELECTORS, 500);
}

async function logoutIfNeeded(driver) {
  const onAuthScreen =
    (await exists(driver, '~submit-login-button')) ||
    (await exists(driver, '~login-screen')) ||
    (await exists(driver, '~social-apple-button')) ||
    (await exists(driver, '//*[@name="Se connecter"]')) ||
    (await exists(driver, '//*[@name="Login"]'));
  if (onAuthScreen) return;

  // If on welcome, open login form
  if (await exists(driver, '~login-button')) {
    await tapIfExists(driver, '~login-button', 4000);
    return;
  }

  // Best-effort logout from main app
  await tapIfExists(driver, '~profile-tab', 4000);
  await tapIfExists(driver, '~Profile', 4000);
  await driver.pause(1200);
  await tapIfExists(driver, '~settings-button', 4000);
  await tapIfExists(driver, '~Settings', 4000);
  await driver.pause(1200);

  // Best-effort logout action without long scroll calls (can hang on real devices)
  await tapIfExists(driver, '~Log Out', 1500);
  await tapIfExists(driver, '~Sign Out', 1500);
  await tapIfExists(driver, '~Logout', 1500);

  await tapIfExists(driver, '~Yes, Logout', 2000);
  await tapIfExists(driver, '~login-button', 4000);
}

async function run() {
  const udid = env('IOS_UDID', '00008140-001464213E08801C');
  const bundleId = env('IOS_BUNDLE_ID', 'com.nou09.Smuppy');
  const email = env('TEST_EMAIL');
  const password = env('TEST_PASSWORD');
  const minimalSmoke = env('SMOKE_MINIMAL', '0') === '1';
  const deepSmoke = env('SMOKE_DEEP', '0') === '1';
  const skipLogout = env('SMOKE_SKIP_LOGOUT', '0') === '1';
  const resetAppState = env('SMOKE_RESET_APP', '0') === '1';

  if (!email || !password) {
    throw new Error('Missing TEST_EMAIL or TEST_PASSWORD');
  }

  const appiumUrl = new URL(env('APPIUM_URL', 'http://127.0.0.1:4723'));
  const port = Number.parseInt(appiumUrl.port || '4723', 10);
  const appiumClientLogLevel = env('APPIUM_CLIENT_LOG_LEVEL', 'info');

  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': udid,
    'appium:bundleId': bundleId,
    'appium:noReset': !resetAppState,
    'appium:newCommandTimeout': 240,
    'appium:wdaLaunchTimeout': 120000,
    'appium:wdaConnectionTimeout': 120000,
    'appium:autoAcceptAlerts': true,
  };

  console.log('[device-smoke] starting session', { udid, bundleId });
  console.log('[device-smoke] requesting appium session...');

  const driver = await remote({
    hostname: appiumUrl.hostname,
    port,
    path: appiumUrl.pathname === '/' ? '/' : appiumUrl.pathname,
    logLevel: appiumClientLogLevel,
    connectionRetryCount: 1,
    connectionRetryTimeout: 180000,
    capabilities,
  });
  console.log('[device-smoke] appium session established');

  try {
    await driver.activateApp(bundleId);
    await driver.pause(2000);
    if (!skipLogout) {
      await logoutIfNeeded(driver);
    }

    // Best-effort overlays / welcome
    await tapIfExists(driver, '~Continue');
    await tapIfExists(driver, '~Go home');
    await tapIfExists(driver, '~login-button');
    await tapFirstExisting(driver, [
      '~Login',
      '//*[@name="Login"]',
      '//*[@name="Se connecter"]',
      '//*[@name="Sign in"]',
      '//*[@name="Sign In"]',
    ]);

    // Recover if app resumed on a deep screen without root tabs.
    await recoverToMainSurface(driver);

    // Login form if present
    const emailPresent = !!(await typeFirstExisting(driver, [
      '~email-input',
      '//*[@name="email-input"]',
      '//XCUIElementTypeTextField[contains(@name, "Email")]',
      '//XCUIElementTypeTextField[contains(@label, "Email")]',
      '//XCUIElementTypeTextField[contains(@value, "Email")]',
      '//XCUIElementTypeTextField[contains(@name, "mail")]',
      '//XCUIElementTypeTextField[contains(@label, "mail")]',
      '//XCUIElementTypeTextField[1]',
    ], email));
    const passwordPresent = !!(await typeFirstExisting(driver, [
      '~password-input',
      '//*[@name="password-input"]',
      '//XCUIElementTypeSecureTextField[contains(@name, "Password")]',
      '//XCUIElementTypeSecureTextField[contains(@label, "Password")]',
      '//XCUIElementTypeSecureTextField[contains(@name, "Mot")]',
      '//XCUIElementTypeSecureTextField[contains(@label, "Mot")]',
      '//XCUIElementTypeSecureTextField[1]',
    ], password));
    if (emailPresent || passwordPresent) {
      await tapFirstExisting(driver, [
        '~submit-login-button',
        '//*[@name="submit-login-button"]',
        '//*[@name="Login"]',
        '//*[@name="Se connecter"]',
        '//*[@name="Sign In"]',
        '//*[@name="Sign in"]',
      ], 12000);
    }

    const MAIN_SELECTORS = [
      '~profile-tab',
      '~home-tab',
      '~Post content',
      '~Like this post',
      '~Share this post',
      '~Posts',
      '~Peaks',
      '~Activities',
      '~Collections',
      '~settings-button',
      '~Settings',
    ];
    const ONBOARDING_SELECTORS = ['~AccountType', '~TellUsAboutYou', '~Guidelines'];
    const AUTH_SELECTORS = [
      '~login-screen',
      '~submit-login-button',
      '~social-apple-button',
      '~email-input',
      '//*[@name="Se connecter"]',
      '//*[@name="Login"]',
      '//XCUIElementTypeSecureTextField[1]',
    ];

    // Detect resulting app state
    let state = 'unknown';
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (await anyExists(driver, MAIN_SELECTORS)) {
        state = 'main';
        break;
      }
      if (await anyExists(driver, ONBOARDING_SELECTORS)) {
        state = 'onboarding';
        break;
      }
      if (await anyExists(driver, AUTH_SELECTORS)) {
        state = 'auth';
      }
      await driver.pause(800);
    }

    if (state !== 'main') {
      try {
      await driver.saveScreenshot('/tmp/device-smoke-fail.png');
      } catch {
        // ignore screenshot failure
      }
      const pageSource = await driver.getPageSource();
      const dumpPath = '/tmp/device-smoke-page.xml';
      await fs.writeFile(dumpPath, pageSource, 'utf8');
      throw new Error(`[device-smoke] post-login state=${state}. Dumps: ${dumpPath}, /tmp/device-smoke-fail.png`);
    }

    console.log('[device-smoke] login/main OK');

    if (!minimalSmoke) {
      // Best-effort interaction check for key post actions.
      if (await tapIfExists(driver, '~Post content', 4000)) {
        await driver.pause(800);
        await tapIfExists(driver, '~Like this post', 2000);
        const openedShare = await tapIfExists(driver, '~Share this post', 2000);
        if (openedShare) {
          await tapIfExists(driver, '~Cancel', 1200);
          await tapIfExists(driver, '~Close', 1200);
          try {
            await driver.back();
          } catch {
            // ignore
          }
        }
      }

      // Basic navigation checks
      await tapIfExists(driver, '~peaks-tab', 6000);
      await driver.pause(1500);
      await tapIfExists(driver, '~home-tab', 6000);
      await driver.pause(1000);
      await tapIfExists(driver, '~profile-tab', 6000);
      await driver.pause(1000);
      await tapIfExists(driver, '~home-tab', 6000);

      console.log('[device-smoke] tab navigation OK');
    }

    if (deepSmoke) {
      // Header flows
      const openedSearch = await tapIfExists(driver, '~search-button', 2000) || await tapIfExists(driver, '~Search', 2000);
      if (openedSearch) {
        await typeIfExists(driver, '//XCUIElementTypeTextField[1]', 'fitness', 2500);
        await driver.pause(900);
        try { await driver.back(); } catch { /* ignore */ }
      }

      const openedNotifications = await tapIfExists(driver, '~notifications-button', 2000) || await tapIfExists(driver, '~Notifications', 2000);
      if (openedNotifications) {
        await driver.pause(900);
        try { await driver.back(); } catch { /* ignore */ }
      }

      // Messages flow
      await tapIfExists(driver, '~messages-tab', 4000);
      await driver.pause(1000);
      await typeIfExists(driver, '//XCUIElementTypeTextField[1]', 'test', 2000);
      try { await driver.back(); } catch { /* ignore */ }

      // Settings entry and key sections reachability
      await tapIfExists(driver, '~profile-tab', 4000);
      const openedSettings = await tapIfExists(driver, '~settings-button', 3000) || await tapIfExists(driver, '~Settings', 3000);
      if (openedSettings) {
        const settingLabels = [
          'Edit Profile',
          'Change Password',
          'Notifications',
          'Follow Requests',
          'Blocked Users',
          'Muted Users',
          'Report a Problem',
          'Export My Data',
          'Terms of Service',
        ];

        for (const label of settingLabels) {
          const openedItem = await tapIfExists(driver, `~${label}`, 1200) || await tapIfExists(driver, `//*[@name="${label}"]`, 1200);
          if (openedItem) {
            await driver.pause(500);
            try { await driver.back(); } catch { /* ignore */ }
            await driver.pause(300);
          }
        }
      }

      console.log('[device-smoke] deep flow checks OK');
    }
  } finally {
    await driver.deleteSession();
    console.log('[device-smoke] session closed');
  }
}

run().catch((err) => {
  console.error('[device-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
