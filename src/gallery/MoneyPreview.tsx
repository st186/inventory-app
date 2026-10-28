// Dev-only preview of the Money screens (money-preview.html) on made-up data, so they can be
// checked without signing in. Not part of the production build.
//
//   /money-preview.html?role=store-incharge&view=sales&state=notStarted&lang=bn
//     role   store-incharge | store-incharge-manager | owner | ops-manager | production-incharge
//     view   sales | expenses | payouts | loans | cash
//     state  notStarted | submitted | approved | rejected   (today's day close)
//     lang   en | bn | hi
//
// The real SalesManagement / SalesView / InventoryManagement render inside a stand-in for the
// shell (top bar with the Money sub-tabs, bottom navigation). API calls are answered by
// moneyPreviewData.ts; nothing reaches a server.
import * as React from 'react';
import { House, LayoutGrid, Package, Users, Wallet } from 'lucide-react';
import { ShellProvider, type ShellContextValue } from '../components/shell/ShellContext';
import { buildNav } from '../components/shell/navConfig';
import { PREVIEW_PERSONAS } from './ShellPreview';
import { LanguageOverride, useT, type Lang, type I18nKey } from '../utils/i18n';
import { InventoryManagement } from '../components/InventoryManagement';
import { SalesManagement } from '../components/SalesManagement';
import { SalesView } from '../components/SalesView';
import { STORES, TODAY, mockContext } from './moneyPreviewData';

type View = 'sales' | 'expenses' | 'payouts' | 'loans' | 'cash';
type SaleState = 'notStarted' | 'submitted' | 'approved' | 'rejected';

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const lang = p.get('lang');
  return {
    role: p.get('role') || 'store-incharge',
    view: (p.get('view') || 'sales') as View,
    state: (p.get('state') || 'notStarted') as SaleState,
    lang: (lang === 'bn' || lang === 'hi' ? lang : 'en') as Lang,
  };
}

const PATH_FOR: Record<View, string> = { sales: 'money/sales', expenses: 'money/expenses', payouts: 'money/payouts', loans: 'money/loans', cash: 'money/cash' };

function Chrome({ subs, active, onPick, children }: { subs: { view: View; label: string }[]; active: View; onPick: (v: View) => void; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-(--z-nav) border-b border-border bg-surface">
        <div className="flex h-14 items-center px-4">
          <span className="flex-1 text-title font-semibold">{t('nav.money')}</span>
          <span className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-label font-semibold">SD</span>
        </div>
        {subs.length > 1 && (
          <nav className="no-scrollbar flex gap-5 overflow-x-auto px-4" aria-label="Money sections">
            {subs.map((s) => (
              <button
                key={s.view}
                type="button"
                onClick={() => onPick(s.view)}
                className={s.view === active ? 'h-11 shrink-0 border-b-2 border-primary text-body-sm font-semibold text-text' : 'h-11 shrink-0 border-b-2 border-transparent text-body-sm font-medium text-text-2'}
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main className="pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+8px)] md:pb-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-(--z-nav) flex h-(--bottom-nav-h) border-t border-border bg-surface md:hidden" aria-label="Main">
        {[{ icon: House, label: t('nav.today') }, { icon: Package, label: t('nav.stock') }, { icon: Wallet, label: t('nav.money'), on: true }, { icon: Users, label: t('nav.team') }, { icon: LayoutGrid, label: t('nav.more') }].map((it) => (
          <span key={it.label} className={it.on ? 'flex flex-1 flex-col items-center justify-center gap-0.5 text-caption font-semibold text-primary' : 'flex flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium text-text-2'}>
            <span className={it.on ? 'flex h-8 w-14 items-center justify-center rounded-full bg-primary-soft' : 'flex h-8 w-14 items-center justify-center'}><it.icon className="size-5" /></span>
            {it.label}
          </span>
        ))}
      </nav>
    </div>
  );
}

export function MoneyPreview() {
  const initial = React.useMemo(readParams, []);
  const [view, setView] = React.useState<View>(initial.view);
  const persona = PREVIEW_PERSONAS.find((p) => p.id === initial.role) ?? PREVIEW_PERSONAS[2];
  const nav = React.useMemo(() => buildNav(persona.user, { today: TODAY, storeCount: STORES.length }), [persona]);
  const context = React.useMemo(() => mockContext(persona.user, initial.state), [persona, initial.state]);
  const money = nav.tabs.find((tab) => tab.path === 'money');
  const subs = (money?.subs ?? []).map((path) => ({ path, view: (Object.keys(PATH_FOR) as View[]).find((v) => PATH_FOR[v] === path)! }))
    .filter((s) => s.view);

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('view', view);
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
  }, [view]);

  const shell = {
    nav,
    router: { go: () => undefined, push: () => undefined, replace: () => undefined, back: () => undefined, openLegacyTarget: () => undefined },
    user: persona.user,
    context,
    stores: STORES,
    employees: [],
    selectedStoreId: persona.user.role === 'cluster_head' ? 'STORE-1' : null,
    setSelectedStoreId: () => undefined,
    refreshStores: async () => undefined,
    openAccount: () => undefined,
    openBunny: () => undefined,
  } as unknown as ShellContextValue;

  const dest = nav.destinations[PATH_FOR[view]];
  const spec = dest?.spec as { screen: string; tab?: 'entry' | 'payout' | 'loans' | 'cash' } | undefined;
  let screen: React.ReactNode = <p className="p-4 text-body-sm text-text-2">This role has no {view} tab.</p>;
  if (spec?.screen === 'SalesManagement') screen = <SalesManagement key={view} context={context} selectedStoreId={shell.selectedStoreId} initialTab={spec.tab === 'cash' ? 'entry' : spec.tab ?? 'entry'} />;
  else if (spec?.screen === 'SalesView') screen = <SalesView key={view} context={context} selectedStoreId={shell.selectedStoreId} initialTab={spec.tab ?? 'entry'} />;
  else if (spec?.screen === 'InventoryManagement') screen = <InventoryManagement key={view} context={context} selectedStoreId={shell.selectedStoreId} employees={[]} />;
  else if (view === 'cash') screen = <SalesView key={view} context={context} selectedStoreId={shell.selectedStoreId} initialTab="cash" />;

  return (
    <LanguageOverride lang={initial.lang}>
      <ShellProvider value={shell}>
        <LabelledChrome subs={subs} nav={nav} active={view} onPick={setView}>
          {screen}
        </LabelledChrome>
      </ShellProvider>
    </LanguageOverride>
  );
}

function LabelledChrome({ subs, nav, active, onPick, children }: { subs: { path: string; view: View }[]; nav: ReturnType<typeof buildNav>; active: View; onPick: (v: View) => void; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <Chrome subs={subs.map((s) => ({ view: s.view, label: t(nav.destinations[s.path].label as I18nKey) }))} active={active} onPick={onPick}>
      {children}
    </Chrome>
  );
}
