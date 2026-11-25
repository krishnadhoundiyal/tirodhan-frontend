import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const product = process.argv[2];
if (product !== 'customer' && product !== 'operations')
  throw new Error('Unknown web product');

const root = resolve('dist');
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const collection = new RegExp('^/account/collections/' + uuid + '/?$', 'i');
const operationsRoute = new RegExp(
  '^/(overview|riders|assignments|routes|recovery|incidents|account)/?$|^/routes/' +
    uuid +
    '/?$',
  'i',
);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const env = process.env;
const originSecret = env.WEB_APIM_ORIGIN_SECRET;
const originRequired =
  env.WEB_APIM_ORIGIN_REQUIRED === 'true' || !!originSecret;
const validOriginSecret = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
if (originRequired && !validOriginSecret(originSecret))
  throw new Error('APIM origin authentication is not configured');
const originKey = originRequired ? Buffer.from(originSecret, 'hex') : null;
// Only these public deployment inputs are serialized. Never pass the process
// environment, a secret value, or request headers to browser JavaScript.
const session =
  env.WEB_AUTH_ENABLED === 'true' && env.WEB_ENVIRONMENT === 'nonprod'
    ? {
        approved: true,
        approvalReference: env.WEB_AUTH_POC_REFERENCE,
        environment: 'nonprod',
        product,
        browserOrigin: env.WEB_AUTH_BROWSER_ORIGIN,
        gatewayOrigin: env.WEB_AUTH_GATEWAY_ORIGIN,
        routes: {
          start: env.WEB_AUTH_START_PATH,
          verify: env.WEB_AUTH_VERIFY_PATH,
          refresh: env.WEB_AUTH_REFRESH_PATH,
          logout: env.WEB_AUTH_LOGOUT_PATH,
        },
        csrf: {
          header: env.WEB_AUTH_CSRF_HEADER,
          value: env.WEB_AUTH_CSRF_VALUE,
        },
      }
    : null;
const index = product === 'customer' ? 'account/index.html' : 'index.html';
const requiredEntries =
  product === 'customer' ? ['index.html', index, '404.html'] : [index];
await Promise.all(requiredEntries.map((file) => stat(resolve(root, file))));

const server = createServer(async (req, res) => {
  const send = (status, type, body, headers = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      ...headers,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return send(405, types['.txt'], 'Method not allowed', {
      Allow: 'GET, HEAD',
    });
  let path;
  try {
    path = decodeURIComponent(req.url.split('?')[0]);
    if (
      !path.startsWith('/') ||
      /[\\\x00-\x1f\x7f]/.test(path) ||
      path.split('/').some((segment) => segment.startsWith('.'))
    )
      throw new Error('Invalid path');
  } catch {
    return send(400, types['.txt'], 'Bad request');
  }
  if (path === '/health') return send(200, types['.txt'], 'ok');
  if (originKey) {
    const supplied = req.headers['x-tirodhan-web-origin'];
    if (
      !validOriginSecret(supplied) ||
      !timingSafeEqual(originKey, Buffer.from(supplied, 'hex'))
    )
      return send(403, types['.txt'], 'Forbidden');
  }
  if (path === '/web-session-config.json')
    return send(
      200,
      'application/json; charset=utf-8',
      JSON.stringify(session),
      {
        'X-Robots-Tag': 'noindex, nofollow',
      },
    );

  const privatePage =
    product === 'operations' ||
    path === '/account' ||
    path.startsWith('/account/');
  const robots = privatePage ? { 'X-Robots-Tag': 'noindex, nofollow' } : {};
  const file = resolve(
    root,
    '.' + (extname(path) ? path : path.replace(/\/$/, '') + '/index.html'),
  );
  if (!file.startsWith(root + sep))
    return send(400, types['.txt'], 'Bad request');
  try {
    const contents = await readFile(file);
    return send(
      200,
      types[extname(file)] ?? 'application/octet-stream',
      contents,
      robots,
    );
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code))
      return send(500, types['.txt'], 'Page unavailable', robots);
  }
  try {
    if ((product === 'customer' ? collection : operationsRoute).test(path))
      return send(
        200,
        types['.html'],
        await readFile(resolve(root, index)),
        robots,
      );
    if (product === 'customer' && !extname(path))
      return send(
        404,
        types['.html'],
        await readFile(resolve(root, '404.html')),
        robots,
      );
    return send(404, types['.txt'], 'Not found', robots);
  } catch {
    return send(500, types['.txt'], 'Page unavailable', robots);
  }
});
server.listen(8080, '0.0.0.0');
process.on('SIGTERM', () => server.close());
