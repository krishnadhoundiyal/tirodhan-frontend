import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const [product, image] = process.argv.slice(2);
assert(
  ['customer', 'operations'].includes(product) && image,
  'Expected product and local image tag',
);
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();
const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deepLink =
  product === 'customer' ? '/account/collections/' + uuid : '/routes/' + uuid;

async function smoke(env, verify) {
  const id = docker(
    'run',
    '--detach',
    '--rm',
    '--read-only',
    '--publish',
    '127.0.0.1::8080',
    ...Object.entries(env).flatMap(([name, value]) => [
      '--env',
      name + '=' + value,
    ]),
    image,
  );
  try {
    const url = 'http://' + docker('port', id, '8080/tcp');
    const get = (path, init = {}) =>
      fetch(url + path, { signal: AbortSignal.timeout(3000), ...init });
    let health;
    for (let n = 0; n < 30 && !health?.ok; n++) {
      health = await get('/health').catch(() => null);
      if (!health?.ok) await setTimeout(250);
    }
    assert.equal(health?.status, 200);
    assert.equal(await health.text(), 'ok');
    await verify(get);
  } finally {
    docker('stop', '--time', '3', id);
  }
}

assert.equal(
  docker('image', 'inspect', '--format', '{{.Config.User}}', image),
  'node',
);
await smoke({}, async (get) => {
  const config = await get('/web-session-config.json');
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.equal(await config.json(), null);
  const home = await get('/');
  const homeHtml = await home.text();
  assert.equal(home.status, 200);
  if (product === 'customer') assert.match(homeHtml, /<h1>/);
  const deep = await get(deepLink);
  assert.equal(deep.status, 200);
  assert.equal(deep.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(deep.headers.get('cache-control'), 'no-store');
  const html = await deep.text();
  assert(!html.includes(uuid));
  const [, script] = html.match(/<script[^>]+src="([^"]+\.js)"/) ?? [];
  assert(script, 'Entry has a compiled script');
  const asset = await get(script);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  const assetBody = await asset.text();
  for (const marker of [
    'CUSTOMER_WEB_FIXTURE_ONLY_7f951c',
    'FIXTURE_SCENARIO_MARKER_OW_P0_01',
  ])
    assert(!assetBody.includes(marker));
  assert.equal((await get(deepLink, { method: 'HEAD' })).status, 200);
  assert.equal((await get('/assets/missing.js')).status, 404);
  const unknown = await get('/unrecognized-page');
  assert.equal(unknown.status, 404);
  if (product === 'customer') assert.match(await unknown.text(), /<h1>/);
});

const env = {
  WEB_AUTH_ENABLED: 'true',
  WEB_ENVIRONMENT: 'nonprod',
  WEB_AUTH_POC_REFERENCE: 'synthetic-only',
  WEB_AUTH_BROWSER_ORIGIN: 'https://' + product + '.smoke.invalid',
  WEB_AUTH_GATEWAY_ORIGIN: 'https://api.smoke.invalid',
  WEB_AUTH_START_PATH: '/web/start',
  WEB_AUTH_VERIFY_PATH: '/web/verify',
  WEB_AUTH_REFRESH_PATH: '/web/refresh',
  WEB_AUTH_LOGOUT_PATH: '/web/logout',
  WEB_AUTH_CSRF_HEADER: 'X-Smoke-Session',
  WEB_AUTH_CSRF_VALUE: '1',
  TIRODHAN_GATEWAY_SECRET: 'synthetic-excluded-value',
};
await smoke(env, async (get) => {
  const config = await get('/web-session-config.json');
  assert.deepEqual(await config.json(), {
    approved: true,
    approvalReference: 'synthetic-only',
    environment: 'nonprod',
    product,
    browserOrigin: env.WEB_AUTH_BROWSER_ORIGIN,
    gatewayOrigin: env.WEB_AUTH_GATEWAY_ORIGIN,
    routes: {
      start: '/web/start',
      verify: '/web/verify',
      refresh: '/web/refresh',
      logout: '/web/logout',
    },
    csrf: { header: 'X-Smoke-Session', value: '1' },
  });
});
await smoke({ ...env, WEB_ENVIRONMENT: 'prod' }, async (get) => {
  assert.equal(await (await get('/web-session-config.json')).json(), null);
});
console.log(
  product +
    ' image passed loopback health, routing, isolation and runtime-configuration smoke checks.',
);
