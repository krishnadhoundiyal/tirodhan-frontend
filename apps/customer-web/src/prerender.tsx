import { renderToString } from 'react-dom/server';
import { PublicPage, metadata, publicPaths, accountPaths } from './public';
export const routes = [...publicPaths, ...accountPaths, '/404'];
export function render(path: string) {
  return {
    body: renderToString(<PublicPage path={path} />),
    ...metadata(path),
  };
}
