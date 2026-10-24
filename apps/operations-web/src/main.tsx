import { createRoot } from 'react-dom/client';
import App from './App';
import { unavailableRuntime, type Capabilities, type Runtime } from './runtime';
import './styles.css';

async function start() {
  let runtime: Runtime;
  if (
    __OPERATIONS_DEV_SERVER__ &&
    import.meta.env.DEV &&
    import.meta.env.VITE_OPERATIONS_PREVIEW === 'true'
  ) {
    const { fixtureRuntime } = await import('./preview/fixtures');
    runtime = fixtureRuntime();
    await runtime.session.restore();
  } else {
    const dispatch = import.meta.env.VITE_OPERATIONS_V2_DISPATCH === 'true';
    const fleet =
      dispatch && import.meta.env.VITE_OPERATIONS_V2_FLEET === 'true';
    const capabilities: Capabilities = {
      dispatch,
      fleet,
      orchestration:
        fleet && import.meta.env.VITE_OPERATIONS_V2_ORCHESTRATION === 'true',
    };
    try {
      runtime = unavailableRuntime(
        import.meta.env.VITE_OPERATIONS_API_ORIGIN || null,
        capabilities,
      );
    } catch {
      runtime = unavailableRuntime(null, {
        dispatch: false,
        fleet: false,
        orchestration: false,
      });
    }
  }
  createRoot(document.getElementById('root')!).render(
    <App runtime={runtime} />,
  );
}
void start();
