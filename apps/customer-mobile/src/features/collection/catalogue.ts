import { previewCatalogue } from '../../lib/runtime';
import { ContractUnavailable } from '../../lib/unavailable';
import { developmentCatalogue } from './developmentCatalogue';
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
  imageAssetKey: string;
  thumbnailAssetKey: string;
  alt: string;
  handlingHints?: string;
}
export interface Catalogue {
  source: 'development' | 'backend';
  groups: CatalogueGroup[];
  categories: Category[];
  quick: { categoryCode: string; label: string }[];
}
export interface CatalogueRepository {
  read(signal?: AbortSignal): Promise<Catalogue>;
}
export const catalogueRepository: CatalogueRepository = {
  async read() {
    if (previewCatalogue) return developmentCatalogue;
    throw new ContractUnavailable('Collection catalogue');
  },
};
