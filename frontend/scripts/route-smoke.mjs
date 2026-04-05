import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const HOST = new URL(BASE_URL).host;
const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlJawAAAABJRU5ErkJggg==';

const STAFF_ADMIN = {
  id: 'admin-1',
  username: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
};

const STAFF_S1 = {
  id: 's1-1',
  username: 'S1 User',
  email: 's1@example.com',
  role: 's1_personnel',
  status: 'active',
};

const STAFF_S4 = {
  id: 's4-1',
  username: 'S4 User',
  email: 's4@example.com',
  role: 's4_logistics',
  status: 'active',
};

const MEMBER = {
  id: 'member-1',
  username: 'Member User',
  email: 'member@example.com',
  role: 'member',
  status: 'active',
};

const RECRUIT = {
  id: 'recruit-1',
  username: 'Recruit User',
  email: 'recruit@example.com',
  role: 'member',
  status: 'recruit',
};

const serverStub = {
  id: 'server-1',
  name: 'Dev Server',
  status: 'running',
  docker_image: 'ghcr.io/acemod/arma-reforger:latest',
  container_name: 'dev-server',
  provisioning_stages: {},
  provisioning_warnings: [],
  needs_manual_intervention: false,
  summary_message: null,
  last_docker_error: null,
  is_active: true,
  ports: { game: 2001, query: 17777, rcon: 19999 },
};

const stageStats = {
  applicant: 0,
  accepted_recruit: 0,
  bct_in_progress: 0,
  probationary: 0,
  active_member: 0,
  rejected: 0,
  dropped: 0,
  archived: 0,
};

const scenarios = [
  {
    name: 'legacy join-us redirect',
    path: '/join-us',
    expectedPath: '/join',
  },
  {
    name: 'unauthenticated admin redirects to login',
    path: '/admin',
    expectedPath: '/login',
  },
  {
    name: 'member login redirects to hub',
    path: '/login',
    expectedPath: '/hub',
    user: MEMBER,
    waitMs: 5000,
  },
  {
    name: 'staff login redirects to command center',
    path: '/login',
    expectedPath: '/admin/servers',
    user: STAFF_ADMIN,
    waitMs: 5000,
  },
  {
    name: 'logistics login redirects to server dashboard',
    path: '/login',
    expectedPath: '/admin/servers',
    user: STAFF_S4,
    waitMs: 5000,
  },
  {
    name: 'recruit hub redirects to recruit dashboard',
    path: '/hub',
    expectedPath: '/recruit',
    user: RECRUIT,
  },
  {
    name: 'legacy ORBAT route redirects to operations planner',
    path: '/hub/orbat-mapper',
    expectedPath: '/hub/operations-planner',
    user: MEMBER,
  },
  {
    name: 'legacy ORBAT operation route preserves operation id',
    path: '/hub/orbat-mapper/op-123',
    expectedPath: '/hub/operations-planner/op-123',
    user: MEMBER,
  },
  {
    name: 'legacy world monitor route redirects correctly',
    path: '/hub/threat-map/world-monitor',
    expectedPath: '/worldmonitor',
    user: MEMBER,
    waitUntil: 'domcontentloaded',
    ignoreErrors: [
      '[Markets] Finnhub fetch failed',
      '[Polymarket] Failed',
      '[PizzINT] Failed',
      '[USGS Earthquakes] Failed',
      '[Cloudflare Outages] Failed',
    ],
  },
  {
    name: 'legacy partner world monitor route redirects correctly',
    path: '/partner/threat-map/world-monitor',
    expectedPath: '/worldmonitor',
    waitUntil: 'domcontentloaded',
    ignoreErrors: [
      '[Markets] Finnhub fetch failed',
      '[Polymarket] Failed',
      '[PizzINT] Failed',
      '[USGS Earthquakes] Failed',
      '[Cloudflare Outages] Failed',
    ],
  },
  {
    name: 'legacy server diagnostics route redirects correctly',
    path: '/admin/servers/mod-issues',
    expectedPath: '/admin/servers/diagnostics',
    user: STAFF_S1,
  },
  {
    name: 'legacy log monitor route redirects correctly',
    path: '/admin/servers/log-monitor',
    expectedPath: '/admin/servers/diagnostics',
    user: STAFF_S1,
  },
  {
    name: 'server overview route redirects to workspace',
    path: '/admin/servers/server-1/overview',
    expectedPath: '/admin/servers/server-1',
    user: STAFF_S1,
  },
  {
    name: 'legacy reforger maps route redirects to operations planner',
    path: '/hub/reforger-maps',
    expectedPath: '/hub/operations-planner',
    user: MEMBER,
  },
  {
    name: 'legacy mortar calc route redirects to operations planner',
    path: '/hub/mortar-calc',
    expectedPath: '/hub/operations-planner',
    user: MEMBER,
  },
  {
    name: 'member cannot access personnel users page',
    path: '/admin/users',
    expectedPath: '/',
    user: MEMBER,
  },
  {
    name: 'recruit is redirected away from member hub routes',
    path: '/hub/training',
    expectedPath: '/recruit',
    user: RECRUIT,
  },
  {
    name: 'personnel users page renders',
    path: '/admin/users',
    expectedPath: '/admin/users',
    user: STAFF_S1,
    selector: '[data-testid="users-manager-title"]',
  },
  {
    name: 'personnel recruitment page renders',
    path: '/admin/recruitment',
    expectedPath: '/admin/recruitment',
    user: STAFF_S1,
    selector: '[data-testid="recruitment-title"]',
  },
  {
    name: 'personnel pipeline page renders',
    path: '/admin/pipeline',
    expectedPath: '/admin/pipeline',
    user: STAFF_S1,
    heading: 'RECRUIT PIPELINE',
  },
  {
    name: 'operations manager page renders',
    path: '/admin/operations',
    expectedPath: '/admin/operations',
    user: STAFF_ADMIN,
    text: 'OPERATIONS MANAGEMENT',
  },
];

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function pngResponse() {
  return {
    status: 200,
    contentType: 'image/png',
    body: Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'),
  };
}

function handleApiRequest(pathname, scenario) {
  if (pathname === '/api/auth/me') {
    if (!scenario.user) return jsonResponse({ detail: 'Unauthorized' }, 401);
    return jsonResponse(scenario.user);
  }

  if (pathname === '/api/auth/discord') {
    return jsonResponse({ url: 'https://discord.example.test/oauth' });
  }

  if (pathname === '/api/site-content') return jsonResponse({});
  if (pathname === '/api/unit-history') return jsonResponse([]);
  if (pathname === '/api/operations') return jsonResponse([]);
  if (pathname === '/api/operations-plans') return jsonResponse([]);
  if (pathname === '/api/announcements') return jsonResponse([]);
  if (pathname === '/api/discussions') return jsonResponse([]);
  if (pathname === '/api/gallery') return jsonResponse([]);
  if (pathname === '/api/training') return jsonResponse([]);
  if (pathname === '/api/intel') return jsonResponse([]);
  if (pathname === '/api/campaigns') return jsonResponse([]);
  if (pathname === '/api/community-events') return jsonResponse([]);
  if (pathname === '/api/my-schedule') return jsonResponse([]);
  if (pathname === '/api/soldier-of-the-month') return jsonResponse(null);
  if (pathname === '/api/search') return jsonResponse({ operations: [], discussions: [] });
  if (pathname === '/api/recruitment/billets') return jsonResponse([]);
  if (pathname === '/api/public/threat-map') return jsonResponse({ markers: [] });
  if (pathname === '/api/uploads/25th_id_patch.png') return pngResponse();
  if (pathname.startsWith('/api/uploads/')) return pngResponse();

  if (pathname === '/api/admin/users') {
    return jsonResponse([
      {
        id: 'member-1',
        username: 'Alpha',
        email: 'alpha@example.com',
        status: 'active',
        role: 'member',
        rank: 'PFC',
      },
    ]);
  }

  if (pathname.startsWith('/api/admin/users/')) {
    return jsonResponse({
      id: 'member-1',
      username: 'Alpha',
      email: 'alpha@example.com',
      status: 'active',
      role: 'member',
    });
  }

  if (pathname === '/api/admin/recruitment/stats') {
    return jsonResponse({
      open_billets: 0,
      pending: 0,
      reviewing: 0,
      accepted: 0,
      total_applications: 0,
    });
  }

  if (pathname === '/api/admin/recruitment/billets') return jsonResponse([]);
  if (pathname === '/api/admin/recruitment/applications') return jsonResponse([]);
  if (pathname === '/api/unit-tags') return jsonResponse({ companies: [], platoons: [] });
  if (pathname === '/api/admin/pipeline/stats') return jsonResponse(stageStats);
  if (pathname === '/api/admin/pipeline') return jsonResponse([]);

  if (/^\/api\/admin\/pipeline\/[^/]+$/.test(pathname)) {
    return jsonResponse({
      username: 'Recruit User',
      pipeline_stage: 'applicant',
      pipeline_history: [],
    });
  }

  if (pathname === '/api/map/deployments/active-deployed') return jsonResponse([]);

  if (/^\/api\/operations\/[^/]+\/roster$/.test(pathname)) {
    return jsonResponse({
      rsvps: { attending: [], tentative: [], waitlisted: [] },
      counts: { attending: 0, tentative: 0, waitlisted: 0, total: 0 },
      mos_summary: {},
    });
  }

  if (pathname === '/api/admin/map/deployments') return jsonResponse([]);
  if (pathname === '/api/map/location-entities') return jsonResponse([]);
  if (pathname === '/api/map/nato-markers') return jsonResponse([]);
  if (pathname === '/api/map/nato-reference') return jsonResponse({});
  if (pathname === '/api/map/division-location') {
    return jsonResponse({
      current_location_name: 'Schofield Barracks, HI',
      current_latitude: 21.495052920207087,
      current_longitude: -158.06280285176283,
    });
  }

  if (pathname === '/api/servers/server-1' || pathname === '/api/servers/server-1/summary') {
    return jsonResponse(serverStub);
  }

  if (pathname === '/api/servers') return jsonResponse([serverStub]);
  if (/^\/api\/servers\/server-1\/(incidents|metrics|metrics\/summary|notifications|watchers|detections|notes|schedules|config|config\/history|files\/roots|rcon\/status)$/.test(pathname)) {
    return jsonResponse([]);
  }

  return jsonResponse({ ok: true, path: pathname });
}

function normalizeConsoleEntry(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(HOST, '<host>')
    .trim();
}

function shouldIgnoreConsoleMessage(text) {
  return [
    'Download the React DevTools',
    'favicon.ico',
    'An empty string ("") was passed to the src attribute',
    'Failed to load resource: the server responded with a status of 401 (Unauthorized)',
  ].some((needle) => text.includes(needle));
}

function shouldIgnoreError(text, scenario) {
  if (shouldIgnoreConsoleMessage(text)) return true;
  return (scenario.ignoreErrors || []).some((needle) => text.includes(needle));
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = normalizeConsoleEntry(msg.text());
    if (shouldIgnoreError(text, scenario)) return;
    consoleErrors.push(text);
  });

  page.on('pageerror', (error) => {
    const text = normalizeConsoleEntry(error.message || String(error));
    if (shouldIgnoreError(text, scenario)) return;
    pageErrors.push(text);
  });

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/favicon.ico') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await route.fulfill(handleApiRequest(url.pathname, scenario));
      return;
    }

    if (url.hostname === 'api.mapbox.com') {
      await route.fulfill(jsonResponse({ type: 'FeatureCollection', features: [] }));
      return;
    }

    await route.continue();
  });

  try {
    await page.goto(`${BASE_URL}${scenario.path}`, {
      waitUntil: scenario.waitUntil || 'networkidle',
    });
    await page.waitForFunction(
      (expected) => window.location.pathname === expected,
      scenario.expectedPath,
      { timeout: scenario.waitMs || 10000 },
    );

    if (scenario.selector) {
      await page.waitForSelector(scenario.selector, { timeout: 5000 });
    }

    if (scenario.text) {
      await page.getByText(scenario.text, { exact: false }).waitFor({ timeout: 5000 });
    }

    if (scenario.heading) {
      await page.getByRole('heading', { name: scenario.heading, exact: false }).waitFor({
        timeout: 5000,
      });
    }

    await page.waitForTimeout(500);

    return {
      name: scenario.name,
      status: 'passed',
      finalPath: new URL(page.url()).pathname,
      consoleErrors,
      pageErrors,
    };
  } catch (error) {
    return {
      name: scenario.name,
      status: 'failed',
      finalPath: new URL(page.url()).pathname,
      error: normalizeConsoleEntry(error.message || String(error)),
      consoleErrors,
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const results = [];

    for (const scenario of scenarios) {
      results.push(await runScenario(browser, scenario));
    }

    const failures = results.filter((result) => result.status === 'failed');

    for (const result of results) {
      console.log(`\n[${result.status.toUpperCase()}] ${result.name}`);
      console.log(`  final path: ${result.finalPath}`);
      if (result.error) console.log(`  error: ${result.error}`);
      if (result.consoleErrors.length) {
        console.log('  console errors:');
        result.consoleErrors.forEach((entry) => console.log(`    - ${entry}`));
      }
      if (result.pageErrors.length) {
        console.log('  page errors:');
        result.pageErrors.forEach((entry) => console.log(`    - ${entry}`));
      }
    }

    if (failures.length) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
