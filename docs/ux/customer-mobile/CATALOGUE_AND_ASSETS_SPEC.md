# Catalogue and Asset Specification

## Purpose
The Collection Home and review flow depend on structured catalogue content, grouping, imagery, and labels.

## Core principle
Tirodhan is not a shopping app, but it needs a structured collection catalogue for:
- content grouping,
- selection UI,
- image/icon display,
- analytics,
- personalization,
- future handling/downstream hints.

## Quick circular categories
The approved Home quick-access strip includes:
- Flower Garlands
- Havan Samagri
- Idols & Murti
- Holy Books
- Vastra
- Ornaments
- Temple Decor
- Diyas & Pots
- Prasad

These are quick entry points, not the full taxonomy.

## Approved grouped sub-category sections
### Floral & Organic
- Used Flowers & Garlands
- Havan & Puja Remnants
- Sacred Leaves & Plant Material
- Prasad & Organic Offerings

### Sacred Objects
- Broken / Retired Idols & Sacred Figures
- Frames & Sacred Pictures
- Yantras & Ritual Objects
- Temple Decoration Material

### Texts & Paper
- Old Holy Books & Sacred Paper
- Mantras & Papers
- Calendars & Sacred Print Material
- Damaged Books & Pages

### Vastra & Accessories
- Idol Clothes & Sacred Fabrics
- Used Vastra
- Sacred Ornaments & Accessories
- Altar Cloth & Covers

## Home recommendation logic
For returning users:
- **Based on your previous collections**

For new users:
- use a neutral non-personal fallback such as **Popular collection groups**.

Do not use geography-based fake personalization.

## Data model guidance
Catalogue metadata should be stored in application data tables.
Images should be stored in Blob/object storage.

Suggested catalogue fields:
- `category_code`
- `category_display_name`
- `short_description`
- `parent_group_code`
- `display_order`
- `is_active`
- `hero_image_asset_key`
- `thumbnail_asset_key`
- `alt_text`
- `handling_notes` (optional)
- `future_downstream_hint` (optional)

Suggested group fields:
- `group_code`
- `group_display_name`
- `display_order`
- `is_active`

## Image metadata
Track at least:
- storage key,
- width,
- height,
- aspect ratio,
- crop-safe thumbnail,
- alt text.

Do not hardcode remote image URLs directly inside screen components.

## Operational rule
Future handling or pricing implications remain backend-owned. Frontend selection does not define pricing.
