import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, Briefcase, CalendarRange, ChevronDown, FileSpreadsheet, Landmark, Layers, ReceiptText, ShieldCheck, Smartphone, TrendingUp, Users, Wallet } from 'lucide-react';
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
import { pnlFor, salesDayBook, purchasesRegister, expensesRegister, payrollRegister, paytmLedgerSheet } from '../utils/reports/ledgers';
import { buildQuickExport, buildAuditorWorkbook, readmeSheet } from '../utils/reports/packs';
import { buildCeoPack, ordersByDate, type OrderCounts } from '../utils/reports/ceoPack';
import { buildTaxPack } from '../utils/reports/taxPack';
import { useT, type I18nKey } from '../utils/i18n';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { ChoiceChips, SelectChip } from './ui/chip';
import { SegmentedControl } from './ui/segmented-control';
import { ListGroup, ListRow } from './ui/list-row';
import { StatTile, StatGrid } from './ui/stat-tile';
import { Callout } from './ui/callout';
import { ResponsiveModal } from './ui/responsive-modal';
import { SkeletonStatTiles } from './ui/skeleton';
import { SetupPage } from './setup/SetupPage';

interface ExportDataProps {
  userRole: 'manager' | 'cluster_head';
  selectedStoreId?: string | null;
  currentUserId?: string;
  // Optional so existing call sites keep working without threading it through
  // immediately - the Business Audit Report simply won't render without it.
  context?: InventoryContextType;
  /** The view to open on (the shell's More > Check the numbers opens the audit report). */
  initialView?: 'export' | 'audit';
}

type PeriodKind = 'month' | 'quarter' | 'fy' | 'custom';
type ReportId = 'all' | 'sales' | 'expenses' | 'payroll' | 'paytm' | 'auditor' | 'ceo' | 'tax';
type Format = 'xlsx' | 'csv' | 'pdf';
type Job = 'look' | `${ReportId}-${Format}`;

// One row per report: what's in it and the formats it comes in (the same files as before; the
// single registers are the matching tabs of the auditor workbook on their own).
const REPORTS: { id: ReportId; icon: LucideIcon; title: I18nKey; body: I18nKey; formats: Format[]; ownerOnly?: boolean }[] = [
  { id: 'all', icon: Layers, title: 'reports.r.all', body: 'reports.r.allBody', formats: ['xlsx', 'csv', 'pdf'] },
  { id: 'sales', icon: ReceiptText, title: 'reports.r.sales', body: 'reports.r.salesBody', formats: ['xlsx', 'csv'] },
  { id: 'expenses', icon: Wallet, title: 'reports.r.expenses', body: 'reports.r.expensesBody', formats: ['xlsx', 'csv'] },
  { id: 'payroll', icon: Users, title: 'reports.r.payroll', body: 'reports.r.payrollBody', formats: ['xlsx', 'csv'] },
  { id: 'paytm', icon: Smartphone, title: 'reports.r.paytm', body: 'reports.r.paytmBody', formats: ['xlsx', 'csv'] },
  { id: 'auditor', icon: ShieldCheck, title: 'reports.r.auditor', body: 'reports.r.auditorBody', formats: ['xlsx'] },
  { id: 'ceo', icon: Briefcase, title: 'reports.r.ceo', body: 'reports.r.ceoBody', formats: ['xlsx', 'pdf'], ownerOnly: true },
  { id: 'tax', icon: Landmark, title: 'reports.r.tax', body: 'reports.r.taxBody', formats: ['xlsx', 'pdf'], ownerOnly: true },
];

const SCOPES: PnlScope[] = ['combined', 'store', 'production'];
const scopeKey = (s: PnlScope) => `reports.scope.${s}` as I18nKey;
const formatKey = (f: Format) => `reports.fmt.${f}` as I18nKey;

export function ExportData({ userRole, selectedStoreId, currentUserId, context, initialView = 'export' }: ExportDataProps) {
  const { t, lang } = useT();
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
  // Sheets: the period picker, one report's download, the profit check, the audit report.
  const [periodOpen, setPeriodOpen] = useState(false);
  const [dl, setDl] = useState<{ id: ReportId; format: Format } | null>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [dlView, setDlView] = useState<'main' | 'period'>('main');
  const [lookOpen, setLookOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

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
    return { store: store || t('reports.allStores'), house: house || t('reports.allHouses') };
  }, [context?.stores, context?.productionHouses, selectedStoreId, t]);

  // Every download reads the token and the data fresh - a token held since the page opened
  // expires after an hour, and a report should never be built from an old snapshot.
  const run = async (job: Job, work: (ctx: ReportContext, token: string) => Promise<void>, overridePeriod?: ReportPeriod, forceWholeBusiness = false) => {
    const p = overridePeriod || period;
    if (!p) {
      toast.error(t('reports.pickDates'));
      return;
    }
    setBusy(job);
    try {
      const token = await freshAccessToken();
      if (!token) {
        toast.error(t('reports.loginExpired'));
        return;
      }
      const data = await loadReportData(token, { from: p.start, to: p.dataEnd });
      const storeId = forceWholeBusiness ? null : resolveEntities(selectedStoreId, data.stores).storeId;
      await work(makeContext(p, forceWholeBusiness ? 'combined' : scope, storeId, data, generatedBy), token);
    } catch (error: any) {
      console.error('Export failed:', error);
      toast.error(t('reports.failed', { error: error?.message || 'unknown error' }));
    } finally {
      setBusy(null);
    }
  };

  const fileName = (what: string, p: ReportPeriod, ext: string, withScope = true) =>
    `BunnyMomos_${what}_${p.fileLabel}${withScope ? `_${scope}` : ''}.${ext}`;

  const save = async (name: string, blob: Blob, mime: string) => {
    await saveFile(name, blob, mime);
    toast.success(t('reports.savedFile', { name }));
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

  const allRecords = (format: 'xlsx' | 'csv' | 'html') => run(format === 'xlsx' ? 'all-xlsx' : format === 'csv' ? 'all-csv' : 'all-pdf', async (ctx) => {
    const out = buildQuickExport(ctx);
    if (format === 'xlsx') await saveWorkbook(fileName('AllRecords', ctx.period, 'xlsx'), out.sheets);
    else if (format === 'csv') await save(fileName('AllRecords', ctx.period, 'csv'), csvBlob(out.sheets), CSV_MIME);
    else await save(fileName('Report', ctx.period, 'html'), htmlBlob(out.html), HTML_MIME);
  });

  const auditor = () => run('auditor-xlsx', async (ctx) => {
    await saveWorkbook(fileName('AuditorWorkbook', ctx.period, 'xlsx'), buildAuditorWorkbook(ctx));
  });

  // One register on its own: the auditor workbook's tab, with its README in front.
  const register = (id: 'sales' | 'expenses' | 'payroll' | 'paytm', format: 'xlsx' | 'csv') => run(`${id}-${format}`, async (ctx) => {
    const spec = {
      sales: { file: 'SalesRegister', name: 'Sales register', sheets: () => [salesDayBook(ctx)], tabs: [['Sales day book', 'One row per store per day: POS sales, cash and Paytm counted, till short/over, approval']] },
      expenses: { file: 'ExpensesRegister', name: 'Expenses and purchases', sheets: () => [purchasesRegister(ctx), expensesRegister(ctx)], tabs: [['Purchases register', 'Every inventory purchase with a price check'], ['Expenses register', 'Running expenses and fixed costs, with the P&L line each lands on']] },
      payroll: { file: 'PayrollRegister', name: 'Payroll register', sheets: () => [payrollRegister(ctx)], tabs: [['Payroll register', 'Salary payouts by employee code: month covered, date paid, gross, advance deducted, net, paid from']] },
      paytm: { file: 'PaytmLedger', name: 'Paytm ledger', sheets: () => [paytmLedgerSheet(ctx)], tabs: [['Paytm ledger', 'Every movement of the Paytm/UPI balance with the running balance']] },
    }[id];
    const sheets: SheetSpec[] = [readmeSheet(ctx, spec.name, spec.tabs as [string, string][]), ...spec.sheets()];
    if (format === 'xlsx') await saveWorkbook(fileName(spec.file, ctx.period, 'xlsx'), sheets);
    else await save(fileName(spec.file, ctx.period, 'csv'), csvBlob(sheets), CSV_MIME);
  });

  const ceo = (format: 'xlsx' | 'html') => run(format === 'xlsx' ? 'ceo-xlsx' : 'ceo-pdf', async (ctx, token) => {
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
  const tax = (format: 'xlsx' | 'html') => taxYear && run(format === 'xlsx' ? 'tax-xlsx' : 'tax-pdf', async (ctx) => {
    const out = buildTaxPack(ctx);
    if (format === 'xlsx') await saveWorkbook(fileName('Tax_CA', ctx.period, 'xlsx', false), out.sheets);
    else await save(fileName('Tax_CA_summary', ctx.period, 'html', false), htmlBlob(out.html), HTML_MIME);
  }, taxYear, true);

  const download = (id: ReportId, format: Format) => {
    const html = format === 'pdf' ? 'html' : format === 'csv' ? 'csv' : 'xlsx';
    switch (id) {
      case 'all': return allRecords(html);
      case 'auditor': return auditor();
      case 'ceo': return ceo(html === 'html' ? 'html' : 'xlsx');
      case 'tax': return tax(html === 'html' ? 'html' : 'xlsx');
      default: return register(id, format === 'csv' ? 'csv' : 'xlsx');
    }
  };

  const pct = (now: number, before: number) =>
    Math.abs(before) < 0.005 ? '' : `${now >= before ? '+' : ''}${(((now - before) / Math.abs(before)) * 100).toFixed(1)}%`;

  // Changing the period or what it covers drops the last profit check.
  const changed = <T,>(set: (v: T) => void) => (v: T) => { set(v); setLook(null); };

  const periodLabel = period ? period.label : t('reports.pickDates');
  const reports = REPORTS.filter((r) => !r.ownerOnly || isOwner);
  const dlReport = dl ? REPORTS.find((r) => r.id === dl.id)! : null;

  const periodPicker = (
    <div className="flex flex-col gap-5" lang={lang}>
      <div className="flex flex-col gap-3">
        <span className="text-body-sm font-medium text-text">{t('reports.period')}</span>
        <SegmentedControl
          aria-label={t('reports.period')}
          value={kind}
          onValueChange={changed(setKind)}
          options={(['month', 'quarter', 'fy', 'custom'] as PeriodKind[]).map((k) => ({ value: k, label: t(`reports.kind.${k}` as I18nKey) }))}
        />
        {kind === 'month' && (
          <Field label={t('reports.month')} hideLabel>
            <Input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => changed(setMonth)(e.target.value)} />
          </Field>
        )}
        {kind === 'quarter' && (
          <Field label={t('reports.quarter')} hideLabel>
            <NativeSelect value={quarterKey} onChange={(e) => changed(setQuarterKey)(e.target.value)}>
              {quarterOptions.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
            </NativeSelect>
          </Field>
        )}
        {kind === 'fy' && (
          <Field label={t('reports.fy')} hideLabel>
            <NativeSelect value={fy} onChange={(e) => changed(setFy)(Number(e.target.value))}>
              {[0, 1, 2, 3].map((i) => <option key={i} value={thisFy - i}>{fyLabel(thisFy - i)} (Apr {thisFy - i} - Mar {thisFy - i + 1})</option>)}
            </NativeSelect>
          </Field>
        )}
        {kind === 'custom' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {([['reports.today', 0], ['reports.last7', 6], ['reports.last30', 29]] as [I18nKey, number][]).map(([label, back]) => (
                <Button key={label} variant="secondary" size="sm" onClick={() => { setCustomStart(addDays(today, -back)); setCustomEnd(today); setLook(null); }}>
                  {t(label)}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('reports.from')}>
                <Input type="date" value={customStart} max={customEnd || today} onChange={(e) => changed(setCustomStart)(e.target.value)} />
              </Field>
              <Field label={t('reports.to')}>
                <Input type="date" value={customEnd} min={customStart} max={today} onChange={(e) => changed(setCustomEnd)(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
        {period && (
          <p className="text-body-sm text-text-2">
            <span className="font-medium text-text">{period.label}</span>
            {period.partial && <span className="text-warning"> · {t('reports.stillRunning', { date: prettyDate(period.dataEnd) })}</span>}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <span className="text-body-sm font-medium text-text">{t('reports.covers')}</span>
        <SegmentedControl aria-label={t('reports.covers')} value={scope} onValueChange={changed(setScope)} options={SCOPES.map((s) => ({ value: s, label: t(scopeKey(s)) }))} />
        <p className="text-caption text-text-3">{storeNames.store} · {storeNames.house}</p>
      </div>
    </div>
  );

  if (initialView === 'audit' && context) {
    return (
      <SetupPage wide>
        <BusinessAuditReport context={context} selectedStoreId={selectedStoreId} />
      </SetupPage>
    );
  }

  const openDownload = (id: ReportId) => {
    const r = REPORTS.find((x) => x.id === id)!;
    setDl({ id, format: r.formats[0] });
    setDlView('main');
    setDlOpen(true);
  };

  const lookTiles: { label: string; now: number; before: number; isProfit?: boolean }[] = look ? [
    { label: t('reports.sales'), now: look.current.revenue, before: look.previous.revenue },
    { label: t('reports.costs'), now: pnlCosts(look.current), before: pnlCosts(look.previous) },
    { label: t('reports.netProfit'), now: look.current.netProfit, before: look.previous.netProfit, isProfit: true },
  ] : [];

  return (
    <SetupPage>
      {/* What the downloads cover */}
      <div className="flex flex-wrap items-center gap-2" lang={lang}>
        <SelectChip leadingIcon={<CalendarRange />} trailingIcon={<ChevronDown />} onClick={() => setPeriodOpen(true)} aria-label={`${t('reports.period')}: ${periodLabel}`}>
          {periodLabel}
        </SelectChip>
        <SelectChip trailingIcon={<ChevronDown />} onClick={() => setPeriodOpen(true)} aria-label={`${t('reports.covers')}: ${t(scopeKey(scope))}`}>
          {t(scopeKey(scope))}
        </SelectChip>
      </div>

      <ListGroup overline={t('reports.downloads')}>
        {reports.map((r) => (
          <ListRow
            key={r.id}
            icon={r.icon}
            title={r.id === 'tax' && taxYear ? t('reports.r.taxFy', { fy: fyLabel(taxYear.fyStartYear) }) : t(r.title)}
            subtitle={<>{t(r.body)}<span className="mt-1 block text-text-2">{r.formats.map((f) => t(formatKey(f))).join(' · ')}</span></>}
            chevron
            onClick={() => openDownload(r.id)}
          />
        ))}
      </ListGroup>

      <ListGroup overline={t('reports.checks')}>
        <ListRow icon={TrendingUp} title={t('reports.profitCheck')} subtitle={t('reports.profitCheckBody')} onClick={() => { setLookOpen(true); if (!look) checkNumbers(); }} />
        {context && <ListRow icon={BookOpen} title={t('reports.audit')} subtitle={t('reports.auditBody')} onClick={() => setAuditOpen(true)} />}
      </ListGroup>

      <Callout tone="neutral" icon={FileSpreadsheet}>
        <span className="flex flex-col gap-1">
          <span>{t('reports.note1')}</span>
          <span>{t('reports.note2')}</span>
          <span>{t('reports.note3')}</span>
        </span>
      </Callout>

      {/* Period and coverage */}
      <ResponsiveModal
        open={periodOpen}
        onOpenChange={setPeriodOpen}
        title={t('reports.periodTitle')}
        footer={<Button size="lg" className="flex-1" onClick={() => setPeriodOpen(false)}>{t('common.done')}</Button>}
      >
        {periodPicker}
      </ResponsiveModal>

      {/* One report */}
      <ResponsiveModal
        open={dlOpen}
        onOpenChange={setDlOpen}
        onClosed={() => setDl(null)}
        title={dlView === 'period' ? t('reports.periodTitle') : dlReport ? (dlReport.id === 'tax' && taxYear ? t('reports.r.taxFy', { fy: fyLabel(taxYear.fyStartYear) }) : t(dlReport.title)) : ''}
        onBack={dlView === 'period' ? () => setDlView('main') : undefined}
        footer={dl ? (
          dlView === 'period' ? (
            <Button size="lg" className="flex-1" onClick={() => setDlView('main')}>{t('common.done')}</Button>
          ) : (
            <Button size="lg" className="flex-1" loading={busy === `${dl.id}-${dl.format}`} disabled={!!busy || !period} onClick={() => download(dl.id, dl.format)}>
              {busy === `${dl.id}-${dl.format}` ? t('reports.preparing') : t('reports.download')}
            </Button>
          )
        ) : undefined}
      >
        {dl && dlReport && (dlView === 'period' ? periodPicker : (
          <div className="flex flex-col gap-5" lang={lang}>
            <p className="text-body-sm text-text-2">{t(dlReport.body)}</p>
            <ListGroup>
              {dl.id === 'tax' ? (
                <ListRow icon={CalendarRange} title={taxYear ? fyLabel(taxYear.fyStartYear) : periodLabel} subtitle={t('reports.wholeBusiness')} onClick={() => setDlView('period')} />
              ) : (
                <ListRow
                  icon={CalendarRange}
                  title={periodLabel}
                  subtitle={`${t(scopeKey(scope))} · ${storeNames.store} · ${storeNames.house}`}
                  onClick={() => setDlView('period')}
                />
              )}
            </ListGroup>
            {dlReport.formats.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-body-sm font-medium text-text">{t('reports.format')}</span>
                <ChoiceChips
                  aria-label={t('reports.format')}
                  value={dl.format}
                  onValueChange={(f) => setDl({ ...dl, format: f })}
                  options={dlReport.formats.map((f) => ({ value: f, label: t(formatKey(f)) }))}
                />
              </div>
            )}
          </div>
        ))}
      </ResponsiveModal>

      {/* Profit for this period */}
      <ResponsiveModal
        open={lookOpen}
        onOpenChange={setLookOpen}
        title={t('reports.profitCheck')}
        description={period ? `${period.label} · ${t(scopeKey(scope))}` : undefined}
        footer={<Button variant="secondary" size="lg" className="flex-1" loading={busy === 'look'} disabled={!!busy || !period} onClick={checkNumbers}>{t('reports.check')}</Button>}
      >
        {busy === 'look' || !look ? (
          <SkeletonStatTiles count={4} />
        ) : (
          <div className="flex flex-col gap-3" lang={lang}>
            <StatGrid>
              {lookTiles.map((k) => (
                <StatTile
                  key={k.label}
                  label={k.label}
                  value={inr(k.now)}
                  tone={k.isProfit && k.now < 0 ? 'danger' : 'default'}
                  caption={<span className="num">{[pct(k.now, k.before), t('reports.vsPrev', { amount: inr(k.before) })].filter(Boolean).join(' ')}</span>}
                />
              ))}
              <StatTile
                label={t('reports.netMargin')}
                value={look.current.revenue > 0 ? pctText(look.current.netProfit / look.current.revenue) : '-'}
                caption={t('reports.comparedWith', { label: look.prevLabel })}
              />
            </StatGrid>
            {look.current.estimatedDays > 0 && (
              <Callout tone="warning">{t('reports.estimated', { n: look.current.estimatedDays })}</Callout>
            )}
          </div>
        )}
      </ResponsiveModal>

      {/* Check the numbers (audit) */}
      {context && (
        <ResponsiveModal open={auditOpen} onOpenChange={setAuditOpen} title={t('reports.audit')} size="detail">
          {auditOpen && <BusinessAuditReport context={context} selectedStoreId={selectedStoreId} />}
        </ResponsiveModal>
      )}
    </SetupPage>
  );
}

