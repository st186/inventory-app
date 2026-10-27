import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, Search } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { toast } from './ui/sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useT } from '../utils/i18n';

export type PickedLocation = { latitude: number; longitude: number };

type LocationPickerProps = {
  value: PickedLocation | null;
  onChange: (value: PickedLocation) => void;
  // Where to centre the map before anything is picked (e.g. the production house).
  centerHint?: PickedLocation | null;
  height?: number;
};

type SearchResult = { display_name: string; lat: string; lon: string };

// Pick a one-off location (an event stall, say): search an address, tap the map, or use the
// phone's current position. Search uses OpenStreetMap's free Nominatim service. It sits inside
// the sheet that needs it (Call a rider swaps its form for this, with a "Use this place" button;
// the event form does the same), never in a sheet of its own.
export function LocationPicker({ value, onChange, centerHint = null, height = 240 }: LocationPickerProps) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  const place = (point: PickedLocation, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    const latlng: L.LatLngExpression = [point.latitude, point.longitude];
    if (markerRef.current) markerRef.current.setLatLng(latlng);
    else markerRef.current = L.marker(latlng).addTo(map);
    map.setView(latlng, zoom ?? Math.max(map.getZoom(), 16));
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = value || centerHint;
    const map = L.map(containerRef.current).setView(start ? [start.latitude, start.longitude] : [22.9, 87.8], start ? 15 : 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // Leaflet's default marker image doesn't resolve through the bundler - use a plain dot in the
    // action colour.
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;border-radius:50%;background:var(--primary);border:3px solid var(--surface);box-shadow:var(--elevation-2)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    L.Marker.prototype.options.icon = icon;
    mapRef.current = map;
    if (value) markerRef.current = L.marker([value.latitude, value.longitude]).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      const point = { latitude: e.latlng.lat, longitude: e.latlng.lng };
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      else markerRef.current = L.marker(e.latlng).addTo(map);
      onChangeRef.current(point);
    });
    const timer = setTimeout(() => map.invalidateSize(), 250);
    return () => { clearTimeout(timer); map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) { toast.error(t('loc.tooShort')); return; }
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`);
      const list: SearchResult[] = res.ok ? await res.json() : [];
      setResults(list);
      if (list.length === 0) toast.error(t('loc.noMatch'));
    } catch {
      toast.error(t('loc.searchDown'));
    } finally {
      setSearching(false);
    }
  };

  const choose = (r: SearchResult) => {
    const point = { latitude: parseFloat(r.lat), longitude: parseFloat(r.lon) };
    place(point, 16);
    onChange(point);
    setResults([]);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
      const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      place(point, 17);
      onChange(point);
    } catch {
      toast.error(t('loc.noGps'));
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          placeholder={t('loc.searchPlaceholder')}
          aria-label={t('loc.search')}
          leading={<Search />}
          wrapperClassName="flex-1"
          enterKeyHint="search"
        />
        <Button variant="secondary" size="md" className="h-12" loading={searching} onClick={search}>{t('loc.searchBtn')}</Button>
      </div>
      {results.length > 0 && (
        <ul aria-label={t('loc.results')} className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="flex min-h-12 w-full items-start gap-3 px-4 py-2.5 text-left text-body-sm text-text outline-none hover:bg-surface-2/60 focus-visible:bg-surface-2"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden="true" />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* data-vaul-no-drag: panning the map inside a bottom sheet must not drag the sheet down. */}
      <div ref={containerRef} data-vaul-no-drag="" style={{ height, width: '100%' }} className="isolate z-0 overflow-hidden rounded-lg border border-border bg-surface-2" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-label text-text-3">
          {value ? <span className="num">{t('loc.pinnedAt', { lat: value.latitude.toFixed(5), lng: value.longitude.toFixed(5) })}</span> : t('loc.howTo')}
        </p>
        <Button variant="secondary" size="md" leadingIcon={<Crosshair />} loading={locating} onClick={useMyLocation} aria-label={t('loc.hereLabel')}>
          {t('loc.here')}
        </Button>
      </div>
    </div>
  );
}
