// Team → People: search, filter chips, one summary line, then a list of people (a sortable table
// from 1024 px). The FAB adds a person.
import * as React from 'react';
import { ChevronDown, ChevronUp, History, RefreshCw, Search, UserCog, UserPlus, Users } from 'lucide-react';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { ErrorState } from '../../ui/error-state';
import { FilterChips } from '../../ui/chip';
import { Input } from '../../ui/input';
import { InitialsAvatar } from '../../ui/avatar';
import { ListGroup, ListRow } from '../../ui/list-row';
import { Money } from '../../ui/money';
import { Skeleton, SkeletonListRows } from '../../ui/skeleton';
import { StatusChip } from '../../ui/status-chip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type SortDirection } from '../../ui/table';
import type * as api from '../../../utils/api';
import { Fab, TeamPage, useHeaderOffset } from '../shared';
import {
  chipFor,
  durationText,
  formatJoin,
  matchesFilter,
  matchesSearch,
  placeName,
  roleLine,
  summaryLine,
  typeLabel,
  type Employee,
  type PeopleFilter,
  type SortKey,
} from './peopleUtils';

export type ArchivedPerson = Employee & { releasedAt?: string; totalEarnings?: number };

export function PeopleList({
  employees,
  archived,
  loading,
  error,
  onRetry,
  isClusterHead,
  stores,
  productionHouses,
  onOpen,
  onAdd,
  onRestore,
  onMigrate,
  onSyncDesignations,
  busy,
}: {
  employees: Employee[];
  archived: ArchivedPerson[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isClusterHead: boolean;
  stores: api.Store[];
  productionHouses: api.ProductionHouse[];
  onOpen: (employeeId: string) => void;
  onAdd: () => void;
  onRestore: (person: ArchivedPerson) => void;
  onMigrate: () => void;
  onSyncDesignations: () => void;
  busy: boolean;
}) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<PeopleFilter>('all');
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [showPast, setShowPast] = React.useState(false);
  const headerOffset = useHeaderOffset();

  const shown = React.useMemo(
    () => employees.filter((e) => matchesSearch(e, search) && matchesFilter(e, filter, stores, productionHouses)),
    [employees, search, filter, stores, productionHouses],
  );

  const sorted = React.useMemo(() => {
    const val = (e: Employee): string => {
      switch (sort.key) {
        case 'employeeId':
          return e.employeeId;
        case 'role':
          return roleLine(e);
        case 'store':
          return placeName(e, stores, productionHouses) || '';
        case 'type':
          return typeLabel(e);
        case 'joiningDate':
          return e.joiningDate || '';
        case 'status':
          return e.status || '';
        default:
          return e.name.toLowerCase();
      }
    };
    const list = [...shown].sort((a, b) => val(a).localeCompare(val(b), undefined, { numeric: true }));
    return sort.dir === 'asc' ? list : list.reverse();
  }, [shown, sort, stores, productionHouses]);

  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const dirOf = (key: SortKey): SortDirection => (sort.key === key ? sort.dir : false);

  const filterOptions: { value: PeopleFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'store', label: 'Store' },
    { value: 'production', label: 'Production' },
    { value: 'contract', label: 'Contract' },
    { value: 'inactive', label: 'Inactive' },
  ];

  return (
    <TeamPage wide data-ai-private>
      <div className="sticky z-(--z-sticky) -mx-4 -mt-4 flex flex-col gap-2 bg-bg px-4 pt-4 pb-2 lg:-mx-8 lg:px-8" style={{ top: headerOffset }}>
        <div className="flex items-center gap-3">
          <Input
            type="search"
            aria-label="Search people"
            placeholder="Search by name, ID or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leading={<Search />}
            wrapperClassName="flex-1"
          />
          <Button className="hidden md:inline-flex" leadingIcon={<UserPlus />} onClick={onAdd}>
            Add person
          </Button>
        </div>
        <FilterChips aria-label="Show" value={filter} onValueChange={setFilter} options={filterOptions} />
      </div>

      {error ? (
        <ErrorState body={error} onRetry={onRetry} retrying={loading} />
      ) : loading && employees.length === 0 ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-4 w-56" />
          <SkeletonListRows count={6} leading="avatar" />
        </div>
      ) : (
        <>
          <p className="text-label text-text-3" aria-live="polite">
            {search || filter !== 'all' ? `${shown.length} of ${summaryLine(employees, isClusterHead)}` : summaryLine(employees, isClusterHead)}
          </p>

          {sorted.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <EmptyState
                icon={Users}
                title={employees.length === 0 ? 'No one here yet' : 'Nobody matches'}
                body={employees.length === 0 ? 'Add your staff to track their pay, attendance and checks.' : search ? `Nothing matches "${search}".` : 'Try another filter.'}
                action={
                  employees.length === 0 ? (
                    <Button variant="secondary" leadingIcon={<UserPlus />} onClick={onAdd}>Add person</Button>
                  ) : (
                    <Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Show everyone</Button>
                  )
                }
              />
            </div>
          ) : (
            <>
              <div className="lg:hidden">
                <ListGroup>
                  {sorted.map((e) => {
                    const chip = chipFor(e);
                    const place = placeName(e, stores, productionHouses);
                    return (
                      <ListRow
                        key={e.employeeId}
                        leading={<InitialsAvatar name={e.name} status={e.status === 'active' ? 'success' : 'neutral'} statusLabel={e.status === 'active' ? 'Active' : 'Inactive'} />}
                        title={e.name}
                        subtitle={[roleLine(e), place].filter(Boolean).join(' · ')}
                        trailing={<StatusChip tone={chip.tone}>{chip.label}</StatusChip>}
                        chevron
                        onClick={() => onOpen(e.employeeId)}
                      />
                    );
                  })}
                </ListGroup>
              </div>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead sortDirection={dirOf('name')} onSort={() => sortBy('name')}>Name</TableHead>
                      <TableHead sortDirection={dirOf('employeeId')} onSort={() => sortBy('employeeId')}>ID</TableHead>
                      <TableHead sortDirection={dirOf('role')} onSort={() => sortBy('role')}>Role</TableHead>
                      {isClusterHead && <TableHead sortDirection={dirOf('store')} onSort={() => sortBy('store')}>Works at</TableHead>}
                      <TableHead sortDirection={dirOf('type')} onSort={() => sortBy('type')}>Type</TableHead>
                      <TableHead sortDirection={dirOf('joiningDate')} onSort={() => sortBy('joiningDate')}>Joined</TableHead>
                      <TableHead sortDirection={dirOf('status')} onSort={() => sortBy('status')}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((e) => (
                      <TableRow
                        key={e.employeeId}
                        tabIndex={0}
                        className="cursor-pointer focus-visible:bg-surface-2 focus-visible:outline-none"
                        onClick={() => onOpen(e.employeeId)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            onOpen(e.employeeId);
                          }
                        }}
                      >
                        <TableCell>
                          <span className="flex items-center gap-3">
                            <InitialsAvatar name={e.name} size={32} />
                            <span className="font-medium">{e.name}</span>
                          </span>
                        </TableCell>
                        <TableCell className="num text-text-2">{e.employeeId}</TableCell>
                        <TableCell>{roleLine(e)}</TableCell>
                        {isClusterHead && <TableCell className="text-text-2">{placeName(e, stores, productionHouses) || 'No store'}</TableCell>}
                        <TableCell>{typeLabel(e)}</TableCell>
                        <TableCell className="text-text-2">{formatJoin(e.joiningDate)}</TableCell>
                        <TableCell>
                          <StatusChip tone={e.status === 'active' ? 'success' : 'neutral'} dot>{e.status === 'active' ? 'Active' : 'Inactive'}</StatusChip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {isClusterHead && (
            <ListGroup overline="Owner tools">
              {archived.length > 0 && (
                <ListRow
                  icon={History}
                  title={`Past people (${archived.length})`}
                  subtitle="Released staff; bring someone back"
                  chevron={false}
                  trailing={showPast ? <ChevronUp className="size-5 text-text-3" aria-hidden="true" /> : <ChevronDown className="size-5 text-text-3" aria-hidden="true" />}
                  aria-expanded={showPast}
                  onClick={() => setShowPast((v) => !v)}
                />
              )}
              {showPast &&
                archived.map((p) => (
                  <ListRow
                    key={p.employeeId}
                    leading={<InitialsAvatar name={p.name} />}
                    title={p.name}
                    subtitle={
                      <>
                        {p.employeeId} · left {formatJoin(p.releasedAt)} · {durationText(p.joiningDate || p.createdAt, p.releasedAt)} · earned <Money value={p.totalEarnings || 0} />
                      </>
                    }
                    trailing={
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRestore(p)}>
                        Restore
                      </Button>
                    }
                  />
                ))}
              <ListRow icon={RefreshCw} title="Fill in missing stores" subtitle="Give staff their manager's store" onClick={busy ? undefined : onMigrate} disabled={busy} />
              <ListRow icon={UserCog} title="Sync designations to logins" subtitle="So incharges get their full menus after signing in again" onClick={busy ? undefined : onSyncDesignations} disabled={busy} />
            </ListGroup>
          )}
        </>
      )}

      <Fab icon={<UserPlus />} label="Add person" onClick={onAdd} />
    </TeamPage>
  );
}
