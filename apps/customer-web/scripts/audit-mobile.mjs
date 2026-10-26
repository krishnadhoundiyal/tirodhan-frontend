// Explicit audit refresh; CI checks the reviewed snapshot rather than silently updating it.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
const root = resolve('../customer-mobile');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)],
      ),
    )
  ).flat();
}
const paths = [
  ...(await walk(resolve(root, 'src'))),
  ...(await walk(resolve(root, 'app'))),
]
  .filter((p) => /\.(ts|tsx)$/.test(p))
  .sort();
const files = Object.fromEntries(
  await Promise.all(
    paths.map(async (p) => [
      relative(root, p).replaceAll('\\', '/'),
      createHash('sha256')
        .update((await readFile(p, 'utf8')).replaceAll('\r\n', '\n'))
        .digest('hex'),
    ]),
  ),
);
const routes = {
  'app/_layout.tsx': 'CustomerApp / ProductBoundary / session admission',
  'app/index.tsx': '/account bootstrap and explicit cookie-session resume',
  'app/login.tsx': '/account AuthForm phone',
  'app/otp.tsx': '/account AuthForm OTP / resend',
  'app/information.tsx':
    'public help/about/policies and /account/information/:slug',
  'app/(product)/_layout.tsx': 'CustomerApp CUSTOMER boundary',
  'app/(product)/(tabs)/_layout.tsx': 'Account navigation + browser history',
  'app/(product)/(tabs)/index.tsx': '/account/catalogue + /account overview',
  'app/(product)/(tabs)/pickup.tsx': '/account/pickup -> BookingWizard',
  'app/(product)/(tabs)/bookings.tsx': '/account/bookings',
  'app/(product)/(tabs)/activity.tsx': '/account/activity',
  'app/(product)/(tabs)/account.tsx': '/account overview',
  'app/(product)/addresses.tsx': '/account/addresses + /account/serviceability',
  'app/(product)/review.tsx': '/account/review',
  'app/(product)/collections/[requestId].tsx':
    '/account/collections/:requestId',
  'app/(product)/account-options.tsx':
    '/account/profile/preferences/favourites/payment-methods/feedback/information/:slug',
  'app/(product)/notifications.tsx': '/account/notifications',
};
await writeFile(
  'parity-source-audit.json',
  JSON.stringify(
    {
      referenceCommit: 'd0a9ab15a7436d2329b6af103775c72ff1bfc969',
      normalization: 'UTF-8, CRLF -> LF',
      routes,
      files,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Recorded ${paths.length} current Customer Mobile source/test modules and ${Object.keys(routes).length} route/layout equivalents.`,
);
