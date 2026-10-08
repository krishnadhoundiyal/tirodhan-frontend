import type { Catalogue } from './catalogue';
import type { Media } from '../media/model';
export function developmentMedia(
  key: string,
  alt: string,
  width = 320,
  height = 180,
): Media {
  return {
    url: null,
    thumbnail_url: null,
    width,
    height,
    alt_text: alt,
    blurhash: null,
    expires_at: null,
    developmentAssetKey: key,
  };
}
// Visual-only editorial fixture. These codes are NOT an approved backend taxonomy.
const rows = [
  [
    'flowers',
    'floral',
    'Used Flowers & Garlands',
    'Fresh & dried flowers, garlands, petals',
  ],
  [
    'havan',
    'floral',
    'Havan & Puja Remnants',
    'Havan samagri, dhoop, camphor, roli/chawal',
  ],
  [
    'leaves',
    'floral',
    'Sacred Leaves & Plant Material',
    'Tulsi, bilva and other sacred leaves',
  ],
  [
    'prasad',
    'floral',
    'Prasad & Organic Offerings',
    'Prasad, fruits and organic offerings',
  ],
  [
    'idols',
    'objects',
    'Broken / Retired Idols & Sacred Figures',
    'Stone, metal, clay idols and broken parts',
  ],
  [
    'frames',
    'objects',
    'Frames & Sacred Pictures',
    'Photos, framed pictures and calendars',
  ],
  [
    'yantras',
    'objects',
    'Yantras & Ritual Objects',
    'Yantras, shaligrams and ritual items',
  ],
  [
    'decor',
    'objects',
    'Temple Decoration Material',
    'Bells, metal decor and temple items',
  ],
  [
    'books',
    'paper',
    'Old Holy Books & Sacred Paper',
    'Gita, Ramayan, Puranas, pothis and calendars',
  ],
  [
    'mantras',
    'paper',
    'Mantras & Papers',
    'Written mantras, yantras and notes',
  ],
  [
    'calendars',
    'paper',
    'Calendars & Sacred Print Material',
    'Calendars, posters and sacred paper items',
  ],
  [
    'pages',
    'paper',
    'Damaged Books & Pages',
    'Old, torn or unusable sacred texts',
  ],
  [
    'fabrics',
    'vastra',
    'Idol Clothes & Sacred Fabrics',
    'Clothes, chunnis, dupattas and fabrics',
  ],
  ['vastra', 'vastra', 'Used Vastra', 'Sarees, dhotis and angavastrams'],
  [
    'ornaments',
    'vastra',
    'Sacred Ornaments & Accessories',
    'Crowns, jewellery, mala and accessories',
  ],
  [
    'altar',
    'vastra',
    'Altar Cloth & Covers',
    'Chowkis, asans, covers and decorative fabrics',
  ],
] as const;
export const developmentCatalogue: Catalogue = {
  source: 'development',
  version: 'development-1',
  artwork: {
    hero: developmentMedia('hero', 'Sacred idol, diya and flowers'),
    home: developmentMedia('homeJourney', 'Your home'),
    rickshaw: developmentMedia('rickshaw', 'Human-powered Tirodhan rickshaw'),
    receiving_point: null,
  },
  groups: [
    { code: 'floral', name: 'Floral & Organic', order: 0, active: true },
    { code: 'objects', name: 'Sacred Objects', order: 1, active: true },
    { code: 'paper', name: 'Texts & Paper', order: 2, active: true },
    { code: 'vastra', name: 'Vastra & Accessories', order: 3, active: true },
  ],
  categories: rows.map(([code, group, name, description], order) => ({
    code,
    group,
    name,
    description,
    order,
    active: true,
    image: developmentMedia(code, name),
    thumbnail: developmentMedia(code, name),
    input: { quantity: 'OPTIONAL', weight_grams: 'OPTIONAL' },
  })),
  quick: [
    { categoryCode: 'flowers', label: 'Flower\nGarlands' },
    { categoryCode: 'havan', label: 'Havan\nSamagri' },
    { categoryCode: 'idols', label: 'Idols &\nMurti' },
    { categoryCode: 'books', label: 'Holy\nBooks' },
    { categoryCode: 'vastra', label: 'Vastra' },
    { categoryCode: 'ornaments', label: 'Ornaments' },
    { categoryCode: 'decor', label: 'Temple\nDecor' },
    { categoryCode: 'yantras', label: 'Diyas &\nPots' },
    { categoryCode: 'prasad', label: 'Prasad' },
  ],
};
