import { useMemo, useState, type ReactNode } from 'react';
import { FileDown, FileSpreadsheet, FileText, Printer, Calendar, Loader2, ShieldCheck, Briefcase, Landmark, Table } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../utils/api';
import { BusinessAuditReport } from './BusinessAuditReport';
import { InventoryContextType } from '../App';
import { getTodayIST, addDays } from '../utils/timezone';
import { saveFile } from '../utils/saveFile';
import {
  type ReportPeriod, monthPeriod, quarterPeriod, financialYearPeriod, customPeriod, previousPeriod,
  quarterOf, fyStartYearOf, fyLabel, prettyDate,
} from '../utils/reportPeriods';
import { pnlCosts, type PnlBreakdown, type PnlScope } from '../utils/pnl';
import { freshAccessToken, loadReportData, makeContext, resolveEntities, type ReportContext } from '../utils/reports/reportData';
import { workbookBlob, csvBlob, htmlBlob, XLSX_MIME, CSV_MIME, HTML_MIME, inr, pctText, type SheetSpec } from '../utils/reports/sheets';
import { pnlFor } from '../utils/reports/ledgers';
import { buildQuickExport, buildAuditorWorkbook } from '../utils/reports/packs';
import { buildCeoPack, ordersByDate, type OrderCounts } from '../utils/reports/ceoPack';
import { buildTaxPack } from '../utils/reports/taxPack';

interface ExportDataProps {
  userRole: 'manager' | 'cluster_head';
  selectedStoreId?: string | null;
  currentUserId?: string;
  // Optional so existing call sites keep working without threading it through
  // immediately - the Business Audit Report tab simply won't render without it.
  context?: InventoryContextType;
}

type PeriodKind = 'month' | 'quarter' | 'fy' | 'custom';
type Job = 'look' | 'all-xlsx' | 'all-csv' | 'all-html' | 'auditor' | 'ceo-xlsx' | 'ceo-html' | 'tax-xlsx' | 'tax-html';

// A download button; shows a spinner while its own file is being made.
function ActionButton({ job, busy, disabled, onClick, icon: Icon, children, primary }: {
  job: Job; busy: Job | null; disabled: boolean; onClick: () => void; icon: typeof FileText; children: string; primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 min-w-[140px] min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
        primary ? 'bg-slate-800 text-white hover:bg-slate-900' : 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
      }`}
    >
      {busy === job ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {busy === job ? 'Preparing...' : children}
    </button>
  );
}

// One card per report: what's in it, then its download buttons.
function PackCard({ icon: Icon, tone, title, description, children }: { icon: typeof FileText; tone: string; title: string; description: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const SCOPES: { value: PnlScope; label: string; hint: string }[] = [
  { value: 'combined', label: 'Combined', hint: 'Store + production house' },
  { value: 'store', label: 'Store', hint: 'Counter, sales and store costs' },
  { value: 'production', label: 'Production', hint: 'Production house costs only' },
];

export function ExportData({ userRole, selectedStoreId, currentUserId, context }: ExportDataProps) {
  const [mainView, setMainView] = useState<'export' | 'audit'>('export');
  const today = getTodayIST();
  const thisFy = fyStartYearOf(today);
  const [kind, setKind] = useState<PeriodKind>('month');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [quarterKey, setQuarterKey] = useState(() => { const q = quarterOf(today); return `${q.fyStartYear}-${q.quarter}`; });
  const [fy, setFy] = useState(thisFy);
  const [customStart, setCustomStart] = useState(addDays(today, -6));
  const [customEnd, setCustomEnd] = useState(today);
  // An incharge's storeId can be their production house's id - start them on that side.
  const knownStores = context?.stores || [];
  const startsOnHouse = !!selectedStoreId && knownStores.length > 0 && !knownStores.some((s) => s.id === selectedStoreId);
  const [scope, setScope] = useState<PnlScope>(startsOnHouse ? 'production' : 'combined');
  const [busy, setBusy] = useState<Job | null>(null);
  const [look, setLook] = useState<{ current: PnlBreakdown; previous: PnlBreakdown; period: ReportPeriod; prevLabel: string } | null>(null);

  const isOwner = userRole === 'cluster_head';
  const generatedBy = context?.user?.name || currentUserId || 'Bunny Momos staff';

  const period: ReportPeriod | null = useMemo(() => {
    if (kind === 'month') return month ? monthPeriod(month, today) : null;
    if (kind === 'quarter') {
      const [y, q] = quarterKey.split('-').map(Number);
      return quarterPeriod(y, q as 1 | 2 | 3 | 4, today);
    }
    if (kind === 'fy') return financialYearPeriod(fy, today);
    return customStart && customEnd ? customPeriod(customStart, customEnd, today) : null;
  }, [kind, month, quarterKey, fy, customStart, customEnd, today]);

  const quarterOptions = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    let { fyStartYear, quarter } = quarterOf(today);
    for (let i = 0; i < 8; i++) {
      out.push({ key: `${fyStartYear}-${quarter}`, label: quarterPeriod(fyStartYear, quarter, today).label });
      if (quarter === 1) { quarter = 4; fyStartYear -= 1; } else quarter = (quarter - 1) as 1 | 2 | 3 | 4;
    }
    return out;
  }, [today]);

  const storeNames = useMemo(() => {
    const stores = context?.stores || [];
    const ids = resolveEntities(selectedStoreId, stores);
    const store = ids.storeId ? stores.find((s) => s.id === ids.storeId)?.name : null;
    const house = ids.productionHouseId ? context?.productionHouses?.find((h) => h.id === ids.productionHouseId)?.name : null;
    return { store: store || 'All stores', house: house || 'All production houses' };
  }, [context?.stores, context?.productionHouses, selectedStoreId]);

  // Every download reads the token and the data fresh - a token held since the page opened
  // expires after an hour, and a report should never be built from an old snapshot.
  const run = async (job: Job, work: (ctx: ReportContext, token: string) => Promise<void>, overridePeriod?: ReportPeriod, forceWholeBusiness = false) => {
    const p = overridePeriod || period;
    if (!p) {
      toast.error('Pick the dates first');
      return;
    }
    setBusy(job);
    try {
      const token = await freshAccessToken();
      if (!token) {
        toast.error('Your login has expired - please log in again.');
        return;
      }
      const data = await loadReportData(token, { from: p.start, to: p.dataEnd });
      const storeId = forceWholeBusiness ? null : resolveEntities(selectedStoreId, data.stores).storeId;
      await work(makeContext(p, forceWholeBusiness ? 'combined' : scope, storeId, data, generatedBy), token);
    } catch (error: any) {
      console.error('Export failed:', error);
      toast.error(`Couldn't make the file: ${error?.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const fileName = (what: string, p: ReportPeriod, ext: string, withScope = true) =>
    `BunnyMomos_${what}_${p.fileLabel}${withScope ? `_${scope}` : ''}.${ext}`;

  const save = async (name: string, blob: Blob, mime: string) => {
    await saveFile(name, blob, mime);
    toast.success(`Saved ${name}`);
  };

  const saveWorkbook = async (name: string, sheets: SheetSpec[]) => save(name, await workbookBlob(sheets), XLSX_MIME);

  const checkNumbers = () => run('look', async (ctx) => {
    const prev = previousPeriod(ctx.period, ctx.today);
    setLook({
      current: pnlFor(ctx, ctx.period.start, ctx.period.dataEnd),
      previous: pnlFor(ctx, prev.start, prev.dataEnd),
      period: ctx.period,
      prevLabel: prev.label,
    });
  });

  const allRecords = (format: 'xlsx' | 'csv' | 'html') => run(format === 'xlsx' ? 'all-xlsx' : format === 'csv' ? 'all-csv' : 'all-html', async (ctx) => {
    const out = buildQuickExport(ctx);
    if (format === 'xlsx') await saveWorkbook(fileName('AllRecords', ctx.period, 'xlsx'), out.sheets);
    else if (format === 'csv') await save(fileName('AllRecords', ctx.period, 'csv'), csvBlob(out.sheets), CSV_MIME);
    else await save(fileName('Report', ctx.period, 'html'), htmlBlob(out.html), HTML_MIME);
  });

  const auditor = () => run('auditor', async (ctx) => {
    await saveWorkbook(fileName('AuditorWorkbook', ctx.period, 'xlsx'), buildAuditorWorkbook(ctx));
  });

  const ceo = (format: 'xlsx' | 'html') => run(format === 'xlsx' ? 'ceo-xlsx' : 'ceo-html', async (ctx, token) => {
    // Order counts come from the billing system's order detail; without them the pack still works.
    let orders: Map<string, OrderCounts> | null = null;
    if (ctx.scope !== 'production') {
      const records = await api.getOrderItemDetail(token, { storeId: ctx.storeId || undefined, startDate: ctx.period.start, endDate: ctx.period.dataEnd }).catch(() => []);
      orders = records.length ? ordersByDate(records) : null;
    }
    const out = buildCeoPack(ctx, orders);
    if (format === 'xlsx') await saveWorkbook(fileName('CEO_Investor', ctx.period, 'xlsx'), out.sheets);
    else await save(fileName('CEO_Investor', ctx.period, 'html'), htmlBlob(out.html), HTML_MIME);
  });

  // The tax pack is always a whole financial year: the one picked, or the one the period ends in.
  const taxYear = period ? (period.kind === 'fy' ? period : financialYearPeriod(period.fyStartYear, today)) : null;
  const tax = (format: 'xlsx' | 'html') => taxYear && run(format === 'xlsx' ? 'tax-xlsx' : 'tax-html', async (ctx) => {
    const out = buildTaxPack(ctx);
    if (format === 'xlsx') await saveWorkbook(fileName('Tax_CA', ctx.period, 'xlsx', false), out.sheets);
    else await save(fileName('Tax_CA_summary', ctx.period, 'html', false), htmlBlob(out.html), HTML_MIME);
  }, taxYear, true);

  const pct = (now: number, before: number) =>
    Math.abs(before) < 0.005 ? '' : `${now >= before ? '+' : ''}${(((now - before) / Math.abs(before)) * 100).toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-500/30 flex-shrink-0">
            <FileDown className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Export &amp; reports</h1>
            <p className="text-sm sm:text-base text-gray-500">Workbooks for the auditor, CA and investors - same numbers as Analytics</p>
          </div>
        </div>

        {/* View toggle - the downloads vs. the Business Audit Report (judgment: cash control
            health, revenue completeness) - deliberately kept separate rather than merged. */}
        {context && (
          <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
            {(['export', 'audit'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setMainView(v)}
                className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mainView === v ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {v === 'export' ? 'Downloads' : 'Business Audit Report'}
              </button>
            ))}
          </div>
        )}

        {mainView === 'audit' && context ? (
          <BusinessAuditReport context={context} selectedStoreId={selectedStoreId} />
        ) : (
          <div className="space-y-4">
            {/* Period and scope */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-orange-600" /> Period
              </h2>
              <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-xl p-1 mb-3">
                {([['month', 'Month'], ['quarter', 'Quarter'], ['fy', 'Fin. year'], ['custom', 'Custom']] as [PeriodKind, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => { setKind(k); setLook(null); }}
                    className={`px-2 py-2 rounded-lg text-sm font-medium ${kind === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {kind === 'month' && (
                <input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => { setMonth(e.target.value); setLook(null); }}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white" />
              )}
              {kind === 'quarter' && (
                <select value={quarterKey} onChange={(e) => { setQuarterKey(e.target.value); setLook(null); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white">
                  {quarterOptions.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
                </select>
              )}
              {kind === 'fy' && (
                <select value={fy} onChange={(e) => { setFy(Number(e.target.value)); setLook(null); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white">
                  {[0, 1, 2, 3].map((i) => <option key={i} value={thisFy - i}>{fyLabel(thisFy - i)} (Apr {thisFy - i} - Mar {thisFy - i + 1})</option>)}
                </select>
              )}
              {kind === 'custom' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {([['Today', 0], ['Last 7 days', 6], ['Last 30 days', 29]] as [string, number][]).map(([label, back]) => (
                      <button key={label} onClick={() => { setCustomStart(addDays(today, -back)); setCustomEnd(today); setLook(null); }}
                        className="px-3 py-1.5 rounded-full text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-gray-600">From
                      <input type="date" value={customStart} max={customEnd || today} onChange={(e) => { setCustomStart(e.target.value); setLook(null); }}
                        className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white" />
                    </label>
                    <label className="text-xs text-gray-600">To
                      <input type="date" value={customEnd} min={customStart} max={today} onChange={(e) => { setCustomEnd(e.target.value); setLook(null); }}
                        className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white" />
                    </label>
                  </div>
                </div>
              )}
              {period && (
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium text-gray-900">{period.label}</span>
                  {period.partial && <span className="text-amber-700"> - still running, data up to {prettyDate(period.dataEnd)}</span>}
                </p>
              )}

              <h2 className="font-semibold text-gray-900 mt-4 mb-2">Covers</h2>
              <div className="grid grid-cols-3 gap-2">
                {SCOPES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => { setScope(s.value); setLook(null); }}
                    className={`rounded-xl border-2 px-2 py-2 text-left transition-colors ${scope === s.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'}`}
                  >
                    <div className="text-sm font-medium text-gray-900">{s.label}</div>
                    <div className="text-[11px] text-gray-500 leading-tight">{s.hint}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">{storeNames.store} · {storeNames.house}</p>
            </div>

            {/* Quick look at the profit before downloading anything */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Check the numbers</h3>
                  <p className="text-sm text-gray-600">Sales, costs and profit for this period - the same as Analytics.</p>
                </div>
                <button onClick={checkNumbers} disabled={!!busy || !period}
                  className="min-h-[44px] px-4 rounded-xl bg-orange-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2 flex-shrink-0">
                  {busy === 'look' && <Loader2 className="w-4 h-4 animate-spin" />} Check
                </button>
              </div>
              {look && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Sales', now: look.current.revenue, before: look.previous.revenue },
                    { label: 'Costs', now: pnlCosts(look.current), before: pnlCosts(look.previous) },
                    { label: 'Net profit', now: look.current.netProfit, before: look.previous.netProfit },
                  ].map((k) => (
                    <div key={k.label} className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-500">{k.label}</div>
                      <div className={`text-lg font-bold tabular-nums ${k.label === 'Net profit' && k.now < 0 ? 'text-red-700' : 'text-gray-900'}`}>{inr(k.now)}</div>
                      <div className="text-[11px] text-gray-500">{pct(k.now, k.before)} vs {inr(k.before)}</div>
                    </div>
                  ))}
                  <div className="rounded-xl bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Net margin</div>
                    <div className="text-lg font-bold tabular-nums text-gray-900">{look.current.revenue > 0 ? pctText(look.current.netProfit / look.current.revenue) : '-'}</div>
                    <div className="text-[11px] text-gray-500">Compared with {look.prevLabel}</div>
                  </div>
                  {look.current.estimatedDays > 0 && (
                    <p className="col-span-2 text-xs text-amber-700">Zomato/Swiggy commission for {look.current.estimatedDays} day(s) is estimated until their settlement is uploaded.</p>
                  )}
                </div>
              )}
            </div>

            <PackCard icon={Table} tone="bg-sky-600" title="All records" description="Every ledger for the period in one file: profit and loss, daily sales, purchases, expenses, payroll, advances, loans, production, items sold, staff list.">
              <ActionButton job="all-xlsx" busy={busy} disabled={!!busy || !period} onClick={() => allRecords('xlsx')} icon={FileSpreadsheet} primary>Excel (.xlsx)</ActionButton>
              <ActionButton job="all-csv" busy={busy} disabled={!!busy || !period} onClick={() => allRecords('csv')} icon={FileText}>CSV</ActionButton>
              <ActionButton job="all-html" busy={busy} disabled={!!busy || !period} onClick={() => allRecords('html')} icon={Printer}>Printable (Print to PDF)</ActionButton>
            </PackCard>

            <PackCard icon={ShieldCheck} tone="bg-emerald-600" title="Auditor workbook" description="Sales day book, purchases and expenses registers, payroll by employee code, store and production cash books, Paytm ledger, Zomato/Swiggy settlements, and an exceptions sheet (missing cash counts, unexplained till gaps, pending approvals, duplicates, price flags, cash over ₹10,000 to one payee).">
              <ActionButton job="auditor" busy={busy} disabled={!!busy || !period} onClick={auditor} icon={FileSpreadsheet} primary>Excel (.xlsx)</ActionButton>
            </PackCard>

            {isOwner && (
              <PackCard icon={Briefcase} tone="bg-violet-600" title="CEO / investor pack" description="Profit and loss month by month with % of sales, unit economics, growth and channel mix, a simple cash flow, store vs production costs, loans outstanding and assets.">
                <ActionButton job="ceo-xlsx" busy={busy} disabled={!!busy || !period} onClick={() => ceo('xlsx')} icon={FileSpreadsheet} primary>Excel (.xlsx)</ActionButton>
                <ActionButton job="ceo-html" busy={busy} disabled={!!busy || !period} onClick={() => ceo('html')} icon={Printer}>Printable (Print to PDF)</ActionButton>
              </PackCard>
            )}

            {isOwner && (
              <PackCard icon={Landmark} tone="bg-amber-600" title={`Tax / CA pack${taxYear ? ` - ${fyLabel(taxYear.fyStartYear)}` : ''}`} description="Monthly turnover in cash and digital, section 44AD deemed profit next to book profit, expenses by head, depreciation (WDV), TDS notes, the owner's own money and loans, and the ₹20 lakh GST watch. Always the whole business and a whole financial year.">
                <ActionButton job="tax-xlsx" busy={busy} disabled={!!busy || !period} onClick={() => tax('xlsx')} icon={FileSpreadsheet} primary>Excel (.xlsx)</ActionButton>
                <ActionButton job="tax-html" busy={busy} disabled={!!busy || !period} onClick={() => tax('html')} icon={Printer}>One-page summary (Print to PDF)</ActionButton>
              </PackCard>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-900 space-y-1">
              <p>• Excel files keep amounts as numbers, so totals and filters work. CSV opens in Excel or Google Sheets.</p>
              <p>• Printable files open in the browser: use Print, then "Save as PDF".</p>
              <p>• Phone numbers, Aadhaar and bank details are never included.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
