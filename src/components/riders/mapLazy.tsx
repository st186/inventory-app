import { lazy } from 'react';

// The map library (leaflet, ~150 KB) loads only when a live map or a custom-location picker is
// actually on screen, not with the rider's home screen; a same-size grey box holds the space.
export const RiderMap = lazy(() => import('../RiderMap').then((m) => ({ default: m.RiderMap })));
export const LocationPicker = lazy(() => import('../LocationPicker').then((m) => ({ default: m.LocationPicker })));
export const MapPlaceholder = ({ height }: { height: number }) => (
  <div style={{ height, width: '100%' }} className="rounded-xl border border-gray-200 bg-gray-100 animate-pulse" aria-hidden="true" />
);
