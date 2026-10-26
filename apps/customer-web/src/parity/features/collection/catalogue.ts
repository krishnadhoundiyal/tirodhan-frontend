import type { CatalogueDto } from '../../api/customer-contracts';
import type { Media } from '../media/model';
export interface CatalogueGroup {
  code: string;
  name: string;
  order: number;
  active: boolean;
}
export interface Category {
  code: string;
  group: string;
  name: string;
  description: string;
  order: number;
  active: boolean;
  image: Media;
  thumbnail: Media;
  input: { quantity: 'NONE' | 'OPTIONAL'; weight_grams: 'NONE' | 'OPTIONAL' };
  handlingHints?: string;
}
export interface Catalogue {
  source: 'development' | 'backend';
  groups: CatalogueGroup[];
  categories: Category[];
  quick: { categoryCode: string; label: string }[];
  version: string;
  artwork: {
    hero: Media | null;
    home: Media | null;
    rickshaw: Media | null;
    receiving_point: Media | null;
  };
}
export function catalogueFromDto(dto: CatalogueDto): Catalogue {
  return {
    source: 'backend',
    version: dto.version,
    artwork: dto.artwork,
    groups: dto.groups.map((group) => ({
      code: group.group_code,
      name: group.display_name,
      order: group.display_order,
      active: group.active,
    })),
    categories: dto.categories.map((category) => ({
      code: category.category_code,
      group: category.group_code,
      name: category.display_name,
      description: category.description,
      order: category.display_order,
      active:
        category.active &&
        dto.groups.some(
          (group) => group.group_code === category.group_code && group.active,
        ),
      image: category.image,
      thumbnail: category.thumbnail,
      input: category.input,
      handlingHints: category.handling_hints ?? undefined,
    })),
    quick: [...dto.quick_categories]
      .sort((a, b) => a.display_order - b.display_order)
      .map((item) => ({ categoryCode: item.category_code, label: item.label })),
  };
}
export function catalogueFreshness(
  catalogue: Catalogue | undefined,
  now = Date.now(),
) {
  const images = [
    ...(catalogue?.categories.flatMap((category) => [
      category.image,
      category.thumbnail,
    ]) ?? []),
    ...Object.values(catalogue?.artwork ?? {}),
  ];
  const expiries = images.flatMap((media) =>
    media?.expires_at ? [Date.parse(media.expires_at)] : [],
  );
  if (expiries.some((value) => !Number.isFinite(value))) return 0;
  return Math.max(
    0,
    Math.min(300000, ...expiries.map((expiry) => expiry - now)),
  );
}
