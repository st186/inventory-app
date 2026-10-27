// Dev-only entry for stock-preview.html: the Stock & Production screens (WP4) on made-up data,
// no sign-in and no server. Not part of the production build (vite only bundles index.html).
//   ?view=request|request-sent|queue|oversight|batches|approvals|receive|outofstock|onhand
//   &lang=en|bn|hi   &today=YYYY-MM-DD (default 2026-11-06)   &bare=1 (no picker bar)
import './shiftDate';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '../../components/ui/sonner';
import { ConfirmProvider } from '../../components/ui/confirm';
import { LanguageOverride, type Lang } from '../../utils/i18n';
import { ProductionRequests } from '../../components/ProductionRequests';
import { ProductionManagement } from '../../components/ProductionManagement';
import { IncomingDeliveries } from '../../components/dispatch/IncomingDeliveries';
import { StockOutLog } from '../../components/StockOutLog';
import { AdvancedInventoryManagement } from '../../components/AdvancedInventoryManagement';
import { installMockServer, inventoryItems, productionData, productionHouses, salesData, seedRequests, stores } from './mockServer';
import '../../styles/fonts.css';
import '../../index.css';

type View = 'request' | 'request-sent' | 'queue' | 'oversight' | 'batches' | 'approvals' | 'receive' | 'outofstock' | 'onhand';
const VIEWS: View[] = ['request', 'request-sent', 'queue', 'oversight', 'batches', 'approvals', 'receive', 'outofstock', 'onhand'];

const p = new URLSearchParams(window.location.search);
const view = (VIEWS.includes(p.get('view') as View) ? p.get('view') : 'request') as View;
const lang = (['bn', 'hi'].includes(p.get('lang') || '') ? p.get('lang') : 'en') as Lang;
const bare = p.get('bare') === '1';

installMockServer();
const requests = seedRequests(view === 'request-sent' ? 'sent' : '');

const USERS = {
  store: { email: 'store@example.test', name: 'Nabendu', role: 'manager', designation: 'store_incharge', employeeId: 'BM001', accessToken: 'preview', storeId: 'STORE-1' },
  production: { email: 'kitchen@example.test', name: 'Sohel', role: 'manager', designation: 'production_incharge', employeeId: 'BM020', accessToken: 'preview', storeId: 'PH-1', assignedStoreIds: ['STORE-1', 'STORE-2'], assignedProductionHouseIds: ['PH-1'] },
  ops: { email: 'ops@example.test', name: 'Subrata', role: 'manager', designation: 'operations_manager', employeeId: 'BM002', accessToken: 'preview', storeId: null },
} as const;

function contextFor(user: (typeof USERS)[keyof typeof USERS]): any {
  const noop = async () => undefined;
  return {
    user, stores, productionHouses, inventoryItems, productionRequests: requests, productionData, salesData, categorySalesData: salesData,
    inventory: [
      { id: 'inv1', storeId: 'STORE-1', category: 'packaging', itemName: 'Momo Box', quantity: 9000 },
      { id: 'inv2', storeId: 'STORE-1', category: 'packaging', itemName: 'Momo Tray', quantity: 3500 },
      { id: 'inv3', storeId: 'STORE-1', category: 'beverages', itemName: 'Coke 250ml', quantity: 480 },
    ],
    stockRequests: [], overheads: [], fixedCosts: [],
    addProductionData: noop, updateProductionData: noop, approveProductionData: noop, refreshData: noop, dataRefreshedAt: 0,
  };
}

const TITLES: Record<View, string> = {
  request: 'Stock', 'request-sent': 'Stock', queue: 'Production', oversight: 'Stock', batches: 'Production', approvals: 'Stock',
  receive: 'Stock', outofstock: 'Stock', onhand: 'Stock',
};

function Screen() {
  switch (view) {
    case 'request':
    case 'request-sent':
      return <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 lg:px-8"><ProductionRequests context={contextFor(USERS.store)} selectedStoreId="STORE-1" /></div>;
    case 'queue':
      return <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 lg:px-8"><ProductionRequests context={contextFor(USERS.production)} selectedStoreId="STORE-1" /></div>;
    case 'oversight':
      return <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 lg:px-8"><ProductionRequests context={contextFor(USERS.ops)} selectedStoreId={null} /></div>;
    case 'batches':
      return <ProductionManagement context={contextFor(USERS.production)} selectedStoreId={null} />;
    case 'approvals':
      return <ProductionManagement context={contextFor(USERS.ops)} selectedStoreId="STORE-1" initialTab="approvals" />;
    case 'receive':
      return <IncomingDeliveries accessToken="preview" storeId="STORE-1" />;
    case 'outofstock':
      return <StockOutLog accessToken="preview" stores={[{ id: 'STORE-1', name: 'Bidhan Nagar' }]} defaultStoreId="STORE-1" canDelete={false} />;
    case 'onhand':
      return <AdvancedInventoryManagement context={contextFor(USERS.ops)} stores={stores as any} />;
  }
}

function Preview() {
  return (
    <LanguageOverride lang={lang}>
      <div className="min-h-dvh bg-bg pb-[var(--bottom-nav-h)] md:pb-0" lang={lang}>
        {!bare && (
          <div className="flex flex-wrap gap-2 border-b border-border bg-surface-2 px-4 py-2 text-label">
            {VIEWS.map((v) => <a key={v} href={`?view=${v}&lang=${lang}`} className={v === view ? 'font-semibold text-primary' : 'text-text-2'}>{v}</a>)}
            {(['en', 'bn', 'hi'] as Lang[]).map((l) => <a key={l} href={`?view=${view}&lang=${l}`} className={l === lang ? 'font-semibold text-primary' : 'text-text-2'}>{l}</a>)}
          </div>
        )}
        <header className="sticky top-0 z-(--z-sticky) flex h-14 items-center border-b border-border bg-surface px-4">
          <span className="text-title font-semibold text-text">{TITLES[view]}</span>
        </header>
        <Screen />
        <nav aria-hidden="true" className="fixed inset-x-0 bottom-0 z-(--z-nav) h-(--bottom-nav-h) border-t border-border bg-surface md:hidden" />
      </div>
    </LanguageOverride>
  );
}

// ?frame=375x812: the page at that exact size in an iframe (headless browsers keep a wider
// minimum window), plus the in-page checks written out as text for the screenshot script.
const CHECK = (doc: Document, win: Window) => {
  const out = { hscroll: doc.documentElement.scrollWidth > win.innerWidth + 1, small: [] as string[], tiny: [] as string[] };
  for (const el of Array.from(doc.querySelectorAll('body *'))) {
    const cs = win.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0 || el.closest('.sr-only, [aria-hidden=true]')) continue;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim());
    if (hasText && parseFloat(cs.fontSize) < 12) out.small.push(`${el.tagName}:${cs.fontSize}:${(el.textContent || '').trim().slice(0, 24)}`);
    if (el.matches('button, a[href], input:not([type=hidden]):not([type=file]), select, textarea, [role=button], [role=radio]')) {
      const after = win.getComputedStyle(el, '::after');
      const grown = after.content !== 'none' && after.position === 'absolute';
      const w = grown ? Math.max(r.width, 44) : r.width;
      const h = grown ? Math.max(r.height, 44) : r.height;
      if ((w < 43.5 || h < 43.5) && !el.closest('[data-slot=checkbox]')) out.tiny.push(`${el.tagName}:${Math.round(w)}x${Math.round(h)}:${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}`);
    }
  }
  return out;
};

function FrameHost({ w, h }: { w: number; h: number }) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const [result, setResult] = React.useState('');
  const src = window.location.href.replace(/[?&]frame=[^&]*/, '').replace('stock-preview.html&', 'stock-preview.html?');
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const f = ref.current;
      if (f?.contentDocument && f.contentWindow) setResult(JSON.stringify(CHECK(f.contentDocument, f.contentWindow)));
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <>
      <iframe ref={ref} title="preview" src={src} style={{ width: w, height: h, border: 0, display: 'block' }} />
      <pre id="wp4-checks">{result}</pre>
    </>
  );
}

const frame = p.get('frame');
createRoot(document.getElementById('root')!).render(
  frame ? (
    <FrameHost w={Number(frame.split('x')[0])} h={Number(frame.split('x')[1])} />
  ) : (
    <>
      <Preview />
      <Toaster />
      <ConfirmProvider />
    </>
  ),
);
