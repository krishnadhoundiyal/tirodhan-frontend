import type { ApimSessionConfiguration } from './apim-adapter';
import type { CheckoutApproval } from '../platform/checkout';

/** The release host exposes only public deployment inputs at this same-origin URL. */
async function readPublicConfiguration(
  path: '/web-session-config.json' | '/web-checkout-config.json',
  browserOrigin: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  if (!browserOrigin.startsWith('https:')) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetcher(new URL(path, browserOrigin), {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('application/json')
    )
      return null;
    const body = await response.text();
    return body.length <= 8192 ? (JSON.parse(body) as unknown) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function readSessionConfiguration(
  browserOrigin: string,
  fetcher: typeof fetch,
): Promise<ApimSessionConfiguration | null> {
  return (await readPublicConfiguration(
    '/web-session-config.json',
    browserOrigin,
    fetcher,
  )) as ApimSessionConfiguration | null;
}

export async function readCheckoutConfiguration(
  browserOrigin: string,
  fetcher: typeof fetch,
): Promise<CheckoutApproval | null> {
  const value = await readPublicConfiguration(
    '/web-checkout-config.json',
    browserOrigin,
    fetcher,
  );
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join() !==
      'approvalReference,approved,browserOrigin,environment' ||
    !('approved' in value) ||
    value.approved !== true ||
    !('environment' in value) ||
    value.environment !== 'nonprod' ||
    !('browserOrigin' in value) ||
    value.browserOrigin !== browserOrigin ||
    !('approvalReference' in value) ||
    typeof value.approvalReference !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9:/._#-]{0,250}$/.test(value.approvalReference)
  )
    return null;
  return {
    approved: true,
    approvalReference: value.approvalReference,
    environment: 'nonprod',
    browserOrigin,
  };
}
