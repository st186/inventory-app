import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapPoint = { latitude: number; longitude: number };
export type MapPlace = MapPoint & { kind: 'production' | 'store' | 'custom' | string; name?: string };

type RiderMapProps = {
  rider?: (MapPoint & { updatedAt?: string | null }) | null;
  // Every stop of the ride that has a known location (production house, store(s), custom spots).
  places?: MapPlace[];
  track?: [number, number, string][];
  height?: number;
  // Tooltip words in the viewer's language.
  labels?: { rider?: string; production?: string; stop?: string };
};

// Lucide-style line icons (24 px grid, stroke 2) drawn into the map pins: a factory for the
// production house, a shop for a store, a pin for any other stop and a scooter for the rider.
const ICON_PATHS: Record<string, string> = {
  production: '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>',
  store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
  custom: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  rider: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
};

// Pin colours come from the design tokens (CSS variables), so the map matches the app.
const PIN_COLOUR: Record<string, string> = {
  production: 'var(--primary)',
  store: 'var(--info)',
  custom: 'var(--text-2)',
  rider: 'var(--success)',
};

// A round badge with a line icon - avoids Leaflet's default marker images, which the bundler
// doesn't resolve.
const badge = (kind: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${PIN_COLOUR[kind] || PIN_COLOUR.custom};border:3px solid var(--surface);box-shadow:var(--elevation-2);display:flex;align-items:center;justify-content:center;color:var(--on-primary)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[kind] || ICON_PATHS.custom}</svg></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const placeIcon = (kind: string) => badge(kind === 'production' || kind === 'store' ? kind : 'custom');

export function RiderMap({ rider, places = [], track = [], height = 280, labels }: RiderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const placeLayersRef = useRef<Map<string, L.Marker>>(new Map());
  const riderLayerRef = useRef<L.Marker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const fittedSignatureRef = useRef('');
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([22.9, 87.8], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    // The container may not have its final size on first paint (modal/expander animating in).
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      placeLayersRef.current = new Map();
      riderLayerRef.current = null;
      trailRef.current = null;
      fittedSignatureRef.current = '';
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const words = labelsRef.current || {};

    // Stop markers: add new ones, move existing ones, drop ones that are gone.
    const wanted = new Set<string>();
    for (const place of places) {
      const key = `${place.kind}:${place.name || ''}`;
      wanted.add(key);
      const latlng: L.LatLngExpression = [place.latitude, place.longitude];
      const existing = placeLayersRef.current.get(key);
      if (existing) existing.setLatLng(latlng);
      else {
        const marker = L.marker(latlng, { icon: placeIcon(place.kind) }).addTo(map);
        marker.bindTooltip(place.name || (place.kind === 'production' ? words.production || 'Production house' : words.stop || 'Stop'), { direction: 'top', offset: [0, -16] });
        placeLayersRef.current.set(key, marker);
      }
    }
    for (const [key, marker] of placeLayersRef.current) {
      if (!wanted.has(key)) { marker.remove(); placeLayersRef.current.delete(key); }
    }

    if (!rider) {
      riderLayerRef.current?.remove();
      riderLayerRef.current = null;
    } else if (riderLayerRef.current) {
      riderLayerRef.current.setLatLng([rider.latitude, rider.longitude]);
    } else {
      riderLayerRef.current = L.marker([rider.latitude, rider.longitude], { icon: badge('rider') }).addTo(map);
      riderLayerRef.current.bindTooltip(words.rider || 'Rider', { direction: 'top', offset: [0, -16] });
    }

    trailRef.current?.remove();
    trailRef.current = null;
    const trailPoints: L.LatLngExpression[] = track.map((p) => [p[0], p[1]]);
    if (trailPoints.length > 1) {
      const trailColour = getComputedStyle(document.documentElement).getPropertyValue('--success').trim() || 'currentColor';
      trailRef.current = L.polyline(trailPoints, { color: trailColour, weight: 4, opacity: 0.7 }).addTo(map);
    }

    // Fit the view once there is something to show (and again if more pins appear) - never on
    // every position update, so a user who has panned/zoomed isn't fought.
    const points: L.LatLngExpression[] = [...places.map((p) => [p.latitude, p.longitude] as L.LatLngExpression)];
    if (rider) points.push([rider.latitude, rider.longitude]);
    const signature = `${[...wanted].sort().join('|')}#${rider ? 1 : 0}`;
    if (points.length > 0 && fittedSignatureRef.current !== signature) {
      if (points.length === 1) map.setView(points[0], 15);
      else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      fittedSignatureRef.current = signature;
    }
  }, [rider, places, track]);

  // data-vaul-no-drag: panning the map inside a bottom sheet must not drag the sheet down.
  return <div ref={containerRef} data-vaul-no-drag="" style={{ height, width: '100%' }} className="isolate z-0 overflow-hidden rounded-lg border border-border bg-surface-2" />;
}
