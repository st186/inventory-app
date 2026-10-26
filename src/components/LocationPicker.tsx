import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Geolocation } from '@capacitor/geolocation';

export type PickedLocation = { latitude: number; longitude: number };

type LocationPickerProps = {
  value: PickedLocation | null;
  onChange: (value: PickedLocation) => void;
  // Where to centre the map before anything is picked (e.g. the production house).
  centerHint?: PickedLocation | null;
  height?: number;
};

type SearchResult = { display_name: string; lat: string; lon: string };

// Pick a one-off location (an event stall, say) for a custom ride: search an address, tap the map,
// or use the phone's current position. Search uses OpenStreetMap's free Nominatim service.
export function LocationPicker({ value, onChange, centerHint = null, height = 240 }: LocationPickerProps) {
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
    // Leaflet's default marker image doesn't resolve through the bundler - use a plain dot.
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;border-radius:50%;background:#7c3aed;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
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
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) { toast.error('Type at least 3 letters of the place'); return; }
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`);
      const list: SearchResult[] = res.ok ? await res.json() : [];
      setResults(list);
      if (list.length === 0) toast.error('No match - try a nearby landmark, or tap the map');
    } catch {
      toast.error('Search is unavailable right now - tap the map instead');
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
      toast.error('Could not get your location - check location permission');
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          placeholder="Search the place (e.g. Rose Garden, Burdwan)"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button type="button" onClick={search} disabled={searching} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50 flex items-center gap-1.5">
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Search
        </button>
        <button type="button" onClick={useMyLocation} disabled={locating} className="px-3 py-2 rounded-lg bg-orange-50 text-orange-700 text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5" aria-label="Use my current location">
          {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />} Here
        </button>
      </div>
      {results.length > 0 && (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-40 overflow-y-auto text-sm">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => choose(r)} className="w-full text-left px-3 py-2 hover:bg-gray-50">{r.display_name}</button>
            </li>
          ))}
        </ul>
      )}
      <div ref={containerRef} style={{ height, width: '100%' }} className="rounded-xl overflow-hidden border border-gray-200 z-0" />
      <p className="text-xs text-gray-500">
        {value ? `Pinned at ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)} - tap the map to move it.` : 'Search, tap the map, or use "Here" to drop the pin.'}
      </p>
    </div>
  );
}
