import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { directory, render, validateConfiguration } from './render.mjs';
const disabled = JSON.parse(
  await readFile(resolve(directory, 'configuration.unapproved.json'), 'utf8'),
);
const nonprod = JSON.parse(
  await readFile(
    resolve(directory, 'configuration.nonprod.pending.json'),
    'utf8',
  ),
);
test('exact NONPROD candidate stays pending and accepts the configured inputs in memory only', async () => {
  assert.equal(nonprod.approved, false);
  assert.equal(nonprod.approvalReference, null);
  assert.equal(nonprod.diagnosticsReviewed, false);
  assert.equal(nonprod.effectivePolicyReviewed, false);
  assert.throws(() => validateConfiguration(nonprod));
  assert.equal(nonprod.backendRefreshTtlSeconds, 604800);
  assert.equal(nonprod.cookie.maxAgeSeconds, 604800);
  const xml = await render({
    ...nonprod,
    approved: true,
    approvalReference: 'LOCAL TEST ONLY',
    diagnosticsReviewed: true,
    effectivePolicyReviewed: true,
  });
  for (const item of [
    nonprod.gatewayOrigin,
    nonprod.backendOrigin,
    ...Object.values(nonprod.routes),
    ...Object.values(nonprod.products).flatMap((p) => [p.origin, p.cookieName]),
  ])
    assert.ok(xml.includes(item), item);
  assert.match(
    xml,
    /<set-header name="Access-Control-Allow-Headers" exists-action="override"><value>Content-Type, X-Tirodhan-Web-Session<\/value>/,
  );
});

test('the initial business map meets the backend Terraform operation shape', async () => {
  const { business_operations: operations } = JSON.parse(
    await readFile(
      resolve(directory, 'business-operations.nonprod.json'),
      'utf8',
    ),
  );
  const seen = new Set();
  assert.deepEqual(operations['auth-me'], { method: 'GET', path: '/auth/me' });
  for (const [id, { method, path }] of Object.entries(operations)) {
    assert.match(id, /^(?!native-)[a-z][a-z0-9-]{0,70}$/);
    assert.deepEqual(Object.keys(operations[id]).sort(), ['method', 'path']);
    assert.match(method, /^(GET|POST|PUT|PATCH|DELETE)$/);
    assert.match(
      path,
      /^\/[a-z][a-z0-9-]*(\/([a-zA-Z0-9_-]+|\{[a-zA-Z][a-zA-Z0-9_]*\}))*$/,
    );
    assert.doesNotMatch(path, /^\/v[0-9]+(?:\/|$)/);
    if (/^\/auth(?:\/|$)/.test(path)) assert.equal(id, 'auth-me');
    const signature = method + ' ' + path.replaceAll(/\{[^}]+\}/g, '{}');
    assert(!seen.has(signature), signature);
    seen.add(signature);
  }
});
const approvedTest = () => ({
  approved: true,
  approvalReference: 'LOCAL TEST ONLY - NOT APPROVED ENVIRONMENT',
  environment: 'nonprod',
  gatewayOrigin: 'https://gateway.local-test.invalid',
  backendOrigin: 'https://backend.local-test.invalid',
  diagnosticsReviewed: true,
  effectivePolicyReviewed: true,
  products: {
    operations: {
      origin: 'https://ops.local-test.invalid',
      cookieName: '__Host-local-test-ops',
    },
    customer: {
      origin: 'https://customer.local-test.invalid',
      cookieName: '__Host-local-test-customer',
    },
  },
  routes: {
    start: '/test/start',
    verify: '/test/verify',
    refresh: '/test/refresh',
    logout: '/test/logout',
  },
  csrf: { header: 'X-Local-Test-Session', value: 'test' },
  cookie: {
    sameSite: 'Strict',
    sameSiteJustification: 'LOCAL TEST ONLY',
    maxAgeSeconds: 600,
  },
  backendRefreshTtlSeconds: 600,
});
test('checked-in policy is reproducible and disabled', async () => {
  const policy = await render(disabled);
  assert.equal(
    await readFile(resolve(directory, 'policy.xml'), 'utf8'),
    policy,
  );
  assert.match(policy, /&quot;approved\\&quot;:false/);
  assert.throws(() => validateConfiguration(disabled));
});
test('isolated API policy has finite forwarding, no redirects/retry/cache/logging and constructed responses', async () => {
  const policy = await render(approvedTest());
  assert.match(
    policy,
    /<forward-request timeout="10" follow-redirects="false"/,
  );
  assert.match(policy, /copy-unmatched-params="false"/);
  for (const forbidden of [
    '<retry',
    '<trace',
    '<log-to-eventhub',
    '<cache-',
    '<base',
    '<send-request',
  ])
    assert.ok(!policy.includes(forbidden), forbidden);
  assert.match(policy, /<set-header name="Cookie" exists-action="delete"/);
  assert.match(
    policy,
    /<set-header name="Authorization" exists-action="delete"/,
  );
  assert.equal(
    policy.split('<set-header name="X-Gateway-Secret"').length - 1,
    1,
  );
  assert.ok(
    policy.includes(
      '<set-header name="X-Gateway-Secret" exists-action="override"><value>{{gateway-secret}}</value></set-header>',
    ),
  );
  assert.match(policy, /private, no-store, max-age=0/);
  assert.match(policy, /Access-Control-Allow-Origin/);
  assert.ok(
    !policy.includes('allow-credentials="true"') &&
      !policy.includes('<value>*</value>'),
  );
  assert.match(policy, /<on-error>[\s\S]*return-response/);
});
for (const [name, change] of [
  ['unapproved', (c) => (c.approved = false)],
  ['production', (c) => (c.environment = 'prod')],
  ['wildcard origin', (c) => (c.products.operations.origin = '*')],
  ['null origin', (c) => (c.products.operations.origin = 'null')],
  ['origin path', (c) => (c.products.operations.origin += '/')],
  [
    'origin lookalike',
    (c) => (c.products.operations.origin = 'https://ops.invalid@evil.invalid'),
  ],
  [
    'same cookie',
    (c) => (c.products.customer.cookieName = c.products.operations.cookieName),
  ],
  [
    'same origin',
    (c) => (c.products.customer.origin = c.products.operations.origin),
  ],
  ['cookie newline', (c) => (c.products.operations.cookieName += '\r\n')],
  ['csrf newline', (c) => (c.csrf.header += '\n')],
  ['simple header', (c) => (c.csrf.header = 'Content-Type')],
  ['reserved gateway header', (c) => (c.csrf.header = 'x-gateway-secret')],
  ['csrf value newline', (c) => (c.csrf.value += '\n')],
  ['backend loop', (c) => (c.backendOrigin = c.gatewayOrigin)],
  ['query route', (c) => (c.routes.refresh += '?secret=x')],
  ['backend auth route', (c) => (c.routes.refresh = '/v1/auth/refresh')],
  ['missing route', (c) => delete c.routes.refresh],
  ['unbounded lifetime', (c) => (c.cookie.maxAgeSeconds = 601)],
  [
    'missing SameSite justification',
    (c) => (c.cookie.sameSiteJustification = ''),
  ],
  ['unreviewed diagnostics', (c) => (c.diagnosticsReviewed = false)],
  ['unreviewed parents', (c) => (c.effectivePolicyReviewed = false)],
])
  test(`configuration rejects ${name}`, () => {
    const config = approvedTest();
    change(config);
    assert.throws(() => validateConfiguration(config));
  });
