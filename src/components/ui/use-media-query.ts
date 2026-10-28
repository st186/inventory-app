import * as React from "react";

// Live media-query match. Reads the current value on the first render (no flash of the phone
// layout on a desktop), then follows changes.

function subscribe(query: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  };
}

export function useMediaQuery(query: string): boolean {
  const sub = React.useMemo(() => subscribe(query), [query]);
  return React.useSyncExternalStore(
    sub,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Tablet and up (>= 768 px): dialogs instead of bottom sheets. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}

/** Desktop layout (>= 1024 px): sidebar, page header with primary action, tables. */
export function useIsWide(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
