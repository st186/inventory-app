// Dev-only preview of the WP8 polish screens that the other previews don't reach with data, on
// made-up figures, so they can be checked without signing in. Not in the production build
// (vite build only bundles index.html).
//
//   /polish-preview.html?screen=salesdata            Insights > Items > daily sales data
//   /polish-preview.html?screen=sync                 the status line under the top bar, every state
//   /polish-preview.html?screen=production           Insights > Production alone (&period=lastMonth, &house=PH-1)
//     &role=owner|store-incharge   &lang=en|bn|hi   &empty=1 (no sales records)
//
// Requests to the app's server are answered here from src/gallery/insightsMock.ts; nothing leaves
// the browser. A stand-in session is put in this origin's storage only when there is none.
import { createRoot } from 'react-dom/client';
import { Suspense, lazy, useMemo, useState, type ComponentType } from 'react';
import { buildInsightsMock } from './insightsMock';
import { projectId } from '../utils/supabase/info';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import { PageHeader } from '../components/ui/page-header';
import { LanguageOverride, type Lang } from '../utils/i18n';
import type { InventoryContextType } from '../App';
import '../styles/fonts.css';
import '../index.css';

const params = new URLSearchParams(location.search);
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const mock = buildInsightsMock(today);

const AUTH_KEY = `sb-${projectId}-auth-token`;
if (!localStorage.getItem(AUTH_KEY)) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  localStorage.setItem(AUTH_KEY, JSON.stringify({
    access_token: 'preview-token', refresh_token: 'preview-refresh', token_type: 'bearer', expires_in: 7 * 86400, expires_at: exp,
    user: { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {} },
  }));
}

// Day records of momo pieces by type, half from the POS sync and half from uploaded files.
const salesRecords = params.get('empty') === '1' ? [] : (mock.context.categorySalesData as any[]).map((r, i) => ({
  ...r,
  storeName: mock.stores.find((s) => s.id === r.storeId)?.name,
  uploadedBy: i % 3 === 0 ? 'Store Incharge Demo' : 'pos-sync',
  uploadedAt: `${r.date}T23:10:00.000Z`,
}));
const MENU_PRICES = [
  ['1101', 'Chicken Steamed Momo', 'Chicken Momos', 120, 135], ['1102', 'Chicken Fried Momo', 'Chicken Momos', 140, 155],
  ['1103', 'Chicken Cheese Momo', 'Chicken Cheese Momos', 160, 179], ['1104', 'Veg Steamed Momo', 'Veg Momos', 100, 115],
  ['1105', 'Paneer Momo', 'Paneer Momos', 130, 149], ['1106', 'Corn Cheese Momo', 'Corn Cheese Momos', 140, 155],
  ['1107', 'Chicken Kurkure Momo', 'Chicken Kurkure Momos', 170, 189], ['1108', 'Veg Kurkure Momo', 'Veg Kurkure Momos', 150, 169],
].map(([productId, productName, momoCategory, offlinePrice, onlinePrice]) => ({ productId, productName, momoCategory, piecesPerUnit: 6, offlinePrice, onlinePrice, updatedBy: 'demo', updatedAt: today }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.hostname.endsWith('supabase.co')) return realFetch(input, init);
  if (url.pathname.includes('/auth/v1/')) return json({});
  const path = url.pathname.replace(/^.*\/make-server-c2dd9b9d/, '');
  const q = url.searchParams;
  await new Promise((r) => setTimeout(r, 150));
  // The sync demo's expenses: the signal "drops" while they are sent, so they stay waiting.
  if (path === '/inventory' && init?.method === 'POST') throw new TypeError('Failed to fetch');
  switch (path) {
    case '/sales-data': return json({ data: salesRecords });
    case '/momo-plate-config': return json({ config: {} });
    case '/menu-item-prices': return json({ items: MENU_PRICES });
    case '/order-item-detail': return json({ records: mock.orderItemDetail(q.get('startDate') || today, q.get('endDate') || today, q.get('storeId') || undefined) });
    case '/stores': return json({ stores: mock.stores });
    case '/payouts': return json({ payouts: mock.payouts });
    case '/employees': return json({ employees: mock.employees });
    case '/archived-employees': return json({ employees: [] });
    case '/online-loans': return json({ loans: mock.loans });
    case '/production-ledger': return json({ entries: mock.productionLedger(q.get('from') || today, q.get('to') || today) });
    default: return json({});
  }
};

// &old=1 renders a pre-WP8 copy of the screen for the number check, when one has been put next to
// it as components/__wp8old_SalesData.tsx (never committed).
const OLD = import.meta.glob('../components/__wp8old_SalesData.tsx');
const SalesData = lazy<ComponentType<any>>(() =>
  params.get('old') === '1' && OLD['../components/__wp8old_SalesData.tsx']
    ? (OLD['../components/__wp8old_SalesData.tsx']() as Promise<any>).then((m) => ({ default: m.SalesData }))
    : import('../components/SalesData').then((m) => ({ default: m.SalesData })),
);
const SyncStatusDemo = lazy(() => import('./polishSyncDemo').then((m) => ({ default: m.SyncStatusDemo })));
const ProductionDemo = lazy(() => import('./polishProductionDemo').then((m) => ({ default: m.ProductionDemo })));

const owner = mock.context.user!;
const USERS: Record<string, InventoryContextType['user']> = {
  owner,
  'store-incharge': { ...owner, email: 'store@example.test', name: 'Store Incharge Demo', role: 'employee', designation: 'store_incharge', storeId: 'STORE-1' },
  ops: { ...owner, email: 'ops@example.test', name: 'Ops Manager Demo', role: 'manager', designation: null },
};

function Preview() {
  const screen = params.get('screen') || 'salesdata';
  const lang = (['bn', 'hi'].includes(params.get('lang') || '') ? params.get('lang') : 'en') as Lang;
  const user = USERS[params.get('role') || 'owner'] || owner;
  const context = useMemo(() => ({ ...mock.context, user }), [user]);
  const [storeId] = useState<string | null>(user?.storeId ?? null);
  return (
    <LanguageOverride lang={lang}>
      <div className="min-h-dvh bg-bg text-text" lang={lang}>
        <PageHeader title={screen === 'sync' ? 'Status line' : lang === 'bn' ? 'বিশ্লেষণ' : lang === 'hi' ? 'विश्लेषण' : 'Insights'} />
        <main className="mx-auto w-full max-w-6xl px-4 py-4 lg:px-8">
          <Suspense fallback={null}>
            {screen === 'sync' ? <SyncStatusDemo /> : screen === 'production' ? <ProductionDemo context={context} /> : <SalesData context={context} selectedStoreId={storeId} />}
          </Suspense>
        </main>
      </div>
      <Toaster />
      <ConfirmProvider />
    </LanguageOverride>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
