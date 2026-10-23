import { loadNativePush } from './native';
import { riderSignal } from './signals';
export function installBackgroundNotifications() {
  try {
    loadNativePush()?.background(async (data) => {
      // No session, credentials, navigation, operational mutation or payload persistence in headless JS.
      // All owned resources are fetched unconditionally on the next admitted foreground return.
      if (!riderSignal(data)) return;
    });
  } catch {
    // An older/unconfigured binary must still open; the foreground UI can expose setup/retry status.
  }
}
