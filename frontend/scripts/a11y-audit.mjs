/**
 * a11y-audit.mjs — Automated accessibility audit using axe-core + Playwright.
 *
 * Runs axe-core against key public and authenticated routes, reporting any
 * WCAG 2.1 AA violations.  Exits with code 1 if critical or serious violations
 * are found.
 *
 * Usage:
 *   npm run test:a11y                     # default (requires dev server on :3000)
 *   BASE_URL=http://localhost:5173 npm run test:a11y
 */

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

// ── Mock user for authenticated routes ──────────────────────────────────────
const MEMBER_USER = {
  id: 'a11y-member-1',
  username: 'A11y Tester',
  email: 'a11y@example.com',
  role: 'member',
  status: 'active',
};

// ── Routes to audit ─────────────────────────────────────────────────────────
const routes = [
  // Public routes
  { name: 'Landing page', path: '/', auth: false },
  { name: 'Join page', path: '/join', auth: false },
  { name: 'Login page', path: '/login', auth: false },

  // Authenticated routes
  { name: 'Member Hub', path: '/hub', auth: true },
  { name: 'Threat Map', path: '/hub/threat-map', auth: true },
  { name: 'Roster', path: '/roster', auth: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stub every /api/* request so pages don't need a running backend. */
async function stubApis(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/favicon.ico') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.pathname.includes('/me') ? MEMBER_USER : { data: [], items: [], results: [] },
        ),
      });
      return;
    }

    if (url.hostname === 'api.mapbox.com') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
      });
      return;
    }

    await route.continue();
  });
}

/** Inject auth tokens into localStorage so protected routes render. */
async function injectAuth(page, user) {
  await page.addInitScript((u) => {
    localStorage.setItem('token', 'fake-jwt-for-a11y');
    localStorage.setItem('user', JSON.stringify(u));
  }, user);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const route of routes) {
    const context = await browser.newContext();
    const page = await context.newPage();

    await stubApis(page);

    if (route.auth) {
      await injectAuth(page, MEMBER_USER);
    }

    try {
      await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });

      // Give React a moment to render
      await page.waitForTimeout(2000);

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
        .analyze();

      const violations = axeResults.violations;
      const critical = violations.filter((v) => v.impact === 'critical');
      const serious = violations.filter((v) => v.impact === 'serious');
      const moderate = violations.filter((v) => v.impact === 'moderate');
      const minor = violations.filter((v) => v.impact === 'minor');

      results.push({
        name: route.name,
        path: route.path,
        total: violations.length,
        critical: critical.length,
        serious: serious.length,
        moderate: moderate.length,
        minor: minor.length,
        violations,
      });
    } catch (err) {
      results.push({
        name: route.name,
        path: route.path,
        error: err.message,
        total: -1,
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        violations: [],
      });
    } finally {
      await context.close();
    }
  }

  await browser.close();

  // ── Report ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ACCESSIBILITY AUDIT REPORT (axe-core / WCAG 2.1 AA)');
  console.log('══════════════════════════════════════════════════════════\n');

  let hasFailures = false;

  for (const r of results) {
    const icon = r.error ? '⚠️' : r.critical + r.serious > 0 ? '❌' : r.total > 0 ? '⚠️' : '✅';

    console.log(`${icon}  ${r.name} (${r.path})`);

    if (r.error) {
      console.log(`     Error: ${r.error}`);
      continue;
    }

    if (r.total === 0) {
      console.log('     No violations found.');
      continue;
    }

    console.log(
      `     ${r.critical} critical · ${r.serious} serious · ${r.moderate} moderate · ${r.minor} minor`,
    );

    if (r.critical + r.serious > 0) hasFailures = true;

    // Print details for critical/serious only
    for (const v of r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')) {
      console.log(`\n     [${v.impact.toUpperCase()}] ${v.id}: ${v.description}`);
      console.log(`     Help: ${v.helpUrl}`);
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`       → ${node.html.substring(0, 120)}`);
      }
      if (v.nodes.length > 3) {
        console.log(`       … and ${v.nodes.length - 3} more`);
      }
    }

    console.log('');
  }

  console.log('──────────────────────────────────────────────────────────');

  if (hasFailures) {
    console.log('RESULT: FAIL — critical or serious violations detected.\n');
    process.exit(1);
  } else {
    console.log('RESULT: PASS — no critical or serious violations.\n');
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
