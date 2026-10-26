import { memo } from 'react';
import { Store, MapPin, ChevronDown } from 'lucide-react';
import * as api from '../utils/api';

type StoreSelectorProps = {
  stores: api.Store[];
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
  showAllStores?: boolean;
};

export const StoreSelector = memo(function StoreSelector({ stores, selectedStoreId, onStoreChange, showAllStores = true }: StoreSelectorProps) {
  const selectedStore = stores.find(s => s.id === selectedStoreId);
  const isAllStores = !selectedStoreId;

  return (
    <div className="relative">
      {/* The single store selector for the whole app - used to also be paired with a
          second "quick pills" row right below doing the exact same job, plus a third,
          separate dropdown duplicated inside Analytics. Consolidated down to just this
          one control (see Analytics.tsx for the other removal). Restyled to the same
          dark-hero/icon-chip language as Analytics.tsx's other header cards, instead of
          the pale gradient-border card it used to be. */}
      <div className="relative overflow-hidden rounded-2xl shadow-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="absolute -top-14 -right-8 w-40 h-40 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-4">
          {/* Icon Section */}
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/40">
              <Store className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Store Info and Selector */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
              Current Store View
            </div>
            <div className="relative">
              <select
                value={selectedStoreId || 'all'}
                onChange={(e) => onStoreChange(e.target.value === 'all' ? null : e.target.value)}
                className="w-full appearance-none bg-transparent border-none text-base font-semibold text-white focus:ring-0 focus:outline-none cursor-pointer pr-8"
                style={{ paddingRight: '2rem' }}
              >
                {showAllStores && (
                  <option value="all" style={{ color: '#111827', backgroundColor: '#ffffff' }}>🌐 All Stores (Combined View)</option>
                )}
                {stores.map((store) => (
                  <option key={store.id} value={store.id} style={{ color: '#111827', backgroundColor: '#ffffff' }}>
                    🍜 {store.name} {store.location && `- ${store.location}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-400 pointer-events-none" />
            </div>
            {/* Location Display */}
            {selectedStore?.location && (
              <div className="flex items-center gap-1 mt-1 text-sm text-slate-400">
                <MapPin className="w-3 h-3" />
                <span>{selectedStore.location}</span>
              </div>
            )}
          </div>

          {/* Store Count Badge */}
          <div className="flex-shrink-0">
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10">
              <div className="text-[11px] text-slate-400 text-center">Total Stores</div>
              <div className="text-2xl font-bold text-white text-center">{stores.length}</div>
            </div>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="relative mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isAllStores ? 'bg-blue-400' : 'bg-emerald-400'} animate-pulse`}></div>
              <span className="text-slate-400">
                {isAllStores ? 'Viewing all store data' : `Viewing ${selectedStore?.name || 'store'} only`}
              </span>
            </div>
            <span className="text-orange-400 font-medium">
              {isAllStores ? stores.length : 1} store{(isAllStores && stores.length !== 1) || (!isAllStores && false) ? 's' : ''} active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
