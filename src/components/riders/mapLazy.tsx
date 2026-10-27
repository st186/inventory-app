import { lazy } from 'react';
import { Skeleton } from '../ui/skeleton';

// The map library (leaflet, ~150 KB) loads only when a live map or a custom-location picker is
// actually on screen, not with the rider's home screen; a same-size placeholder holds the space.
export const RiderMap = lazy(() => import('../RiderMap').then((m) => ({ default: m.RiderMap })));
export const LocationPicker = lazy(() => import('../LocationPicker').then((m) => ({ default: m.LocationPicker })));
export const MapPlaceholder = ({ height }: { height: number }) => (
  <Skeleton style={{ height, width: '100%' }} className="rounded-lg" />
);
