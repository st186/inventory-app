// Dev-only preview of Insights (insights-preview.html) on made-up data, so the screens can be
// checked without signing in. Not in the production build (vite build only bundles index.html).
//
//   /insights-preview.html                       owner, all stores, English
//   ?role=owner|ops|store-incharge|production-incharge|auditor
//   &store=STORE-1     a store picked in the top bar     &lang=bn|hi   App language
//   &cash=1            Money > Cash (the cash tab on its own)
//   &events=0          the events summary answers 404 (no Events choice)
//
// Every request to the app's server is answered here from src/gallery/insightsMock.ts; nothing
// leaves the browser. A stand-in session is put in this origin's storage only when there is none.
import { createRoot } from 'react-dom/client';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { buildInsightsMock } from './insightsMock';
import { rushMock } from './rushMock';
import { projectId } from '../utils/supabase/info';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import { PageHeader } from '../components/ui/page-header';
import { IconButton } from '../components/ui/icon-button';
import { InitialsAvatar } from '../components/ui/avatar';
import { SelectChip } from '../components/ui/chip';
import { LanguageOverride, type Lang } from '../utils/i18n';
import type { InventoryContextType } from '../App';
import '../styles/fonts.css';
import '../index.css';

const params = new URLSearchParams(location.search);
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const mock = buildInsightsMock(today);

// ---- A session for this origin, so the app's request helpers send their calls -----------------
const AUTH_KEY = `sb-${projectId}-auth-token`;
if (!localStorage.getItem(AUTH_KEY)) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  localStorage.setItem(AUTH_KEY, JSON.stringify({
    access_token: 'preview-token', refresh_token: 'preview-refresh', token_type: 'bearer', expires_in: 7 * 86400, expires_at: exp,
    user: { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {} },
  }));
}

// ---- The server, answered from the made-up data -------------------------------------------------
const EVENTS_SUMMARY = {
  from: null, to: null, sales: 46200, costs: 31850, profit: 14350, momoCost: 18400, wastage: 620, itemsCost: 3100, expenses: 2730, rent: 7000, commission: 0,
  events: [
    { id: 'EV-1', name: 'Puja stall, Demo park', status: 'live', startDate: `${today.slice(0, 8)}20`, endDate: `${today.slice(0, 8)}28`, sales: 38400, costs: 25900, profit: 12500 },
    { id: 'EV-2', name: 'College fest, Demo campus', status: 'closed', startDate: `${today.slice(0, 8)}08`, endDate: `${today.slice(0, 8)}09`, sales: 7800, costs: 5950, profit: 1850 },
  ],
  byDate: Array.from({ length: 9 }, (_, i) => {
    const day = String(20 + i).padStart(2, '0');
    const sales = 3800 + ((i * 937) % 1500);
    return { date: `${today.slice(0, 8)}${day}`, sales, costs: Math.round(sales * 0.68), profit: Math.round(sales * 0.32) };
  }).filter((r) => r.date <= today),
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.hostname.endsWith('supabase.co')) return realFetch(input, init);
  if (url.pathname.includes('/auth/v1/')) return json({});
  const path = url.pathname.replace(/^.*\/make-server-c2dd9b9d/, '');
  const q = url.searchParams;
  switch (path) {
    case '/payouts': return json({ payouts: mock.payouts });
    case '/employees': return json({ employees: mock.employees });
    case '/archived-employees': return json({ employees: [] });
    case '/stores': return json({ stores: mock.stores });
    case '/online-loans': return json({ loans: mock.loans });
    case '/order-item-detail': return json({ records: mock.orderItemDetail(q.get('startDate') || '2026-03-01', q.get('endDate') || today, q.get('storeId') || undefined) });
    // Staffing, the apps' reports and the weather (GrowthCards.tsx, owner 30 Oct 2026).
    case '/insights/staffing': {
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
        days.push({ date: d, onShift: 3, staffHours: 24, wages: 1500, byHour: Array.from({ length: 24 }, (_, h) => (h >= 15 && h <= 22 ? (h >= 18 ? 3 : 2) : 0)) });
      }
      return json({ days, since: days[0].date, staff: 3 });
    }
    case '/app-reports': return json({ reports: [
      { platform: 'zomato', storeId: 'all', periodStart: '2026-10-20', periodEnd: '2026-10-26', rating: 4.1, ratingCount: 612, orders: 118, sales: 41200, menuOpens: 1890, menuToOrderPct: 6.2, impressions: 15400, prepMinutes: 14, rejectedOrders: 2, delayedOrdersPct: 4, complaints: 1, adSpend: 1500, note: 'Rating dipped from 4.2 after two late orders.', savedAt: '', savedBy: 'Owner Demo' },
      { platform: 'zomato', storeId: 'all', periodStart: '2026-10-13', periodEnd: '2026-10-19', rating: 4.2, ratingCount: 598, orders: 109, sales: 38800, menuOpens: 1700, menuToOrderPct: 6.4, impressions: 14100, prepMinutes: 16, rejectedOrders: 4, delayedOrdersPct: 6, complaints: 2, adSpend: 1500, note: '', savedAt: '', savedBy: 'Owner Demo' },
      { platform: 'swiggy', storeId: 'all', periodStart: '2026-10-20', periodEnd: '2026-10-26', rating: 4.3, ratingCount: 210, orders: 34, sales: 11800, menuOpens: 720, menuToOrderPct: 4.7, impressions: -1, prepMinutes: 12, rejectedOrders: 0, delayedOrdersPct: -1, complaints: 0, adSpend: -1, note: '', savedAt: '', savedBy: 'Owner Demo' },
    ] });
    case '/insights/weather': {
      const days = [];
      for (let i = -92; i <= 7; i++) {
        const d = new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
        const wet = i % 9 === 0 || i === 2 || i === 3;
        days.push({ date: d, rainMm: wet ? 14 : 0, rainChance: i >= 0 ? (wet ? 80 : 10) : null, maxC: 31 });
      }
      return json({ days });
    }
    case '/production-ledger': return json({ entries: mock.productionLedger(q.get('from') || today, q.get('to') || today) });
    // Rush hours and the steamer plan (RushTab.tsx, owner 1 Nov 2026).
    case '/insights/rush': return json(rushMock(today, q.get('date') || undefined));
    case '/insights/rush/settings': return json({ success: true, settings: JSON.parse(String(init?.body || '{}')) });
    case '/insights/overview': {
      // Trends: the last 90 days of the chosen store (or all) from the made-up sales.
      const storeId = q.get('storeId');
      const from = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86400_000).toISOString().slice(0, 10);
      const byDate = new Map<string, { revenue: number; pieces: Record<string, number> }>();
      for (const s of mock.context.salesData) {
        if (s.date < from || (storeId && s.storeId !== storeId)) continue;
        const d = byDate.get(s.date) || { revenue: 0, pieces: {} };
        d.revenue += (s.cashAmount || 0) + (s.paytmAmount || 0);
        byDate.set(s.date, d);
      }
      for (const c of mock.context.categorySalesData) {
        const d = byDate.get(c.date);
        if (!d || (storeId && c.storeId !== storeId)) continue;
        const keys: Record<string, string> = { 'Chicken Momos': 'chicken', 'Chicken Cheese Momos': 'chickenCheese', 'Chicken Kurkure Momos': 'chickenKurkure', 'Veg Momos': 'veg', 'Corn Cheese Momos': 'cheeseCorn', 'Paneer Momos': 'paneer', 'Veg Kurkure Momos': 'vegKurkure' };
        for (const [name, n] of Object.entries(c.data as Record<string, number>)) if (keys[name]) d.pieces[keys[name]] = (d.pieces[keys[name]] || 0) + n * 6;
      }
      const history = [...byDate.entries()].sort().map(([date, d]) => ({ date, revenue: d.revenue, pieces: d.pieces }));
      return json({ today, storeId, history, events: [], forecast: [], yesterday: { date: today, actual: null, actualPieces: null, expected: {} }, learned: {} });
    }
    case '/events/summary':
      if (params.get('events') === '0') return json({ error: 'Not found' }, 404);
      return json({ summary: { ...EVENTS_SUMMARY, from: q.get('from'), to: q.get('to') } });
    default:
      return json({});
  }
};

// ---- The page -------------------------------------------------------------------------------------
const Analytics = lazy(() => import('../components/Analytics').then((m) => ({ default: m.Analytics })));

const owner = mock.context.user!;
const USERS: Record<string, InventoryContextType['user']> = {
  owner,
  ops: { ...owner, email: 'ops@example.test', name: 'Ops Manager Demo', role: 'manager', designation: null },
  'store-incharge': { ...owner, email: 'store@example.test', name: 'Store Incharge Demo', role: 'employee', designation: 'store_incharge', storeId: 'STORE-1' },
  'production-incharge': { ...owner, email: 'prod@example.test', name: 'Kitchen Head Demo', role: 'employee', designation: 'production_incharge', storeId: 'PH-1' },
  auditor: { ...owner, email: 'audit@example.test', name: 'Audit Desk', role: 'audit', designation: null },
};

function Preview() {
  const role = params.get('role') || 'owner';
  const lang = (['bn', 'hi'].includes(params.get('lang') || '') ? params.get('lang') : 'en') as Lang;
  const user = USERS[role] || owner;
  const context = useMemo(() => ({ ...mock.context, user }), [user]);
  const [storeId, setStoreId] = useState<string | null>(params.get('store'));
  const focusCash = params.get('cash') === '1';
  const showStoreChip = role === 'owner';
  return (
    <LanguageOverride lang={lang}>
      <div className="min-h-dvh bg-bg text-text" lang={lang}>
        <PageHeader
          title={focusCash ? 'Cash & Paytm' : lang === 'bn' ? 'বিশ্লেষণ' : lang === 'hi' ? 'विश्लेषण' : 'Insights'}
          actions={
            <>
              <IconButton label="Ask Bunny" icon={<img src="/bunny-logo.png" alt="" className="size-7 object-contain" />} />
              <IconButton label="Notifications" icon={<Bell />} />
              <IconButton label="Account" icon={<InitialsAvatar name={user?.name || 'Owner Demo'} size={32} />} />
            </>
          }
        >
          {showStoreChip && (
            <div className="flex gap-2 px-4 pb-2.5">
              <SelectChip onClick={() => setStoreId(storeId ? (storeId === 'STORE-1' ? 'STORE-2' : null) : 'STORE-1')}>
                {storeId ? mock.stores.find((s) => s.id === storeId)?.name : 'All stores'}
              </SelectChip>
            </div>
          )}
        </PageHeader>
        <Suspense fallback={null}>
          <Analytics context={context} selectedStoreId={storeId} initialTab={focusCash ? 'cash-reconciliation' : null} />
        </Suspense>
      </div>
      <Toaster />
      <ConfirmProvider />
    </LanguageOverride>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);

// Screenshot helpers (taps a few controls once the screen is there):
//   &mode=Production|Events   &tab=Revenue (a tab's label)   &open=info (the profit sheet)   &y=600 (scroll)
const steps: (() => boolean)[] = [];
// A label, or a 0-based position ("2" = the third tab), so the same link works in Bengali.
const clickByText = (selector: string, text: string) => () => {
  const all = [...document.querySelectorAll<HTMLElement>(selector)];
  const el = /^\d+$/.test(text) ? all[Number(text)] : all.find((x) => x.textContent?.trim() === text);
  if (!el) return false;
  // Radix tabs switch on mouse-down, not click.
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  el.click();
  return true;
};
if (params.get('mode')) steps.push(clickByText('[role="radio"]', params.get('mode')!));
if (params.get('tab')) steps.push(clickByText('[role="tab"]', params.get('tab')!));
if (params.get('sub')) steps.push(clickByText('[role="radio"]', params.get('sub')!));
if (params.get('open') === 'info') steps.push(() => { const b = document.querySelector<HTMLElement>('[aria-label="How profit is worked out"],[aria-label="লাভ কীভাবে হিসাব হয়"]'); b?.click(); return !!b; });
if (params.get('y')) steps.push(() => { window.scrollTo(0, Number(params.get('y'))); return true; });
const run = () => {
  if (!steps.length) return;
  if (steps[0]()) steps.shift();
  setTimeout(run, steps.length ? 400 : 0);
};
setTimeout(run, 1200);
