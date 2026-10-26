// Minimal Web Push signal bridge. Deployment/registration is gated by an approved
// browser Push contract. No credentials, household payloads or arbitrary routes.
function valid(v) {
  return (
    v &&
    v.schema_version === 1 &&
    v.target === 'COLLECTION' &&
    typeof v.event_id === 'string' &&
    /^[A-Za-z0-9_-]{1,100}$/.test(v.event_id) &&
    typeof v.request_id === 'string' &&
    /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(v.request_id)
  );
}
self.addEventListener('push', (event) => {
  let raw;
  try {
    raw = event.data.json();
  } catch {
    return;
  }
  if (!valid(raw)) return;
  const data = {
    schema_version: 1,
    target: 'COLLECTION',
    event_id: raw.event_id,
    request_id: raw.request_id,
  };
  event.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const page of pages)
        page.postMessage({ kind: 'collection-signal', data });
      await self.registration.showNotification('Tirodhan collection update', {
        body: 'Open your account to read the latest collection status.',
        tag: raw.event_id,
        data,
      });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  if (!valid(data)) return;
  event.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: 'window' });
      for (const page of pages) {
        page.postMessage({ kind: 'collection-tap', data });
        await page.focus();
        return;
      }
      await self.clients.openWindow('/account/notifications');
    })(),
  );
});
