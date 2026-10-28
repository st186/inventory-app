// React side of ./router.ts: the current route, the back stack and the browser / Android wiring
// for one signed-in person's navigation.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavModel } from './navConfig';
import {
  HOME,
  NavStack,
  applyBack,
  closeDomDialog,
  createBrowserHistorySync,
  domDialogOpen,
  normalizeRoute,
  parseHash,
  readLegacySearch,
  resolveLegacyTarget,
  type BackDecision,
  type LegacyTarget,
  type Route,
} from './router';

export type ShellRouter = {
  route: Route;
  depth: number;
  /** Switch tab or open a deep link (fresh stack). */
  go: (path: string, params?: Record<string, string>) => void;
  /** Open a page on top of the current one. */
  push: (path: string, params?: Record<string, string>) => void;
  /** Change the current page's params (or path) in place. */
  replace: (path: string, params?: Record<string, string>) => void;
  back: () => BackDecision;
  openLegacyTarget: (target: LegacyTarget) => void;
};

type Options = {
  /** Shell sheets (account, Bunny chat, store picker): open, and how to close the top one. */
  overlayOpen: boolean;
  closeOverlay: () => void;
  /** Use window.history / the hash (off in the role preview, which shows several shells). */
  syncBrowser?: boolean;
  initialRoute?: Route;
};

function initialRouteFor(nav: NavModel, syncBrowser: boolean, fallback?: Route): Route {
  if (!syncBrowser || typeof window === 'undefined') return normalizeRoute(fallback ?? HOME, nav);
  const legacy = readLegacySearch(window.location.search);
  if (legacy) {
    // Opened from a web push (public/sw.js): drop the query so a reload doesn't repeat it.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`);
    return resolveLegacyTarget(legacy, nav);
  }
  return normalizeRoute(parseHash(window.location.hash), nav);
}

export function useShellRouter(nav: NavModel, { overlayOpen, closeOverlay, syncBrowser = true, initialRoute }: Options): ShellRouter {
  const stackRef = useRef<NavStack | null>(null);
  if (!stackRef.current) stackRef.current = new NavStack(initialRouteFor(nav, syncBrowser, initialRoute));
  const stack = stackRef.current;
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const navRef = useRef(nav);
  navRef.current = nav;
  const overlayRef = useRef({ overlayOpen, closeOverlay });
  overlayRef.current = { overlayOpen, closeOverlay };

  // The person's designation can arrive after the first frame (their staff record): drop pages
  // they can no longer open.
  useEffect(() => {
    const valid = stack.all.filter((r) => !!nav.destinations[r.path]);
    if (valid.length !== stack.all.length) {
      stack.go(valid[0] ?? HOME);
      for (const r of valid.slice(1)) stack.push(r);
      bump();
    }
  }, [nav, stack, bump]);

  const back = useCallback((): BackDecision => {
    const { overlayOpen: open, closeOverlay: close } = overlayRef.current;
    const decision = applyBack(stack, { overlayOpen: open, dialogOpen: domDialogOpen() });
    if (decision === 'close-overlay') close();
    if (decision === 'close-dialog') closeDomDialog();
    bump();
    return decision;
  }, [stack, bump]);

  const go = useCallback((path: string, params: Record<string, string> = {}) => {
    stack.go(normalizeRoute({ path, params }, navRef.current));
    bump();
  }, [stack, bump]);
  const push = useCallback((path: string, params: Record<string, string> = {}) => {
    stack.push(normalizeRoute({ path, params }, navRef.current));
    bump();
  }, [stack, bump]);
  const replace = useCallback((path: string, params: Record<string, string> = {}) => {
    stack.replace(normalizeRoute({ path, params }, navRef.current));
    bump();
  }, [stack, bump]);
  const openLegacyTarget = useCallback((target: LegacyTarget) => {
    stack.go(resolveLegacyTarget(target, navRef.current));
    bump();
  }, [stack, bump]);

  // Browser history + Android back button.
  const syncRef = useRef<ReturnType<typeof createBrowserHistorySync> | null>(null);
  useEffect(() => {
    if (!syncBrowser) return;
    const sync = createBrowserHistorySync({
      onBack: () => back(),
      canGoBack: () => stack.depth > 0 || stack.current.path !== 'home' || overlayRef.current.overlayOpen,
      onHashChange: (route) => {
        stack.go(normalizeRoute(route, navRef.current));
        bump();
      },
    });
    syncRef.current = sync;
    sync.sync(stack.current);
    return () => {
      sync.dispose();
      syncRef.current = null;
    };
  }, [syncBrowser, stack, back, bump]);

  const current = stack.current;
  useEffect(() => {
    syncRef.current?.sync(current);
    // overlayOpen changes whether the guard entry is needed
  }, [current, version, overlayOpen]);

  return useMemo(
    () => ({ route: current, depth: stack.depth, go, push, replace, back, openLegacyTarget }),
    // version: the stack is mutable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, version, go, push, replace, back, openLegacyTarget],
  );
}
