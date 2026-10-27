import { useEffect, useRef } from 'react';

// Is the app in front of the person? On the web: the tab is visible. In the Android app: the
// activity hasn't been paused. Android's WebView reports a hidden page when the app goes to the
// background, and Capacitor also fires cordova-style 'pause' / 'resume' events on document; both
// are watched, because the rider location service keeps JavaScript running in the background
// and some WebViews only send one of the two.

let paused = false;
const listeners = new Set<(visible: boolean) => void>();

function computeVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return !paused && document.visibilityState !== 'hidden';
}

let lastVisible = computeVisible();

function notify() {
  const visible = computeVisible();
  if (visible === lastVisible) return;
  lastVisible = visible;
  listeners.forEach((listener) => listener(visible));
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', notify);
  document.addEventListener('pause', () => { paused = true; notify(); });
  document.addEventListener('resume', () => { paused = false; notify(); });
}

export function isAppVisible(): boolean {
  return computeVisible();
}

// Called with true when the app comes back to the front and false when it goes away.
export function onAppVisibilityChange(listener: (visible: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// setInterval that only ticks while the app is in front (no polling or re-rendering from a
// phone in someone's pocket). On return it runs straight away if at least `resumeAfterMs`
// (default: one interval) has passed since the last run, then carries on. The first run is the
// caller's own load on mount; the interval starts counting from then. The callback may change
// between renders without restarting the timer. `intervalMs` null turns it off.
export function useForegroundInterval(callback: () => void, intervalMs: number | null, options: { resumeAfterMs?: number } = {}) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const resumeAfterMs = options.resumeAfterMs ?? intervalMs ?? 0;

  useEffect(() => {
    if (intervalMs == null) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastRun = Date.now();
    const run = () => { lastRun = Date.now(); callbackRef.current(); };
    const start = () => { if (!timer) timer = setInterval(run, intervalMs); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const off = onAppVisibilityChange((visible) => {
      if (!visible) { stop(); return; }
      if (Date.now() - lastRun >= resumeAfterMs) run();
      start();
    });
    if (isAppVisible()) start();
    return () => { off(); stop(); };
  }, [intervalMs, resumeAfterMs]);
}
