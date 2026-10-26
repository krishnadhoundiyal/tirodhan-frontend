import { normalizePath, metadata } from './public';
import './style.css';
const path = normalizePath(window.location.pathname);
const root = document.getElementById('root')!;
if (__CUSTOMER_DEV_SERVER__) document.title = metadata(path).title;
if (path === '/account' || path.startsWith('/account/')) {
  void (async () => {
    const { mountCustomer } = await import('./customer-app');
    const runtime =
      __CUSTOMER_DEV_SERVER__ &&
      import.meta.env.DEV &&
      import.meta.env.VITE_CUSTOMER_FIXTURE === 'true'
        ? (await import('./fixture')).fixtureRuntime()
        : (await import('./runtime')).productionRuntime();
    mountCustomer(root, runtime);
  })();
} else if (__CUSTOMER_DEV_SERVER__)
  void (async () => {
    const [{ createRoot }, { PublicPage }] = await Promise.all([
      import('react-dom/client'),
      import('./public'),
    ]);
    createRoot(root).render(<PublicPage path={path} />);
  })();
