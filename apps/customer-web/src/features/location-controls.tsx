import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CustomerExperience } from './customer-model';
import { currentLocation, approvedMap } from '../platform/location';
import { userMessage } from '../parity/api/errors';
import type { Location } from '../api/contracts';
export function LocationControls({ model }: { model: CustomerExperience }) {
  const draft = useSyncExternalStore(model.subscribe, model.snapshot);
  const [search, setSearch] = useState(''),
    [suggested, setSuggested] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const [latitude, setLatitude] = useState(''),
    [longitude, setLongitude] = useState('');
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    mapElement = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<Location | null>(draft.currentLocation);
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!mapElement.current || !approvedMap(model.options.map)) return;
    const node = mapElement.current;
    let active = true,
      remove = () => {};
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([L]) => {
        if (!active) return;
        const config = model.options.map!;
        const p = model.snapshot().currentLocation;
        const map = L.map(node, {
          center: p ? [p.latitude, p.longitude] : [20.59, 78.96],
          zoom: p ? 15 : 4,
          scrollWheelZoom: false,
        });
        const attribution = config.attribution
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
        L.tileLayer(config.tileUrl, { attribution, maxZoom: 18 }).addTo(map);
        let marker: L.CircleMarker | undefined;
        if (p)
          marker = L.circleMarker([p.latitude, p.longitude], {
            radius: 7,
          }).addTo(map);
        map.on('click', (event) => {
          if (!active || !model.current()) return;
          const next = {
            latitude: event.latlng.lat,
            longitude: event.latlng.lng,
          };
          marker?.remove();
          marker = L.circleMarker(event.latlng, { radius: 7 }).addTo(map);
          setPoint(next);
          model.setLocation(next);
          setSuggested(
            'Confirm the complete address manually for this selected pin.',
          );
        });
        remove = () => map.remove();
      })
      .catch(() => {
        if (active) setError(new Error('Map unavailable'));
      });
    return () => {
      active = false;
      remove();
    };
  }, [model, draft.currentLocation]);
  async function locate() {
    if (busy) return;
    const gen = ++generation.current;
    request.current?.abort();
    request.current = new AbortController();
    setBusy(true);
    setError(undefined);
    try {
      const p = await currentLocation(
        navigator.geolocation,
        request.current.signal,
      );
      if (gen !== generation.current || !model.current()) return;
      model.setLocation(p);
      setPoint(p);
      if (model.options.geocoder) {
        const text = await model.options.geocoder.reverse(
          p,
          request.current.signal,
        );
        if (gen === generation.current && model.current())
          setSuggested(text ?? 'Enter your complete address manually.');
      } else
        setSuggested(
          'Location found. Enter your complete address manually; no reverse-geocoder is approved.',
        );
    } catch (e) {
      if (gen === generation.current) setError(e);
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  async function find() {
    if (!model.options.geocoder || !search.trim() || busy) return;
    const gen = ++generation.current;
    request.current?.abort();
    request.current = new AbortController();
    setBusy(true);
    setError(undefined);
    try {
      const rows = await model.options.geocoder.search(
        search.trim(),
        request.current.signal,
      );
      if (gen !== generation.current || !model.current()) return;
      if (!rows[0]) {
        setSuggested('No match. Add the address manually.');
        return;
      }
      setPoint(rows[0].location);
      model.setLocation(rows[0].location);
      setSuggested(rows[0].address);
    } catch (e) {
      if (gen === generation.current) setError(e);
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  return (
    <section className="location-panel">
      <h2>Find a pickup location</h2>
      <p>
        Manual address entry always remains available. Location is requested
        only when you choose the button below.
      </p>
      <div className="actions">
        <button
          className="button secondary small"
          disabled={busy}
          onClick={() => void locate()}
        >
          Use current location
        </button>
        <label>
          Search area, landmark or address
          <input
            value={search}
            maxLength={2000}
            onChange={(e) => {
              generation.current++;
              request.current?.abort();
              setBusy(false);
              setSearch(e.target.value);
            }}
          />
        </label>
        <button
          disabled={busy || !model.options.geocoder || !search.trim()}
          onClick={() => void find()}
        >
          Search location
        </button>
      </div>
      {!model.options.geocoder && (
        <p className="fine">
          Map search awaits an approved geocoding connection. Use saved-address
          search or manual entry.
        </p>
      )}
      {approvedMap(model.options.map) ? (
        <div
          className="browser-map"
          ref={mapElement}
          aria-label="Pickup location map"
        />
      ) : (
        <p className="fine">
          Interactive map tiles await approved provider/privacy configuration.
        </p>
      )}
      {point && (
        <p role="status">
          A location point is selected for optional distance confirmation. It is
          not automatically attached to an edited address.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const latitudeValue = Number(latitude),
            longitudeValue = Number(longitude);
          if (
            !latitude.trim() ||
            !longitude.trim() ||
            !Number.isFinite(latitudeValue) ||
            Math.abs(latitudeValue) > 90 ||
            !Number.isFinite(longitudeValue) ||
            Math.abs(longitudeValue) > 180
          ) {
            setError(new Error('Invalid location'));
            return;
          }
          generation.current++;
          request.current?.abort();
          setBusy(false);
          const p = { latitude: latitudeValue, longitude: longitudeValue };
          setPoint(p);
          model.setLocation(p);
          setError(undefined);
        }}
      >
        <details>
          <summary>Choose a pin with coordinates</summary>
          <p>
            Optional keyboard alternative to selecting the map. Coordinates
            alone do not confirm serviceability.
          </p>
          <label>
            Latitude
            <input
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
          <button type="submit">Select location pin</button>
        </details>
      </form>
      {suggested && <p>{suggested}</p>}
      {error !== undefined && (
        <p className="error" role="alert">
          {userMessage(error)}
        </p>
      )}
    </section>
  );
}
