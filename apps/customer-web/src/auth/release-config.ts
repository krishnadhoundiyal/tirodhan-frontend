import type { ApimSessionConfiguration } from './apim-adapter';

/** The release host exposes only public deployment inputs at this same-origin URL. */
export async function readSessionConfiguration(
  browserOrigin: string,
  fetcher: typeof fetch,
): Promise<ApimSessionConfiguration | null> {
  if (!browserOrigin.startsWith('https:')) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetcher(
      new URL('/web-session-config.json', browserOrigin),
      {
        cache: 'no-store',
        credentials: 'omit',
        mode: 'same-origin',
        redirect: 'error',
        signal: controller.signal,
      },
    );
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('application/json')
    )
      return null;
    const body = await response.text();
    return body.length <= 8192
      ? (JSON.parse(body) as ApimSessionConfiguration | null)
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
