import { Store, MapPin, ChevronDown } from 'lucide-react';
import * as api from '../utils/api';

type StoreSelectorProps = {
  stores: api.Store[];
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
  showAllStores?: boolean;
};

export function StoreSelector({ stores, selectedStoreId, onStoreChange, showAllStores = true }: StoreSelectorProps) {
  const selectedStore = stores.find(s => s.id === selectedStoreId);
  const isAllStores = !selectedStoreId;

  return (
    <div className="relative">
      {/* Enhanced Store Selector with Gradient Background */}
      <div className="bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 rounded-xl shadow-lg p-[2px]">
        <div className="bg-white rounded-[10px] p-4">
          <div className="flex items-center gap-4">
            {/* Icon Section */}
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center">
                <Store className="w-6 h-6 text-purple-600" />
              </div>
            </div>

            {/* Store Info and Selector */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Current Store View
              </div>
              <div className="relative">
                <select
                  value={selectedStoreId || 'all'}
                  onChange={(e) => onStoreChange(e.target.value === 'all' ? null : e.target.value)}
                  className="w-full appearance-none bg-transparent border-none text-base font-semibold text-gray-900 focus:ring-0 focus:outline-none cursor-pointer pr-8"
                  style={{ paddingRight: '2rem' }}
                >
                  {showAllStores && (
                    <option value="all">🌐 All Stores (Combined View)</option>
                  )}
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      🍜 {store.name} {store.location && `- ${store.location}`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-600 pointer-events-none" />
              </div>
              {/* Location Display */}
              {selectedStore?.location && (
                <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
                  <MapPin className="w-3 h-3" />
                  <span>{selectedStore.location}</span>
                </div>
              )}
            </div>

            {/* Store Count Badge */}
            <div className="flex-shrink-0">
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 px-4 py-2 rounded-lg border border-purple-200">
                <div className="text-xs text-gray-600 text-center">Total Stores</div>
                <div className="text-2xl font-bold text-purple-600 text-center">{stores.length}</div>
              </div>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isAllStores ? 'bg-blue-500' : 'bg-green-500'} animate-pulse`}></div>
                <span className="text-gray-600">
                  {isAllStores ? 'Viewing all store data' : `Viewing ${selectedStore?.name || 'store'} only`}
                </span>
              </div>
              <span className="text-purple-600 font-medium">
                {isAllStores ? stores.length : 1} store{(isAllStores && stores.length !== 1) || (!isAllStores && false) ? 's' : ''} active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Optional: Quick Store Pills for faster switching */}
      {stores.length <= 5 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {showAllStores && (
            <button
              onClick={() => onStoreChange(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isAllStores
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🌐 All Stores
            </button>
          )}
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => onStoreChange(store.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedStoreId === store.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🍜 {store.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
