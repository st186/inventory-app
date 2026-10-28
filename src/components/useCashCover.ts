import { useEffect, useState } from 'react';
import type { CashCover } from '../utils/cashSource';

export type LoadCashCover = (storeId: string, date: string) => Promise<CashCover | null>;

// The store's and its production house's cash on the bill's date (see InventoryManagement's
// loadCashCover). null while loading, or when it doesn't apply.
export function useCashCover(load: LoadCashCover | undefined, storeId: string | null | undefined, date: string) {
  const [cover, setCover] = useState<CashCover | null>(null);
  useEffect(() => {
    let current = true;
    setCover(null);
    if (!load || !storeId || !date) return;
    load(storeId, date)
      .then((result) => { if (current) setCover(result); })
      .catch(() => { if (current) setCover(null); });
    return () => { current = false; };
  }, [load, storeId, date]);
  return cover;
}
