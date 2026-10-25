import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      ),
    )
  ).flat();
}
const paths = await files('dist');
for (const path of paths.filter((p) => /\.(js|html|css|json|map)$/.test(p))) {
  const body = await readFile(path, 'utf8');
  for (const marker of [
    'CUSTOMER_WEB_FIXTURE_ONLY_7f951c',
    'c0ffee00-0000-4000',
    'customer-fixture.invalid',
    'customer-fixture-access-only',
    'Demonstration Lane',
    '+919999999999',
    '"123456"',
    'DEVELOPMENT FIXTURE',
    'Development check scenario',
    'Enter development customer',
  ])
    assert(!body.includes(marker), `Fixture leak: ${path}`);
  assert(!path.endsWith('.map'), 'Production source maps must be absent');
}
for (const path of [
  '/',
  '/how-it-works',
  '/what-we-collect',
  '/availability',
  '/help',
  '/about',
  '/policies',
  '/policies/privacy',
  '/policies/terms',
]) {
  const html = await readFile(
    `dist${path === '/' ? '' : path}/index.html`,
    'utf8',
  );
  assert(
    html.includes('<h1>') &&
      html.includes('id="main"') &&
      html.includes('<title>'),
  );
  assert(
    html.includes('name="description"') && html.includes('property="og:title"'),
  );
  const links = [...html.matchAll(/href="(\/[^"]*)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.startsWith('/assets/') && !p.startsWith('/fonts/'));
  for (const link of links)
    assert(
      paths.includes(`dist${link === '/' ? '' : link}/index.html`),
      `Broken public link: ${link}`,
    );
}
for (const path of [
  '/account',
  '/account/addresses',
  '/account/serviceability',
  '/account/activity',
  '/policies/privacy',
  '/policies/terms',
])
  assert(
    (await readFile(`dist${path}/index.html`, 'utf8')).includes(
      'noindex, nofollow',
    ),
  );
console.log(
  'Production isolation, prerendered content, metadata, private noindex and all public internal links passed.',
);
