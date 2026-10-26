import type { MediaDto } from '../../api/customer-contracts';
export interface Media extends Omit<MediaDto, 'url'> {
  url: string | null;
  developmentAssetKey?: string;
}
export function trustedMediaUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}
