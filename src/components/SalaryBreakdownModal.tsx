import { useEffect, useMemo, useState } from 'react';
import { Users, AlertTriangle, Download, Lock, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { CHART_SERIES } from './ui/chart-theme';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { StatGrid, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { TextRow } from './insights/parts/common';
import { ChartCard, ChartEmpty, TrendChart } from './insights/tabs/shared';
import * as api from '../utils/api';
import { SalaryBreakdownData, monthLabel } from '../utils/salaryBreakdown';

type Props = {
  totalAmount: number;
  data: SalaryBreakdownData;
  periodLabel: string;
  // Individual salaries are sensitive - only the cluster head sees names and amounts.
  // Everyone else with Analytics access still gets the totals, split and trend.
  canSeeEmployeeDetail: boolean;
  onClose: () => void;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function SalaryBreakdownModal({ totalAmount, data, periodLabel, canSeeEmployeeDetail, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [advances, setAdvances] = useState<api.SalaryAdvance[]>([]);

  // Open salary advances are still being deducted from payouts - worth seeing next to the
  // salary numbers, since they explain why a payout can be lower than the usual monthly pay.
  useEffect(() => {
    if (!canSeeEmployeeDetail) return;
    let cancelled = false;
    api.getSalaryAdvances()
      .then((a) => { if (!cancelled) setAdvances((a || []).filter((x) => x.status === 'approved' && (x.remainingAmount || 0) > 0)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [canSeeEmployeeDetail]);

  const { totals } = data;
  const payoutTotal = totals.permanent + totals.contract;
  const variablePct = payoutTotal > 0 ? (totals.variable / payoutTotal) * 100 : 0;
  const permanentPct = payoutTotal > 0 ? (totals.permanent / payoutTotal) * 100 : 0;
  const deltaPct = data.prevTotal && data.prevTotal > 0 ? ((payoutTotal - data.prevTotal) / data.prevTotal) * 100 : null;
  const hasPayouts = data.payouts.length > 0;
  const trendHasData = useMemo(() => data.trend.some((t) => t.total > 0), [data.trend]);

  const exportCsv = () => {
    const lines = ['Employee,Type,Status,Base,Variable pay,Total'];
    data.employees.forEach((e) =>
      lines.push(`"${e.name}",${e.type},${e.archived ? 'archived' : 'active'},${e.base},${e.variable},${e.total}`)
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salaries_${periodLabel.replace(/[^a-z0-9]+/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const flagCount =
    data.notPaidThisPeriod.length + data.bigChanges.length + data.nonPaytmPayouts.length + advances.length + (data.unmatched.count > 0 ? 1 : 0);

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Salaries breakdown"
      description={`${periodLabel} · ${inr(totalAmount)} · ${totals.payoutCount} payout${totals.payoutCount === 1 ? '' : 's'} · ${data.employees.length} employee${data.employees.length === 1 ? '' : 's'}`}
      size="detail"
    >
      <div className="flex flex-col gap-6" data-ai-private>
          {/* Summary */}
          <StatGrid columns={4}>
            <StatTile
              label="Paid out"
              value={inr(payoutTotal)}
              delta={deltaPct !== null ? { value: deltaPct, label: `vs ${data.prevMonthKey ? monthLabel(data.prevMonthKey) : 'previous month'}`, goodWhen: 'down' } : undefined}
              caption={deltaPct === null ? 'No previous month to compare' : undefined}
            />
            <StatTile label="Permanent / contract" value={<span className="text-title">{inr(totals.permanent)} / {inr(totals.contract)}</span>} caption={`Permanent is ${permanentPct.toFixed(1)}% of payouts`} />
            <StatTile label="Base / variable pay" value={<span className="text-title">{inr(totals.base)} / {inr(totals.variable)}</span>} caption={`Variable pay is ${variablePct.toFixed(1)}% of payouts`} />
            <StatTile label="Personal expenses" value={inr(totals.personal)} caption="Cash given to staff, counted in salaries" />
          </StatGrid>

          {!hasPayouts && totals.personal === 0 && (
            <Callout tone="warning" title="No salary payouts in this period">
              Salaries are logged monthly in Payroll, so they only appear under This month, Last month or a custom range.
            </Callout>
          )}

          {/* Trend */}
          <ChartCard
            title="Last 6 months"
            caption="By the month they were paid for"
            legend={[
              { label: 'Permanent', color: CHART_SERIES[0], shape: 'square' },
              { label: 'Contract', color: CHART_SERIES[3], shape: 'square' },
              { label: 'Variable pay', color: CHART_SERIES[1], shape: 'square' },
            ]}
          >
            {trendHasData ? (
              <TrendChart
                data={data.trend}
                xKey="label"
                height={220}
                series={[
                  { key: 'permanent', name: 'Permanent', color: CHART_SERIES[0], kind: 'bar', stack: 's' },
                  { key: 'contract', name: 'Contract', color: CHART_SERIES[3], kind: 'bar', stack: 's' },
                  { key: 'variable', name: 'Variable pay', color: CHART_SERIES[1], kind: 'bar', stack: 's' },
                ]}
                ariaLabel="Salaries by month for the last 6 months: permanent base, contract base and variable pay"
              />
            ) : (
              <ChartEmpty title="No payouts recorded in the last 6 months" body=" " />
            )}
          </ChartCard>

          {canSeeEmployeeDetail ? (
            <>
              {/* Per employee: a list on phones (tap a person for their payouts), a table from 1024 px */}
              <ListGroup
                title="By employee"
                action={data.employees.length > 0 ? <Button variant="secondary" size="sm" leadingIcon={<Download />} onClick={exportCsv}>Export CSV</Button> : undefined}
                empty={<EmptyState compact icon={Users} title="No employee payouts in this period" />}
              >
                {data.employees.map((e) => {
                  const open = expanded === e.employeeId;
                  return (
                    <div key={e.employeeId}>
                      <ListRow
                        title={<span>{e.name}{e.archived && <StatusChip tone="neutral" className="ml-2 align-middle">Archived</StatusChip>}</span>}
                        subtitle={`${e.type === 'contract' ? 'Contract' : e.type === 'permanent' ? 'Permanent' : e.type} · base ${inr(e.base)}${e.variable > 0 ? ` · variable ${inr(e.variable)}` : ''} · ${payoutTotal > 0 ? ((e.total / payoutTotal) * 100).toFixed(1) : 0}%`}
                        trailing={<span className="num text-body-md font-semibold text-text">{inr(e.total)}</span>}
                        chevron="down"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : e.employeeId)}
                      />
                      {open && (
                        <div className="flex flex-col gap-1.5 bg-surface-2 px-4 py-3">
                          {data.payouts.filter((p) => p.employeeId === e.employeeId).map((p) => (
                            <div key={p.id} className="flex justify-between gap-3 text-label text-text-2">
                              <span>{p.date} · for {monthLabel(p.forMonth)} · from {p.paidFrom}</span>
                              <span className="num shrink-0">{inr(p.amount)}{p.variablePay > 0 ? ` (incl. ${inr(p.variablePay)} variable)` : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </ListGroup>

              {data.personalExpenses.length > 0 && (
                <ListGroup title="Personal expenses counted in salaries">
                  {data.personalExpenses.map((o) => (
                    <ListRow
                      key={o.id}
                      density="compact"
                      title={o.employeeName}
                      subtitle={`${o.description ? `${o.description} · ` : ''}${o.date}`}
                      trailing={<span className="num text-body-md font-semibold text-text">{inr(o.amount)}</span>}
                    />
                  ))}
                </ListGroup>
              )}

              {/* Flags */}
              <ListGroup
                title="Worth a look"
                meta={flagCount > 0 ? String(flagCount) : undefined}
                empty={<ListRow icon={CheckCircle2} iconTone="success" title="Nothing unusual" subtitle="Every payout is matched, in line with last month, and paid from Paytm." />}
              >
                {data.unmatched.count > 0 && (
                  <TextRow icon={AlertTriangle} iconTone="warning" title={`${data.unmatched.count} payout${data.unmatched.count === 1 ? '' : 's'} (${inr(data.unmatched.amount)}) not matched`} lines={["Couldn't be matched to an employee record, so they're left out of this total."]} />
                )}
                {data.notPaidThisPeriod.length > 0 && (
                  <TextRow icon={AlertTriangle} iconTone="warning" title="Not paid yet this period (paid last month)" lines={[data.notPaidThisPeriod.map((n) => `${n.name} (${inr(n.prevTotal)})`).join(', ')]} />
                )}
                {data.bigChanges.map((c) => (
                  <TextRow key={c.employeeId} icon={AlertTriangle} iconTone="warning" title={c.name} lines={[`${inr(c.total)} vs ${inr(c.prevTotal)} last month (${c.percent >= 0 ? '+' : ''}${c.percent.toFixed(0)}%)`]} />
                ))}
                {data.nonPaytmPayouts.length > 0 && (
                  <TextRow icon={AlertTriangle} iconTone="warning" title="Not paid from Paytm" lines={[`So they don't reduce the Paytm balance: ${data.nonPaytmPayouts.map((p) => `${p.name} ${inr(p.amount)} from ${p.paidFrom}`).join(', ')}`]} />
                )}
                {advances.map((a) => (
                  <TextRow key={a.id} icon={AlertTriangle} iconTone="warning" title={`${a.employeeName}: open salary advance`} lines={[`${inr(a.remainingAmount)} still to deduct (${inr(a.monthlyDeduction)} a month until ${a.endMonth})`]} />
                ))}
              </ListGroup>
            </>
          ) : (
            <Callout tone="neutral" icon={Lock} title="Individual salaries are for the cluster head only">
              The totals, split and trend above are available to everyone with Insights access.
            </Callout>
          )}
      </div>
    </ResponsiveModal>
  );
}
