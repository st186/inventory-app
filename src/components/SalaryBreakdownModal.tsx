import { Fragment, useEffect, useMemo, useState } from 'react';
import { Users, Briefcase, Wallet, TrendingUp, TrendingDown, AlertTriangle, Download, ChevronDown, ChevronUp, Lock, BarChart3 } from 'lucide-react';
import { ResponsiveModal } from './ui/responsive-modal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-text-3">Paid out</p>
              <p className="text-2xl font-bold text-text tabular-nums mt-1">{inr(payoutTotal)}</p>
              {deltaPct !== null ? (
                <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${deltaPct > 0.5 ? 'text-danger' : deltaPct < -0.5 ? 'text-success' : 'text-text-3'}`}>
                  {deltaPct > 0.5 ? <TrendingUp className="w-3 h-3" /> : deltaPct < -0.5 ? <TrendingDown className="w-3 h-3" /> : null}
                  {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs {data.prevMonthKey ? monthLabel(data.prevMonthKey) : 'previous month'}
                </p>
              ) : <p className="text-xs text-text-3 mt-1">No previous month to compare</p>}
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Permanent / Contract</p>
              <p className="text-lg font-bold text-text tabular-nums mt-1">{inr(totals.permanent)} <span className="text-text-3 font-normal">/</span> {inr(totals.contract)}</p>
              <div className="h-1.5 rounded-full bg-primary-soft mt-2 overflow-hidden"><div className="h-full bg-danger" style={{ width: `${permanentPct}%` }} /></div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-text-3">Base / Variable pay</p>
              <p className="text-lg font-bold text-text tabular-nums mt-1">{inr(totals.base)} <span className="text-text-3 font-normal">/</span> {inr(totals.variable)}</p>
              <div className="h-1.5 rounded-full bg-surface-3 mt-2 overflow-hidden"><div className="h-full bg-success" style={{ width: `${variablePct}%` }} /></div>
              <p className="text-xs text-text-3 mt-1">Variable pay is {variablePct.toFixed(1)}% of payouts</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 flex items-center gap-1"><Wallet className="w-3 h-3" /> Personal expenses</p>
              <p className="text-2xl font-bold text-text tabular-nums mt-1">{inr(totals.personal)}</p>
              <p className="text-xs text-text-3 mt-1">Cash given to staff, counted in salaries</p>
            </div>
          </div>

          {!hasPayouts && totals.personal === 0 && (
            <div className="rounded-lg bg-warning-soft border border-warning-border p-4 text-sm text-warning">
              No salary payouts fall in this period. Salaries are logged monthly in Payroll, so they only appear under This Month, Last Month or a custom range.
            </div>
          )}

          {/* Trend */}
          <div className="rounded-lg border border-border p-4 sm:p-5">
            <h3 className="text-base font-semibold text-text flex items-center gap-2 mb-1"><BarChart3 className="w-4 h-4 text-danger" /> Last 6 months</h3>
            <p className="text-xs text-text-3 mb-3">Salaries by the month they were paid for, split into permanent base, contract base and variable pay.</p>
            {trendHasData ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={48} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="permanent" name="Permanent" stackId="s" fill="var(--chart-1)" />
                  <Bar dataKey="contract" name="Contract" stackId="s" fill="var(--chart-1)" />
                  <Bar dataKey="variable" name="Variable pay" stackId="s" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-3 py-6 text-center">No payouts recorded in the last 6 months.</p>
            )}
          </div>

          {canSeeEmployeeDetail ? (
            <>
              {/* Per employee */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border">
                  <h3 className="text-base font-semibold text-text">By employee</h3>
                  {data.employees.length > 0 && (
                    <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-medium text-text-2 hover:text-text border border-border-strong rounded-lg px-2.5 py-1.5 bg-surface">
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </button>
                  )}
                </div>
                {data.employees.length === 0 ? (
                  <p className="text-sm text-text-3 p-5 text-center">No employee payouts in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-text-3 border-b border-border">
                          <th className="px-4 py-2">Employee</th>
                          <th className="px-4 py-2">Type</th>
                          <th className="px-4 py-2 text-right">Base</th>
                          <th className="px-4 py-2 text-right">Variable</th>
                          <th className="px-4 py-2 text-right">Total</th>
                          <th className="px-4 py-2 text-right">Share</th>
                          <th className="px-2 py-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.employees.map((e) => {
                          const open = expanded === e.employeeId;
                          return (
                            <Fragment key={e.employeeId}>
                              <tr className="border-b border-border hover:bg-surface-2 cursor-pointer" onClick={() => setExpanded(open ? null : e.employeeId)}>
                                <td className="px-4 py-2.5 font-medium text-text">
                                  {e.name}
                                  {e.archived && <span className="ml-2 text-caption font-semibold uppercase bg-surface-3 text-text-2 rounded px-1.5 py-0.5">archived</span>}
                                </td>
                                <td className="px-4 py-2.5 text-text-2 capitalize">{e.type}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{inr(e.base)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-success">{e.variable > 0 ? inr(e.variable) : '-'}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{inr(e.total)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-text-3">{payoutTotal > 0 ? ((e.total / payoutTotal) * 100).toFixed(1) : 0}%</td>
                                <td className="px-2 py-2.5 text-text-3">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                              </tr>
                              {open && (
                                <tr className="bg-surface-2">
                                  <td colSpan={7} className="px-4 py-3">
                                    <div className="space-y-1">
                                      {data.payouts.filter((p) => p.employeeId === e.employeeId).map((p) => (
                                        <div key={p.id} className="flex justify-between text-xs text-text-2">
                                          <span>{p.date} · for {monthLabel(p.forMonth)} · paid from {p.paidFrom}</span>
                                          <span className="tabular-nums">{inr(p.amount)}{p.variablePay > 0 ? ` (incl. ${inr(p.variablePay)} variable)` : ''}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {data.personalExpenses.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-3 bg-surface-2 border-b border-border">
                    <h3 className="text-base font-semibold text-text">Personal expenses counted in salaries</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {data.personalExpenses.map((o) => (
                      <div key={o.id} className="flex justify-between px-4 py-2 text-sm">
                        <span className="text-text-2">{o.employeeName}{o.description ? ` - ${o.description}` : ''} <span className="text-text-3">({o.date})</span></span>
                        <span className="tabular-nums font-medium">{inr(o.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Flags */}
              <div className="rounded-lg border border-border p-4 sm:p-5">
                <h3 className="text-base font-semibold text-text flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-warning" /> Worth a look {flagCount > 0 && <span className="text-xs font-semibold bg-warning-soft text-warning rounded-full px-2 py-0.5">{flagCount}</span>}
                </h3>
                {flagCount === 0 ? (
                  <p className="text-sm text-success">Nothing unusual - every payout is matched, in line with last month, and paid from Paytm.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-text-2">
                    {data.unmatched.count > 0 && (
                      <li><b>{data.unmatched.count} payout{data.unmatched.count === 1 ? '' : 's'} ({inr(data.unmatched.amount)})</b> couldn't be matched to an employee record, so they're left out of this total.</li>
                    )}
                    {data.notPaidThisPeriod.length > 0 && (
                      <li><b>Not paid yet this period</b> (paid last month): {data.notPaidThisPeriod.map((n) => `${n.name} (${inr(n.prevTotal)})`).join(', ')}.</li>
                    )}
                    {data.bigChanges.map((c) => (
                      <li key={c.employeeId}><b>{c.name}</b>: {inr(c.total)} vs {inr(c.prevTotal)} last month ({c.percent >= 0 ? '+' : ''}{c.percent.toFixed(0)}%).</li>
                    ))}
                    {data.nonPaytmPayouts.length > 0 && (
                      <li><b>Not paid from Paytm</b> (so they don't reduce the Paytm balance): {data.nonPaytmPayouts.map((p) => `${p.name} ${inr(p.amount)} from ${p.paidFrom}`).join(', ')}.</li>
                    )}
                    {advances.map((a) => (
                      <li key={a.id}><b>{a.employeeName}</b> has an open salary advance - {inr(a.remainingAmount)} still to deduct ({inr(a.monthlyDeduction)}/month until {a.endMonth}).</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-surface-2 border border-border p-5 text-sm text-text-2 flex items-center gap-3">
              <Lock className="w-5 h-5 text-text-3 flex-shrink-0" />
              Individual salaries are visible to the cluster head only. The totals, split and trend above are available to everyone with Analytics access.
            </div>
          )}
      </div>
    </ResponsiveModal>
  );
}
