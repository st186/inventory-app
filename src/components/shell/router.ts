// Hash routes, the back stack, the Android back button and the old notification targets.
//
//   #/money/expenses?date=2026-10-27      -> { path: 'money/expenses', params: { date: '2026-10-27' } }
//
// Back (Android button, browser back, the header arrow) always walks the same ladder: close the
// open sheet or dialog -> pop the pushed page -> go to Home -> leave the app (only from Home).
//
// Old deep links - the { view, tab, highlightRequestId } targets from utils/notificationNavigation.ts,
// public/sw.js (also as ?view=&tab= in the URL) and the server's push payloads - go through
// resolveLegacyTarget, so a notification lands where its screen lives now.
//
// The top part is plain functions (tested by scripts/router-test.mjs); createBrowserHistorySync
// below wires them to window.history and @capacitor/app.
import type { NavModel } from './navConfig';
import { resolveTabPath } from './navConfig';

export type Route = { path: string; params: Record<string, string> };
export type LegacyTarget = { view: string; tab?: string | null; highlightRequestId?: string | null };

export const HOME: Route = { path: 'home', params: {} };

export function parseHash(hash: string): Route | null {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw.startsWith('/')) return null;
  const [pathPart, query = ''] = raw.slice(1).split('?');
  const path = pathPart.replace(/\/+$/, '');
  if (!path) return null;
  const params: Record<string, string> = {};
  new URLSearchParams(query).forEach((value, key) => {
    params[key] = value;
  });
  return { path, params };
}

export function formatHash(route: Route): string {
  const query = new URLSearchParams(route.params).toString();
  return `#/${route.path}${query ? `?${query}` : ''}`;
}

export const sameRoute = (a: Route, b: Route) => formatHash(a) === formatHash(b);

/** A route this login can open (a tab's own path opens its first sub-tab); otherwise Home. */
export function normalizeRoute(route: Route | null, nav: Pick<NavModel, 'destinations' | 'tabs'>): Route {
  if (!route) return HOME;
  const path = resolveTabPath(nav as NavModel, route.path);
  if (!nav.destinations[path]) return HOME;
  return { path, params: route.params || {} };
}

// --- Old { view, tab } targets -> new paths --------------------------------------------------
// Candidates in order of preference; the first this login has wins. A view with none of its
// candidates falls back to any destination that replaced that view, then to Home (where the old
// app showed its fallback dashboard).
type Candidates = (tab: string | null, hasHighlight: boolean) => string[];
export const LEGACY_ALIASES: Record<string, Candidates> = {
  // As in the old Analytics: a highlighted request means its Stock Requests tab.
  analytics: (tab, hl) => (tab === 'trends' ? ['insights'] : tab === 'production-requests' || hl ? ['stock/requests', 'production/requests', 'insights'] : ['insights', 'home']),
  'stock-requests': () => ['stock/requests', 'production/requests', 'insights'],
  inventory: () => ['money/expenses'],
  sales: () => ['money/sales'],
  production: () => ['production/batches', 'stock/production'],
  'receive-stock': () => ['stock/receive'],
  'stock-outs': () => ['stock/out-of-stock', 'production/out-of-stock'],
  attendance: (tab) => (tab && tab.startsWith('approve') ? ['team/attendance', 'my-attendance'] : ['my-attendance', 'team/attendance']),
  employees: () => ['team/people'],
  payroll: () => ['pay', 'my-pay', 'team/pay'],
  riders: () => ['stock/riders', 'production/riders'],
  'rider-profile': () => ['rider-profile'],
  workplace: (tab) => (tab === 'review' ? ['team/checks', 'my-checks'] : tab === 'setup' ? ['workplace-setup', 'team/checks', 'my-checks'] : ['my-checks', 'team/checks']),
  'my-kpis': () => ['my-kpis'],
  'team-kpis': () => ['team/kpis'],
  export: () => ['reports'],
  backup: () => ['backup'],
  assets: () => ['equipment'],
  'inventory-items': () => ['items'],
  'advanced-inventory': () => ['stock/on-hand', 'production/on-hand'],
  // Event stalls: the event id travels as `highlight` (notificationNavigation.ts), EventsDestination opens it.
  events: () => ['events'],
  complaints: () => ['complaints'],
  // Home cards (the store opening checklist).
  home: () => ['home'],
  audits: () => ['audits'],
  opening: () => ['opening'],
  contacts: () => ['contacts'],
  compliance: () => ['compliance'],
  tour: () => ['tour'],
  shopping: () => ['shopping'],
  'photo-guide': () => ['photo-guide'],
};

export function resolveLegacyTarget(target: LegacyTarget | null | undefined, nav: Pick<NavModel, 'destinations'>): Route {
  if (!target?.view) return HOME;
  const tab = target.tab || null;
  const highlight = target.highlightRequestId || null;
  const params: Record<string, string> = {};
  if (tab) params.tab = tab;
  if (highlight) params.highlight = highlight;
  const candidates = LEGACY_ALIASES[target.view]?.(tab, !!highlight) ?? [];
  let path = candidates.find((p) => !!nav.destinations[p]);
  if (!path) path = Object.values(nav.destinations).find((d) => d.legacy?.view === target.view)?.path;
  if (!path || path === 'home') return { path: 'home', params: {} };
  return { path, params };
}

// --- The back stack ---------------------------------------------------------------------------
// stack[0] is the page a tab (or Home) opened; pages pushed on top of it (a More row, the
// inbox, a detail page) pop off with Back.
export class NavStack {
  private items: Route[];
  constructor(initial: Route = HOME) {
    this.items = [initial];
  }
  get current(): Route {
    return this.items[this.items.length - 1];
  }
  get depth(): number {
    return this.items.length - 1;
  }
  get all(): readonly Route[] {
    return this.items;
  }
  /** Switch tab (or open a deep link): starts a fresh stack. */
  go(route: Route) {
    this.items = [route];
  }
  /** Open a page on top (Back returns here). */
  push(route: Route) {
    if (sameRoute(route, this.current)) return;
    this.items = [...this.items, route];
  }
  /** Change the current page in place (a sub-tab, a filter). */
  replace(route: Route) {
    this.items = [...this.items.slice(0, -1), route];
  }
  pop(): boolean {
    if (this.items.length <= 1) return false;
    this.items = this.items.slice(0, -1);
    return true;
  }
}

export type BackDecision = 'close-overlay' | 'close-dialog' | 'pop' | 'home' | 'exit';

/** The back ladder: sheet -> page -> Home -> exit. */
export function decideBack(state: { overlayOpen: boolean; dialogOpen: boolean; depth: number; atHome: boolean }): BackDecision {
  if (state.overlayOpen) return 'close-overlay';
  if (state.dialogOpen) return 'close-dialog';
  if (state.depth > 0) return 'pop';
  if (!state.atHome) return 'home';
  return 'exit';
}

/** Applies a decision to the stack. Returns what happened, so the caller can close sheets / exit. */
export function applyBack(stack: NavStack, state: { overlayOpen: boolean; dialogOpen: boolean }): BackDecision {
  const decision = decideBack({ ...state, depth: stack.depth, atHome: stack.current.path === 'home' });
  if (decision === 'pop') stack.pop();
  if (decision === 'home') stack.go(HOME);
  return decision;
}

// --- Browser + Android wiring ----------------------------------------------------------------

/** Any Radix dialog / sheet open in the page (screens' own modals). */
export function domDialogOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/** Closes the top Radix dialog the way Esc would (it also asks "Discard changes?" when dirty). */
export function closeDomDialog() {
  const target = (document.activeElement as HTMLElement | null) || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
}

/** Legacy ?view=&tab=&highlightRequestId= in the URL (sw.js opens a new window with them). */
export function readLegacySearch(search: string): LegacyTarget | null {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  if (!view) return null;
  return { view, tab: params.get('tab'), highlightRequestId: params.get('highlightRequestId') };
}

type SyncOptions = {
  /** Called for Back from any source; returns what it did ('exit' when at Home with nothing open). */
  onBack: () => BackDecision;
  /** True when Back would do something inside the app (not at Home, a page pushed, a sheet open). */
  canGoBack: () => boolean;
  /** The hash changed by other means (a link, typing the address). */
  onHashChange: (route: Route | null) => void;
};

// Keeps window.history in step with the in-app stack. The address always shows the current route
// (replaceState). While Back would do something inside the app, one extra "guard" entry sits on
// top of the history, so the browser's back button (and the Android WebView's, before the native
// back-button plugin is synced) lands in onBack instead of leaving the app.
export function createBrowserHistorySync({ onBack, canGoBack, onHashChange }: SyncOptions) {
  let guard = false;
  let ignoreNextPop = false;
  let currentHash = typeof window !== 'undefined' ? window.location.hash : '';
  let nativeBack: { remove: () => void } | null = null;
  let disposed = false;

  const write = (hash: string) => {
    currentHash = hash;
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState({ ...(window.history.state || {}), bunny: true, guard }, '', url);
  };

  const sync = (route: Route) => {
    const hash = formatHash(route);
    const wantGuard = canGoBack();
    if (wantGuard && !guard) {
      currentHash = hash;
      window.history.pushState({ bunny: true, guard: true }, '', `${window.location.pathname}${window.location.search}${hash}`);
      guard = true;
      return;
    }
    if (!wantGuard && guard) {
      // Drop the guard quietly; the popstate handler writes the address once it has gone.
      guard = false;
      ignoreNextPop = true;
      currentHash = hash;
      window.history.back();
      return;
    }
    write(hash);
  };

  const onPop = () => {
    if (ignoreNextPop) {
      ignoreNextPop = false;
      write(currentHash);
      return;
    }
    // The address now shows the entry under the guard; remember it so the hashchange event that
    // follows this popstate isn't mistaken for a typed address.
    currentHash = window.location.hash;
    if (!guard) {
      // A plain entry under ours (the page before the app): nothing to do.
      return;
    }
    guard = false;
    onBack();
    // The shell re-renders and calls sync(), which puts the guard back if still needed.
  };

  const onHash = () => {
    if (window.location.hash === currentHash) return;
    onHashChange(parseHash(window.location.hash));
  };

  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onHash);

  // Android hardware back (Capacitor). Once the listener is registered the WebView no longer goes
  // back by itself, so every press comes here; 'exit' at Home closes the app.
  (async () => {
    try {
      const core = await import('@capacitor/core');
      if (!core.Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', () => {
        const decision = onBack();
        if (decision === 'exit') App.exitApp();
      });
      if (disposed) handle.remove();
      else nativeBack = handle;
    } catch {
      // Plugin not in this build yet (needs `npx cap sync`): the history guard above still makes
      // the WebView's own back walk the same ladder.
    }
  })();

  return {
    sync,
    dispose() {
      disposed = true;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onHash);
      nativeBack?.remove();
    },
  };
}
