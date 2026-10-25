import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export const directory = dirname(fileURLToPath(import.meta.url));
const origin = (value) => {
  if (typeof value !== 'string' || /[\r\n]/.test(value))
    throw Error('An exact HTTPS origin is required.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    value !== url.origin ||
    url.username ||
    url.password
  )
    throw Error('An exact HTTPS origin is required.');
};
export function validateConfiguration(config) {
  const allowed = [
    'approved',
    'approvalReference',
    'environment',
    'gatewayOrigin',
    'backendOrigin',
    'routes',
    'csrf',
    'products',
    'cookie',
    'backendRefreshTtlSeconds',
    'diagnosticsReviewed',
    'effectivePolicyReviewed',
  ];
  if (!config || Object.keys(config).some((key) => !allowed.includes(key)))
    throw Error('Unknown policy configuration input.');
  if (
    !config ||
    config.environment !== 'nonprod' ||
    config.approved !== true ||
    typeof config.approvalReference !== 'string' ||
    !config.approvalReference.trim() ||
    config.diagnosticsReviewed !== true ||
    config.effectivePolicyReviewed !== true
  )
    throw Error(
      'Approved nonproduction configuration and effective-policy/diagnostics review are required.',
    );
  origin(config.gatewayOrigin);
  origin(config.backendOrigin);
  if (config.gatewayOrigin === config.backendOrigin)
    throw Error('The backend cannot point back to this gateway.');
  const products = Object.keys(config.products ?? {});
  if (
    products.length !== 2 ||
    !products.includes('operations') ||
    !products.includes('customer')
  )
    throw Error('Both isolated products must be configured.');
  const names = new Set(),
    origins = new Set();
  for (const product of Object.values(config.products)) {
    origin(product.origin);
    if (
      !/^__Host-[A-Za-z0-9_-]{1,80}$/.test(product.cookieName ?? '') ||
      /[\r\n]/.test(product.cookieName)
    )
      throw Error('Host-prefixed isolated cookie names are required.');
    names.add(product.cookieName);
    origins.add(product.origin);
  }
  if (names.size !== 2 || origins.size !== 2)
    throw Error('Product origins and cookie names must be distinct.');
  if (
    Object.keys(config.routes ?? {})
      .sort()
      .join() !== 'logout,refresh,start,verify' ||
    new Set(Object.values(config.routes)).size !== 4
  )
    throw Error('Four explicit web-auth routes are required.');
  for (const route of Object.values(config.routes))
    if (
      typeof route !== 'string' ||
      !/^\/[A-Za-z0-9/-]+$/.test(route) ||
      /[\r\n]/.test(route) ||
      route.includes('//') ||
      route.startsWith('/v1/auth') ||
      route.endsWith('/')
    )
      throw Error('Unsafe web-auth route.');
  if (
    !/^X-[A-Za-z0-9-]{3,70}$/i.test(config.csrf?.header ?? '') ||
    /[\r\n]/.test(config.csrf.header) ||
    /^(x-forwarded-|x-ms-|x-apim-|x-http-method)/i.test(config.csrf.header) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.csrf?.value ?? '') ||
    /[\r\n]/.test(config.csrf.value)
  )
    throw Error('A non-simple CSRF header contract is required.');
  if (
    !['Strict', 'Lax', 'None'].includes(config.cookie?.sameSite) ||
    typeof config.cookie.sameSiteJustification !== 'string' ||
    !config.cookie.sameSiteJustification.trim() ||
    !Number.isSafeInteger(config.cookie.maxAgeSeconds) ||
    config.cookie.maxAgeSeconds < 1 ||
    !Number.isSafeInteger(config.backendRefreshTtlSeconds) ||
    config.cookie.maxAgeSeconds > config.backendRefreshTtlSeconds ||
    config.backendRefreshTtlSeconds > 2147483647
  )
    throw Error(
      'Justified SameSite and backend-bounded cookie lifetime required.',
    );
}
const xml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '');
const attr = (value) => xml(String(value));
const expr = (value) => '@(' + value + ')';
const value = (variable, property) =>
  `JObject.Parse((string)context.Variables["${variable}"])["${property}"]`;
const header = (name, expression) =>
  `<set-header name="${attr(name)}" exists-action="override"><value>${xml(expression)}</value></set-header>`;
function response(status, body, cookie, trustedOrigin, config) {
  const make = (cors, setCookie) =>
    `<return-response><set-status code="${attr(expr(status))}" reason="Web session"/>${header('Content-Type', 'application/json')}${header('Cache-Control', 'private, no-store, max-age=0')}${header('Pragma', 'no-cache')}${header('Vary', 'Origin')}${header('X-Content-Type-Options', 'nosniff')}${cors ? header('Access-Control-Allow-Origin', expr(trustedOrigin)) + header('Access-Control-Allow-Credentials', 'true') + header('Access-Control-Allow-Methods', 'POST') + header('Access-Control-Allow-Headers', config.csrf?.header ? 'Content-Type, ' + config.csrf.header : 'Content-Type') + header('Access-Control-Max-Age', '0') : ''}${setCookie ? header('Set-Cookie', expr(cookie)) : ''}<set-body>${xml(expr(body))}</set-body></return-response>`;
  const chooseCookie = (cors) =>
    `<choose><when condition="${attr(expr(`!String.IsNullOrEmpty(${cookie})`))}">${make(cors, true)}</when><otherwise>${make(cors, false)}</otherwise></choose>`;
  return `<choose><when condition="${attr(expr(`!String.IsNullOrEmpty(${trustedOrigin})`))}">${chooseCookie(true)}</when><otherwise>${chooseCookie(false)}</otherwise></choose>`;
}
export async function render(config) {
  const allowed = [
    'approved',
    'approvalReference',
    'environment',
    'gatewayOrigin',
    'backendOrigin',
    'routes',
    'csrf',
    'products',
    'cookie',
    'backendRefreshTtlSeconds',
    'diagnosticsReviewed',
    'effectivePolicyReviewed',
  ];
  if (!config || Object.keys(config).some((key) => !allowed.includes(key)))
    throw Error('Unknown policy configuration input.');
  if (config.approved) validateConfiguration(config);
  else if (config.approved !== false || config.environment !== 'nonprod')
    throw Error('An explicitly disabled nonproduction template is required.');
  const admit = await readFile(
    resolve(directory, 'expressions/admit.cs'),
    'utf8',
  );
  const shape = await readFile(
    resolve(directory, 'expressions/shape.cs'),
    'utf8',
  );
  const cfg = JSON.stringify(JSON.stringify(config));
  const admitPrefix = `var configuration = (string)context.Variables["configuration"]; var origin = context.Request.Headers.GetValueOrDefault("Origin", ""); var csrf = context.Request.Headers.GetValueOrDefault((string)JObject.Parse(configuration)["csrf"]["header"] ?? "X-Unconfigured", ""); var method = context.Request.Method; var path = context.Request.OriginalUrl.Query.Count == 0 ? context.Request.OriginalUrl.Path : ""; var requestedMethod = context.Request.Headers.GetValueOrDefault("Access-Control-Request-Method", ""); var requestedHeaders = context.Request.Headers.GetValueOrDefault("Access-Control-Request-Headers", ""); var requestBody = context.Request.HasBody ? context.Request.Body.As<string>(preserveContent: true) : "{}"; var cookieHeader = context.Request.Headers.GetValueOrDefault("Cookie", "");`;
  const cookieAttributes =
    '; Path=/; Secure; HttpOnly; SameSite=' +
    (config.cookie?.sameSite ?? 'Strict');
  const clearCookie = `(bool?)${value('admission', 'clear')} == true ? (string)${value('admission', 'cookieName')} + ${JSON.stringify('=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' + cookieAttributes)} : ""`;
  const shapePrefix = `var configuration = (string)context.Variables["configuration"]; var operation = (string)${value('admission', 'operation')}; var cookieName = (string)${value('admission', 'cookieName')}; var upstream = context.Response; var status = upstream.StatusCode; var body = upstream.Body == null ? "" : upstream.Body.As<string>(); var elapsedSeconds = (int)Math.Ceiling((DateTime.UtcNow - DateTime.Parse((string)context.Variables["started"]).ToUniversalTime()).TotalSeconds);`;
  const originValue = `(string)${value('admission', 'origin')}`;
  const xmlPolicy = `<?xml version="1.0" encoding="utf-8"?>
<!-- Candidate isolated web-auth API policy; NOT DEPLOYED. No inherited policy is assumed safe. Effective policies and diagnostics require separate approval. -->
<policies><inbound>
<set-variable name="configuration" value="${attr(expr(cfg))}"/>
<set-variable name="started" value="@(DateTime.UtcNow.ToString(&quot;o&quot;))"/>
<set-variable name="admission" value="${attr('@{' + admitPrefix + admit + '}')}"/>
<choose><when condition="${attr(expr(`(int)${value('admission', 'status')} != 0`))}">${response(`(int)${value('admission', 'status')}`, `(string)${value('admission', 'body')}`, clearCookie, originValue, config)}</when></choose>
<set-backend-service base-url="${attr(expr('(string)JObject.Parse((string)context.Variables["configuration"])["backendOrigin"]'))}"/>
<rewrite-uri template="${attr(expr(`(string)${value('admission', 'backendPath')}`))}" copy-unmatched-params="false"/>
<set-method>POST</set-method>
<set-header name="Cookie" exists-action="delete"/><set-header name="Authorization" exists-action="delete"/><set-header name="Ocp-Apim-Subscription-Key" exists-action="delete"/>
${header('Content-Type', 'application/json')}${header('Accept', 'application/json')}${header('Cache-Control', 'no-store')}
<set-body>${xml(expr(`(string)${value('admission', 'requestBody')}`))}</set-body>
</inbound><backend><forward-request timeout="10" follow-redirects="false" buffer-request-body="false" fail-on-error-status-code="false"/></backend><outbound>
<set-variable name="shaped" value="${attr('@{' + shapePrefix + shape + '}')}"/>
${response(`(int)${value('shaped', 'status')}`, `(string)${value('shaped', 'body')}`, `(string)${value('shaped', 'cookie')}`, originValue, config)}
</outbound><on-error>
${response('502', '"{\\"error\\":\\"AUTHENTICATION_UNAVAILABLE\\"}"', '""', `context.Variables.ContainsKey("admission") ? (string)${value('admission', 'origin')} : ""`, config)}
</on-error></policies>`;
  return xmlPolicy;
}
export async function generateHarness(directoryOut) {
  await mkdir(directoryOut, { recursive: true });
  const admit = await readFile(
    resolve(directory, 'expressions/admit.cs'),
    'utf8',
  );
  const shape = await readFile(
    resolve(directory, 'expressions/shape.cs'),
    'utf8',
  );
  await writeFile(
    resolve(directoryOut, 'PolicyFunctions.cs'),
    `using System; using System.Linq; using System.Text.RegularExpressions; using Newtonsoft.Json.Linq;\npublic static class PolicyFunctions { public static string Admit(string configuration,string origin,string csrf,string method,string path,string requestedMethod,string requestedHeaders,string requestBody,string cookieHeader) { ${admit} } public static string Shape(string configuration,string operation,int status,string body,string cookieName,int elapsedSeconds) { ${shape} } }`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = JSON.parse(
    await readFile(
      process.argv[2] ?? resolve(directory, 'configuration.unapproved.json'),
      'utf8',
    ),
  );
  await writeFile(
    process.argv[3] ?? resolve(directory, 'policy.xml'),
    await render(config),
  );
  await generateHarness(
    resolve(directory, '../../../.local/ow-p0-03/policy-harness'),
  );
  process.stdout.write(
    'Generated policy artifact and local expression harness; no deployment performed.\n',
  );
}
