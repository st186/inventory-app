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
};

// A round coloured badge with an emoji - avoids Leaflet's default marker images, which the
// bundler doesn't resolve.
const badge = (emoji: string, color: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:17px;line-height:1">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const placeIcon = (kind: string) =>
  kind === 'production' ? badge('🏭', '#ea580c') : kind === 'store' ? badge('🏪', '#2563eb') : badge('📍', '#7c3aed');

export function RiderMap({ rider, places = [], track = [], height = 280 }: RiderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const placeLayersRef = useRef<Map<string, L.Marker>>(new Map());
  const riderLayerRef = useRef<L.Marker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const fittedSignatureRef = useRef('');

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
        marker.bindTooltip(place.name || (place.kind === 'production' ? 'Production house' : 'Stop'), { direction: 'top', offset: [0, -16] });
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
      riderLayerRef.current = L.marker([rider.latitude, rider.longitude], { icon: badge('🛵', '#16a34a') }).addTo(map);
      riderLayerRef.current.bindTooltip('Rider', { direction: 'top', offset: [0, -16] });
    }

    trailRef.current?.remove();
    trailRef.current = null;
    const trailPoints: L.LatLngExpression[] = track.map((p) => [p[0], p[1]]);
    if (trailPoints.length > 1) {
      trailRef.current = L.polyline(trailPoints, { color: '#16a34a', weight: 4, opacity: 0.7 }).addTo(map);
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

  return <div ref={containerRef} style={{ height, width: '100%' }} className="rounded-xl overflow-hidden border border-gray-200 z-0" />;
}
