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

async function anyExists(driver, selectors, timeout = 0) {
  for (const selector of selectors) {
    if (await exists(driver, selector, timeout)) return true;
  }
  return false;
}

async function logoutIfNeeded(driver) {
  const onAuthScreen =
    (await exists(driver, '~submit-login-button')) ||
    (await exists(driver, '~login-screen')) ||
    (await exists(driver, '~social-apple-button'));
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
  const skipLogout = env('SMOKE_SKIP_LOGOUT', '0') === '1';

  if (!email || !password) {
    throw new Error('Missing TEST_EMAIL or TEST_PASSWORD');
  }

  const appiumUrl = new URL(env('APPIUM_URL', 'http://127.0.0.1:4723'));
  const port = Number.parseInt(appiumUrl.port || '4723', 10);

  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': udid,
    'appium:bundleId': bundleId,
    'appium:noReset': true,
    'appium:newCommandTimeout': 240,
    'appium:wdaLaunchTimeout': 120000,
    'appium:wdaConnectionTimeout': 120000,
    'appium:autoAcceptAlerts': true,
  };

  console.log('[device-smoke] starting session', { udid, bundleId });

  const driver = await remote({
    hostname: appiumUrl.hostname,
    port,
    path: appiumUrl.pathname === '/' ? '/' : appiumUrl.pathname,
    logLevel: 'error',
    capabilities,
  });

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
    await tapIfExists(driver, '~Login');

    // Login form if present
    const emailPresent = await typeIfExists(driver, '~email-input', email);
    const passwordPresent = await typeIfExists(driver, '~password-input', password);
    if (emailPresent || passwordPresent) {
      await tapIfExists(driver, '~submit-login-button', 12000);
    }

    const MAIN_SELECTORS = [
      '~profile-tab',
      '~home-tab',
      '~Post content',
      '~Like this post',
      '~Share this post',
    ];
    const ONBOARDING_SELECTORS = ['~AccountType', '~TellUsAboutYou', '~Guidelines'];
    const AUTH_SELECTORS = ['~login-screen', '~submit-login-button', '~social-apple-button', '~email-input'];

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
  } finally {
    await driver.deleteSession();
    console.log('[device-smoke] session closed');
  }
}

run().catch((err) => {
  console.error('[device-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
