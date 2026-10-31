// "Load again" for the screen in view (owner, 31 Oct 2026: pull down instead of the top-right
// Refresh). App.tsx reloads the business data itself; screens that fetch their own (cameras,
// photo checks, deliveries, rider trips...) listen with useRefreshSignal(load).
import { useEffect, useRef } from 'react';

const EVENT = 'bunny:refresh';

export function sendRefresh() {
  window.dispatchEvent(new Event(EVENT));
}

export function useRefreshSignal(load: () => unknown) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    const onRefresh = () => { latest.current(); };
    window.addEventListener(EVENT, onRefresh);
    return () => window.removeEventListener(EVENT, onRefresh);
  }, []);
}
