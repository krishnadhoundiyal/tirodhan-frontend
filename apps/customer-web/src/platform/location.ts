import type { Location } from '../api/contracts';
import { ApiError } from '../parity/api/errors';
export interface Geocoder {
  search(
    text: string,
    signal: AbortSignal,
  ): Promise<{ location: Location; address: string }[]>;
  reverse(point: Location, signal: AbortSignal): Promise<string | null>;
}
export interface MapConfiguration {
  approved: boolean;
  approvalReference: string;
  tileUrl: string;
  attribution: string;
}
/** Public Nominatim-compatible provider, selected explicitly by the deployment.
 * No default host, API key, cookie or automatic household lookup. */
export function browserGeocoder(
  config: {
    approved: boolean;
    approvalReference: string;
    searchUrl: string;
    reverseUrl: string;
  } | null,
  fetcher: typeof fetch,
): Geocoder | null {
  if (!config?.approved || !config.approvalReference.trim()) return null;
  try {
    for (const endpoint of [config.searchUrl, config.reverseUrl]) {
      const u = new URL(endpoint);
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        return null;
    }
  } catch {
    return null;
  }
  const point = (v: Record<string, unknown>) => {
    const latitude = Number(v.lat),
      longitude = Number(v.lon);
    if (
      typeof v.lat !== 'string' ||
      typeof v.lon !== 'string' ||
      !v.lat.trim() ||
      !v.lon.trim() ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    )
      throw new ApiError(200, 'protocol');
    return { latitude, longitude };
  };
  async function read(url: URL, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, 10000);
    try {
      const value = await Promise.race([
        fetcher(url, {
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: { Accept: 'application/json' },
        }).then(async (r) => {
          if (
            r.status !== 200 ||
            !r.headers.get('content-type')?.startsWith('application/json')
          )
            throw new ApiError(r.status, 'http');
          const text = await r.text();
          if (text.length > 100000) throw new ApiError(200, 'protocol');
          return JSON.parse(text) as unknown;
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(new ApiError(0, 'cancelled')),
            { once: true },
          );
          if (controller.signal.aborted) reject(new ApiError(0, 'cancelled'));
        }),
      ]);
      if (signal.aborted) throw new ApiError(0, 'cancelled');
      return value;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  return {
    async search(text, signal) {
      if (!text.trim() || text.length > 2000) return [];
      const url = new URL(config.searchUrl);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', text.trim());
      url.searchParams.set('limit', '5');
      const result = await read(url, signal);
      if (!Array.isArray(result) || result.length > 5)
        throw new ApiError(200, 'protocol');
      return result.map((v) => {
        if (
          !v ||
          typeof v !== 'object' ||
          typeof v.display_name !== 'string' ||
          v.display_name.length > 2000
        )
          throw new ApiError(200, 'protocol');
        return { location: point(v), address: v.display_name };
      });
    },
    async reverse(p, signal) {
      if (
        !Number.isFinite(p.latitude) ||
        Math.abs(p.latitude) > 90 ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.longitude) > 180
      )
        throw new ApiError(422, 'http');
      const url = new URL(config.reverseUrl);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(p.latitude));
      url.searchParams.set('lon', String(p.longitude));
      const v = await read(url, signal);
      if (!v || typeof v !== 'object') throw new ApiError(200, 'protocol');
      const r = v as Record<string, unknown>;
      if (r.error) return null;
      point(r);
      if (typeof r.display_name !== 'string' || r.display_name.length > 2000)
        throw new ApiError(200, 'protocol');
      return r.display_name;
    },
  };
}
export function approvedMap(config: MapConfiguration | null | undefined) {
  if (
    !config ||
    config.approved !== true ||
    !config.approvalReference.trim() ||
    !config.attribution.trim()
  )
    return false;
  try {
    const u = new URL(config.tileUrl);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      ['{x}', '{y}', '{z}'].every((t) => config.tileUrl.includes(t))
    );
  } catch {
    return false;
  }
}
export function currentLocation(
  geolocation: Geolocation | undefined,
  signal: AbortSignal,
): Promise<Location> {
  if (!geolocation) return Promise.reject(new ApiError(0, 'configuration'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      reject(new ApiError(0, 'timeout'));
    }, 12000);
    const abort = () => {
      clearTimeout(timer);
      reject(new ApiError(0, 'cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (signal.aborted) {
          reject(new ApiError(0, 'cancelled'));
          return;
        }
        const point = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };
        if (
          !Number.isFinite(point.latitude) ||
          Math.abs(point.latitude) > 90 ||
          !Number.isFinite(point.longitude) ||
          Math.abs(point.longitude) > 180
        )
          reject(new ApiError(200, 'protocol'));
        else resolve(point);
      },
      () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new ApiError(0, 'configuration'));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  });
}
