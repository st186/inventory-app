// Team → Pay list: period chip and who (All · Permanent · Contract), the salary-advance row,
// three summary tiles, then one row per person (a table from 1024 px). Tapping a person opens
// their payslip.
import * as React from 'react';
import { AlertCircle, Banknote, ChevronRight, Users, Wallet } from 'lucide-react';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { InitialsAvatar } from '../../ui/avatar';
import { IconWell, ListGroup, ListRow } from '../../ui/list-row';
import { Money, formatINR } from '../../ui/money';
import { SegmentedControl } from '../../ui/segmented-control';
import { StatTile } from '../../ui/stat-tile';
import { StatusChip } from '../../ui/status-chip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { useT } from '../../../utils/i18n';
import { TeamPage } from '../shared';
import type { MonthBounds } from '../payrollMath';
import type { PayRow, PayView } from './payView';
import { PayRowItem, PayStatusChip, PeriodChip, type PeriodState } from './PayParts';

export type Segment = 'all' | 'fulltime' | 'contract';

export function PayTeamView({
  view,
  segment,
  onSegment,
  canSeePermanent,
  period,
  onPeriod,
  bounds,
  pendingAdvances,
  onOpenAdvances,
  showMyPay,
  onOpenMyPay,
  onOpenRow,
  addPayout,
}: {
  view: PayView;
  segment: Segment;
  onSegment: (s: Segment) => void;
  canSeePermanent: boolean;
  period: PeriodState;
  onPeriod: (p: PeriodState) => void;
  bounds: { current: MonthBounds; last: MonthBounds };
  pendingAdvances: number | null;
  onOpenAdvances?: () => void;
  showMyPay: boolean;
  onOpenMyPay: () => void;
  onOpenRow: (row: PayRow) => void;
  addPayout: { visible: boolean; onClick: () => void };
}) {
  const { t } = useT();
  const seg: Segment = canSeePermanent ? segment : 'contract';
  const showPermanent = seg !== 'contract';
  const showContract = seg !== 'fulltime';
  const monthView = view.monthView;

  const paid = (showPermanent ? view.permanent.total : 0) + (showContract ? view.contract.total : 0);
  const people = (showPermanent ? view.permanent.rows.length : 0) + (showContract ? view.contract.rows.length : 0);
  const former = view.former.filter((r) => (r.type === 'contract' ? showContract : showPermanent));

  const tiles =
    seg === 'contract' ? (
      <>
        <StatTile label={t('team.pay.paid')} value={<Money value={paid} />} />
        <StatTile label={t('team.pay.daysPaid')} value={<span className="num">{view.contract.daysPaid}</span>} />
        <StatTile label={t('team.pay.people')} value={<span className="num">{people}</span>} className="col-span-2 sm:col-span-1" />
      </>
    ) : monthView ? (
      <>
        <StatTile label={t('team.pay.toPay')} value={<Money value={view.permanent.toPay} />} caption={t('team.pay.toPayHint')} />
        <StatTile label={t('team.pay.paid')} value={<Money value={paid} />} caption={seg === 'all' && view.contract.total ? t('team.pay.inclContract', { amount: formatINR(view.contract.total) }) : undefined} />
        <StatTile
          label={t('team.pay.stillDue')}
          value={<Money value={view.permanent.stillDue} className={view.permanent.stillDue > 0 ? 'text-warning' : undefined} />}
          className="col-span-2 sm:col-span-1"
        />
      </>
    ) : (
      <>
        <StatTile label={t('team.pay.paid')} value={<Money value={paid} />} />
        <StatTile label={t('team.pay.people')} value={<span className="num">{people}</span>} />
      </>
    );

  const groups: { title: string; rows: PayRow[] }[] = [];
  if (showPermanent) groups.push({ title: t('team.pay.permanentN', { n: view.permanent.rows.length }), rows: view.permanent.rows });
  if (showContract) groups.push({ title: t('team.pay.contractN', { n: view.contract.rows.length }), rows: view.contract.rows });
  if (former.length) groups.push({ title: t('team.pay.formerN', { n: former.length }), rows: former });
  const allRows = groups.flatMap((g) => g.rows);

  return (
    <TeamPage data-ai-private>
      <div className="flex flex-wrap items-center gap-2">
        <PeriodChip value={period} onChange={onPeriod} current={bounds.current} last={bounds.last} />
        {canSeePermanent && (
          <SegmentedControl
            size="sm"
            aria-label={t('team.pay.who')}
            value={seg}
            onValueChange={onSegment}
            className="min-w-[240px] flex-1"
            options={[
              { value: 'all', label: t('team.pay.all') },
              { value: 'fulltime', label: t('team.type.fulltime') },
              { value: 'contract', label: t('team.type.contract') },
            ]}
          />
        )}
      </div>

      {onOpenAdvances && pendingAdvances !== null && (
        <button
          type="button"
          onClick={onOpenAdvances}
          className="flex min-h-15 w-full items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconWell icon={pendingAdvances > 0 ? AlertCircle : Wallet} tone={pendingAdvances > 0 ? 'warning' : 'neutral'} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-md font-semibold text-text">
              {pendingAdvances === 1 ? t('team.pay.advanceRequestsOne') : t('team.pay.advanceRequests', { n: pendingAdvances })}
            </span>
            <span className="text-label text-text-3">{pendingAdvances > 0 ? t('team.pay.waitingForYou') : t('team.pay.advancesHint')}</span>
          </span>
          <ChevronRight className="size-5 text-text-disabled" aria-hidden="true" />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{tiles}</div>

      {showMyPay && (
        <ListGroup>
          <ListRow icon={Wallet} title={t('team.pay.myPay')} subtitle={t('team.pay.myPayHint')} onClick={onOpenMyPay} />
        </ListGroup>
      )}

      {allRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Users}
            title={seg === 'fulltime' ? t('team.pay.emptyPermanent') : seg === 'contract' ? t('team.pay.emptyContract') : t('team.pay.emptyAll')}
            body={t('team.pay.emptyBody')}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-5 lg:hidden">
            {groups.map((g, i) => (
              <ListGroup
                key={g.title}
                title={g.title}
                action={i === 0 && addPayout.visible ? <Button variant="secondary" size="sm" leadingIcon={<Banknote />} onClick={addPayout.onClick}>{t('team.pay.addPayout')}</Button> : undefined}
                empty={<p className="px-4 py-3 text-body-sm text-text-3">{t('team.pay.nobodyHere')}</p>}
              >
                {g.rows.map((r) => (
                  <PayRowItem key={r.key} row={r} onOpen={() => onOpenRow(r)} />
                ))}
              </ListGroup>
            ))}
          </div>
          <div className="hidden flex-col gap-3 lg:flex">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-subtitle font-semibold text-text">{t('team.pay.people')}</h2>
              {addPayout.visible && <Button variant="secondary" leadingIcon={<Banknote />} onClick={addPayout.onClick}>{t('team.pay.addPayout')}</Button>}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('team.details.name')}</TableHead>
                  <TableHead>{t('team.pay.type')}</TableHead>
                  <TableHead>{t('team.pay.howPaid')}</TableHead>
                  <TableHead numeric>{t('team.pay.paid')}</TableHead>
                  <TableHead numeric>{t('team.pay.amountCol')}</TableHead>
                  <TableHead>{t('team.pay.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRows.map((r) => (
                  <TableRow
                    key={r.key}
                    tabIndex={0}
                    className="cursor-pointer focus-visible:bg-surface-2 focus-visible:outline-none"
                    onClick={() => onOpenRow(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenRow(r);
                      }
                    }}
                  >
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <InitialsAvatar name={r.name} size={32} />
                        <span className="flex flex-col">
                          <span className="font-medium">{r.name}</span>
                          {r.employee && <span className="num text-label text-text-3">{r.employee.employeeId}</span>}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>{r.former ? t('team.pay.former') : r.type === 'contract' ? t('team.type.contract') : t('team.type.fulltime')}</TableCell>
                    <TableCell className="text-text-2">
                      {r.type === 'contract'
                        ? r.employee?.dailyRate
                          ? t('team.pay.daysAtRate', { n: r.daysWorked, rate: formatINR(r.employee.dailyRate) })
                          : t('team.pay.daysPaidN', { n: r.daysWorked })
                        : r.salary
                          ? t('team.pay.salaryAmount', { amount: formatINR(r.salary) })
                          : t('team.pay.noSalary')}
                    </TableCell>
                    <TableCell numeric><Money value={r.paid} /></TableCell>
                    <TableCell numeric><Money value={r.amount} className="font-semibold" /></TableCell>
                    <TableCell>{r.status ? <PayStatusChip status={r.status} /> : r.paid > 0 ? <StatusChip status="pay.paid" /> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-center text-label text-text-3">{t('team.pay.tapHint')}</p>
        </>
      )}
    </TeamPage>
  );
}
