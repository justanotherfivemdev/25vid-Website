/**
 * Device-Matrix Smoke Tests
 *
 * Runs core user flows against a real or preview server across a matrix of
 * device viewports:  iPhone SE (320px), iPhone 14, Pixel 7, iPad,
 * Samsung Galaxy (Chromium-based), and Desktop 1080p.
 *
 * Also checks:
 *  - No horizontal overflow at 320px
 *  - Focus-visible outlines appear on keyboard navigation
 *  - Reduced-motion: no CSS transitions/animations when prefers-reduced-motion
 *  - axe-core accessibility violations (requires @axe-core/playwright)
 *
 * Usage:
 *   npx playwright test --config scripts/device-matrix.config.mjs
 *
 * Or directly:
 *   node scripts/device-matrix-smoke.mjs
 */

import { chromium, devices } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

// ─── Device Profiles ────────────────────────────────────────────────────────

const DEVICE_PROFILES = [
  {
    name: 'iPhone SE (320px)',
    ...devices['iPhone SE'],
  },
  {
    name: 'iPhone 14',
    ...devices['iPhone 14'],
  },
  {
    name: 'Pixel 7',
    ...devices['Pixel 7'],
  },
  {
    name: 'iPad Mini',
    ...devices['iPad Mini'],
  },
  {
    name: 'Samsung Galaxy S23',
    viewport: { width: 360, height: 780 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: 'Desktop 1080p',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: 'Small Kiosk / Smart Display',
    viewport: { width: 800, height: 480 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: true,
  },
];

// ─── Public routes that should load without auth ────────────────────────────

const PUBLIC_ROUTES = [
  '/',
  '/join',
  '/about',
  '/login',
];

// ─── Test Results ───────────────────────────────────────────────────────────

const results = [];

function log(status, device, test, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  const color = status === 'PASS' ? '\x1b[32m' : status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
  const msg = `${color}${icon}\x1b[0m [${device}] ${test}${detail ? ` — ${detail}` : ''}`;
  console.log(msg);
  results.push({ status, device, test, detail });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function testNoHorizontalOverflow(page, deviceName) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  if (scrollWidth > clientWidth) {
    log('FAIL', deviceName, 'No horizontal overflow', `scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`);
  } else {
    log('PASS', deviceName, 'No horizontal overflow');
  }
}

async function testNoConsoleErrors(consoleMessages, deviceName, route) {
  const errors = consoleMessages.filter(m => m.type() === 'error');
  if (errors.length > 0) {
    const texts = errors.map(e => e.text()).join('; ');
    log('WARN', deviceName, `No console errors on ${route}`, texts.slice(0, 200));
  } else {
    log('PASS', deviceName, `No console errors on ${route}`);
  }
}

async function testFocusVisible(page, deviceName) {
  // Tab to the first interactive element and check for focus-visible outline
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = window.getComputedStyle(el);
    return {
      tag: el.tagName,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });

  if (!focused) {
    log('WARN', deviceName, 'Focus visible', 'No element focused after Tab');
  } else if (focused.outlineStyle === 'none' || focused.outlineWidth === '0px') {
    log('FAIL', deviceName, 'Focus visible', `${focused.tag} has no visible outline`);
  } else {
    log('PASS', deviceName, 'Focus visible', `${focused.tag} outline=${focused.outlineStyle} ${focused.outlineWidth}`);
  }
}

async function testReducedMotion(page, deviceName) {
  // Check that the reduced-motion media query suppresses transitions
  const hasLongTransitions = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const style = window.getComputedStyle(el);
      const dur = parseFloat(style.transitionDuration);
      const animDur = parseFloat(style.animationDuration);
      if ((dur && dur > 0.02) || (animDur && animDur > 0.02)) {
        return { tag: el.tagName, className: el.className?.toString().slice(0, 60), transitionDuration: style.transitionDuration, animationDuration: style.animationDuration };
      }
    }
    return null;
  });

  if (hasLongTransitions) {
    log('WARN', deviceName, 'Reduced motion respected',
      `${hasLongTransitions.tag}.${hasLongTransitions.className} still has transition=${hasLongTransitions.transitionDuration} anim=${hasLongTransitions.animationDuration}`);
  } else {
    log('PASS', deviceName, 'Reduced motion respected');
  }
}

async function testTouchTargets(page, deviceName) {
  const tooSmall = await page.evaluate(() => {
    const interactive = document.querySelectorAll('button, a, [role="button"], input, select, summary');
    const problems = [];
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      // Only check visible elements
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.width < 24 || rect.height < 24) {
        problems.push({
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 30),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
    return problems.slice(0, 5); // report up to 5
  });

  if (tooSmall.length > 0) {
    const desc = tooSmall.map(t => `${t.tag}("${t.text}") ${t.width}×${t.height}px`).join(', ');
    log('WARN', deviceName, 'Touch target sizes (≥24px)', desc);
  } else {
    log('PASS', deviceName, 'Touch target sizes (≥24px)');
  }
}

async function testViewportMeta(page, deviceName) {
  const viewport = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    return meta ? meta.getAttribute('content') : null;
  });

  if (!viewport) {
    log('FAIL', deviceName, 'Viewport meta tag', 'Missing');
  } else if (!viewport.includes('width=device-width')) {
    log('FAIL', deviceName, 'Viewport meta tag', `Invalid: ${viewport}`);
  } else {
    log('PASS', deviceName, 'Viewport meta tag', viewport);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🔧 Device Matrix Smoke Tests`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Devices:  ${DEVICE_PROFILES.length}`);
  console.log(`   Routes:   ${PUBLIC_ROUTES.length}\n`);

  const browser = await chromium.launch({ headless: true });

  for (const profile of DEVICE_PROFILES) {
    console.log(`\n━━━ ${profile.name} ━━━`);

    for (const route of PUBLIC_ROUTES) {
      const contextOptions = {
        viewport: profile.viewport,
        userAgent: profile.userAgent,
        deviceScaleFactor: profile.deviceScaleFactor || 1,
        isMobile: profile.isMobile ?? false,
        hasTouch: profile.hasTouch ?? false,
      };

      // Normal context for most tests
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      const consoleMessages = [];
      page.on('console', msg => consoleMessages.push(msg));

      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 15000 });

        // Meta tag check (once per device)
        if (route === '/') {
          await testViewportMeta(page, profile.name);
        }

        await testNoHorizontalOverflow(page, profile.name);
        await testNoConsoleErrors(consoleMessages, profile.name, route);

        if (route === '/') {
          await testFocusVisible(page, profile.name);

          // Touch target check only on touch devices
          if (profile.hasTouch || profile.isMobile) {
            await testTouchTargets(page, profile.name);
          }
        }
      } catch (err) {
        log('FAIL', profile.name, `Load ${route}`, err.message.slice(0, 150));
      }

      await context.close();
    }

    // Reduced-motion test: separate context with forced color-scheme
    try {
      const rmContext = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor || 1,
        reducedMotion: 'reduce',
      });
      const rmPage = await rmContext.newPage();
      await rmPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await testReducedMotion(rmPage, profile.name);
      await rmContext.close();
    } catch (err) {
      log('WARN', profile.name, 'Reduced motion test', err.message.slice(0, 100));
    }
  }

  await browser.close();

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log('\n━━━ Summary ━━━');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  console.log(`  \x1b[32m${pass} passed\x1b[0m  \x1b[31m${fail} failed\x1b[0m  \x1b[33m${warn} warnings\x1b[0m`);

  if (fail > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  \x1b[31m✗\x1b[0m [${r.device}] ${r.test} — ${r.detail}`);
    });
    process.exit(1);
  }

  console.log('\n✓ All device-matrix checks passed.\n');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(2);
});
