import { useCallback, useEffect, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Geolocation } from '@capacitor/geolocation';
import * as api from '../../utils/api';
import type { RiderPlace } from '../../utils/api';

// Dispatch roles pin the production house and each store on the map by standing there and
// tapping "Use my location here".
export function MapPins() {
  const [places, setPlaces] = useState<RiderPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getRiderPlaces().then(setPlaces).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const pin = async (place: RiderPlace) => {
    if (!confirm(`Save your current position as the location of ${place.name}? Do this while you are standing at the ${place.kind === 'store' ? 'store' : 'production house'}.`)) return;
    setBusyKey(`${place.kind}:${place.id}`);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
      await api.setRiderPlace({ kind: place.kind, id: place.id, latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      toast.success(`${place.name} pinned`);
      load();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : 'Could not get your location - check location permission');
    } finally {
      setBusyKey(null);
    }
  };

  const missing = places.filter((p) => p.latitude === null).length;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 mb-6">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="font-semibold text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-orange-600" /> Map pins</span>
        <span className={`text-xs px-2.5 py-1 rounded-full ${missing > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {places.length === 0 ? '...' : missing > 0 ? `${missing} not set` : 'All set'}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">The live map needs the production house and each store pinned once. Open this on a phone while standing at the place, then tap its button.</p>
          {places.map((p) => (
            <div key={`${p.kind}:${p.id}`} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.kind === 'store' ? '🏪' : '🏭'} {p.name}</p>
                <p className="text-xs text-gray-500">{p.latitude !== null ? `Pinned${p.setByName ? ` by ${p.setByName}` : ''}` : 'Not pinned yet'}</p>
              </div>
              <button
                onClick={() => pin(p)}
                disabled={busyKey === `${p.kind}:${p.id}`}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
              >
                {busyKey === `${p.kind}:${p.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
                {p.latitude !== null ? 'Update here' : 'Use my location here'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
