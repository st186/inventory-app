// The person page's action sheets: reset password (managers and the owner), and the owner's
// supervisor / store / access / designation changes, plus the store-migration result. Same server
// calls as the old Employees screen's dialogs.
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '../../ui/button';
import { Callout } from '../../ui/callout';
import { Checkbox } from '../../ui/checkbox';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { ListGroup, ListRow } from '../../ui/list-row';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { SegmentedControl } from '../../ui/segmented-control';
import { NativeSelect } from '../../ui/select';
import { Skeleton } from '../../ui/skeleton';
import { StatTile, StatGrid } from '../../ui/stat-tile';
import { toast } from '../../ui/sonner';
import type * as api from '../../../utils/api';
import { teamApi } from '../teamApi';
import { DetailList, errorText } from '../shared';
import { DESIGNATION_LABELS, placeName, workplaceOf, type Employee } from './peopleUtils';

type SheetProps = { person: Employee; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => Promise<void> | void };

const subtitle = (p: Employee) => `${p.name} · ${p.employeeId}`;

// ---- Reset password ---------------------------------------------------------------------------

export function ResetPasswordSheet({ person, open, onOpenChange }: Omit<SheetProps, 'onDone'>) {
  const [password, setPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState<{ employeeId: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const reset = async () => {
    if (!password) {
      toast.error('Enter a new password');
      return;
    }
    setSaving(true);
    try {
      const r = await teamApi.resetEmployeePassword(person.employeeId, password);
      setResult(r.credentials);
      setPassword('');
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error(`Couldn't reset the password: ${errorText(error, 'unknown error')}`);
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(`${result.email} / ${result.password}`);
      setCopied(true);
    } catch {
      toast.info('Copying is blocked here. Note the details down.');
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        setResult(null);
        setPassword('');
        setCopied(false);
      }}
      dirty={!result && password !== ''}
      title={result ? 'Password changed' : 'Reset password'}
      description={subtitle(person)}
      footer={
        result ? (
          <Button size="lg" className="flex-1" onClick={() => onOpenChange(false)}>Done</Button>
        ) : (
          <Button size="lg" className="flex-1" loading={saving} disabled={!password} onClick={reset}>
            Reset password
          </Button>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <Callout tone="warning" title="Share these with them now">The new password isn't shown again.</Callout>
          <DetailList
            rows={[
              { label: 'Employee', value: `${result.employeeId} · ${person.name}` },
              { label: 'Email', value: result.email },
              { label: 'New password', value: <span className="num">{result.password}</span> },
            ]}
          />
          <Button variant="secondary" leadingIcon={copied ? <Check /> : <Copy />} onClick={copy}>
            {copied ? 'Copied' : 'Copy email and password'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Email">
            <Input value={person.email} readOnly />
          </Field>
          <Field label="New password" required helper="At least 6 characters.">
            <Input autoFocus autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      )}
    </ResponsiveModal>
  );
}

// ---- Assign supervisor (owner) --------------------------------------------------------------------

export function AssignSupervisorSheet({ person, open, onOpenChange, onDone, nameOf }: SheetProps & { nameOf: (id?: string) => string }) {
  const [managers, setManagers] = React.useState<Employee[] | null>(null);
  const [incharges, setIncharges] = React.useState<Employee[]>([]);
  const [kind, setKind] = React.useState<'manager' | 'incharge'>('manager');
  const [chosen, setChosen] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setManagers(null);
    if (person.inchargeId) {
      setKind('incharge');
      setChosen(person.inchargeId);
    } else {
      setKind('manager');
      setChosen(person.managerId || '');
    }
    teamApi
      .getAllEmployees()
      .then((all: Employee[]) => {
        if (cancelled) return;
        setManagers(all.filter((e) => e.role === 'manager'));
        setIncharges(all.filter((e) => e.designation === 'store_incharge' || e.designation === 'production_incharge'));
      })
      .catch((error: unknown) => {
        console.error('Error loading managers:', error);
        if (!cancelled) {
          setManagers([]);
          toast.error("Couldn't load managers");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, person]);

  const save = async () => {
    if (!chosen) {
      toast.error('Pick a supervisor');
      return;
    }
    setSaving(true);
    try {
      if (kind === 'incharge') {
        await teamApi.assignInchargeToEmployee(person.employeeId, chosen);
        toast.success('Incharge assigned. They now sit in that department.');
      } else {
        await teamApi.assignManagerToEmployee(person.employeeId, chosen);
        toast.success("Manager assigned. Their store now matches the manager's.");
      }
      onOpenChange(false);
      await onDone();
    } catch (error) {
      console.error('Error assigning supervisor:', error);
      toast.error(`Couldn't assign: ${errorText(error, 'unknown error')}`);
    } finally {
      setSaving(false);
    }
  };

  const list = kind === 'manager' ? managers || [] : incharges;
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Assign supervisor"
      description={subtitle(person)}
      footer={
        <Button size="lg" className="flex-1" loading={saving} disabled={!chosen} onClick={save}>
          Assign supervisor
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {(person.managerId || person.inchargeId) && (
          <DetailList rows={[{ label: 'Now reports to', value: person.inchargeId ? `${nameOf(person.inchargeId)} (incharge)` : nameOf(person.managerId) }]} />
        )}
        <Field label="Supervisor type">
          <SegmentedControl
            aria-label="Supervisor type"
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              setChosen('');
            }}
            options={[
              { value: 'manager', label: 'Operations manager' },
              { value: 'incharge', label: 'Incharge' },
            ]}
          />
        </Field>
        {managers === null ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <Field
            label={kind === 'manager' ? 'Operations manager' : 'Incharge'}
            helper={kind === 'manager' ? "Their store changes to the manager's store." : "They move to the incharge's department."}
          >
            <NativeSelect value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">{kind === 'manager' ? 'Choose a manager' : 'Choose an incharge'}</option>
              {list.map((m) => (
                <option key={m.employeeId} value={m.employeeId}>
                  {m.name} ({m.employeeId})
                  {kind === 'manager'
                    ? m.storeId
                      ? ` · Store ${m.storeId}`
                      : ' · no store'
                    : ` · ${m.designation === 'store_incharge' ? 'Store incharge' : 'Production incharge'}`}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
    </ResponsiveModal>
  );
}

// ---- Change store (owner) ---------------------------------------------------------------------

// Kitchen staff work at a production house, not a shop: offering shops here once set a
// production incharge's place to the store their kitchen supplies, and their production
// entries were filed under that store for two weeks.
export function ChangeStoreSheet({ person, open, onOpenChange, onDone, stores, productionHouses }: SheetProps & { stores: api.Store[]; productionHouses: api.ProductionHouse[] }) {
  const kitchen = workplaceOf(person, stores, productionHouses) === 'production';
  const places: { id: string; name: string; location?: string }[] = kitchen ? productionHouses : stores;
  const [storeId, setStoreId] = React.useState(person.storeId || '');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (open) setStoreId(person.storeId || '');
  }, [open, person]);

  const current = placeName(person, stores, productionHouses) || person.storeId || (kitchen ? 'No production house' : 'No store');
  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    try {
      await teamApi.updateEmployeeStore(person.employeeId, storeId);
      toast.success(`${person.name} now works at ${places.find((s) => s.id === storeId)?.name || storeId}`);
      onOpenChange(false);
      await onDone();
    } catch (error) {
      console.error('Error updating store:', error);
      toast.error(`Couldn't change the store: ${errorText(error, 'unknown error')}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={kitchen ? 'Change production house' : 'Change store'}
      description={subtitle(person)}
      footer={
        <Button size="lg" className="flex-1" loading={saving} disabled={!storeId} onClick={save}>
          {kitchen ? 'Change production house' : 'Change store'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <DetailList rows={[{ label: 'Works at now', value: current }]} />
        <Field label={kitchen ? 'New production house' : 'New store'} helper="Changes straight away.">
          <NativeSelect value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">{kitchen ? 'Choose a production house' : 'Choose a store'}</option>
            {places.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.location ? ` · ${s.location}` : ''}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {storeId && storeId !== person.storeId && (
          <Callout tone="warning" title={kitchen ? 'They move to another production house' : 'They move to another store'}>Who they report to stays the same.</Callout>
        )}
      </div>
    </ResponsiveModal>
  );
}

// ---- Manage access (owner, managers) ------------------------------------------------------------
// Several stores and/or production houses for someone covering more than one place, unlike
// Change store (one store only). These lists are what screens should read going forward.

export function ManageAccessSheet({ person, open, onOpenChange, onDone, stores, productionHouses }: SheetProps & { stores: api.Store[]; productionHouses: api.ProductionHouse[] }) {
  const [storeIds, setStoreIds] = React.useState<string[]>([]);
  const [houseIds, setHouseIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setStoreIds(person.assignedStoreIds || []);
      setHouseIds(person.assignedProductionHouseIds || []);
    }
  }, [open, person]);

  const save = async () => {
    setSaving(true);
    try {
      await teamApi.updateEmployeeAssignments(person.employeeId, storeIds, houseIds);
      toast.success(`Access updated for ${person.name}`);
      onOpenChange(false);
      await onDone();
    } catch (error) {
      toast.error(`Couldn't update access: ${errorText(error, String(error))}`);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id));
  const box = (id: string, label: string, list: string[], set: (v: string[]) => void) => (
    <label key={id} className="flex min-h-13 cursor-pointer items-center gap-3 px-4 py-2">
      <Checkbox checked={list.includes(id)} onCheckedChange={(c) => toggle(list, set, id, c === true)} aria-label={label} />
      <span className="text-body-sm text-text">{label}</span>
    </label>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Manage access"
      description={subtitle(person)}
      footer={
        <Button size="lg" className="flex-1" loading={saving} onClick={save}>
          Save access
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-text-2">Tick every store and production house they cover. Change store sets just one.</p>
        <ListGroup overline="Stores" empty={<p className="px-4 py-3 text-body-sm text-text-3">No stores found.</p>}>
          {stores.map((s) => box(s.id, `${s.name}${s.location ? ` · ${s.location}` : ''}`, storeIds, setStoreIds))}
        </ListGroup>
        <ListGroup overline="Production houses" empty={<p className="px-4 py-3 text-body-sm text-text-3">No production houses found.</p>}>
          {productionHouses.map((p) => box(p.id, `${p.name}${p.location ? ` · ${p.location}` : ''}`, houseIds, setHouseIds))}
        </ListGroup>
      </div>
    </ResponsiveModal>
  );
}

// ---- Assign designation (owner, staff logins) -----------------------------------------------------

export function AssignDesignationSheet({ person, open, onOpenChange, onDone }: SheetProps) {
  const initial = person.designation === 'store_incharge' ? 'store_incharge' : person.designation === 'production_incharge' ? 'production_incharge' : 'none';
  const [designation, setDesignation] = React.useState<'none' | 'store_incharge' | 'production_incharge'>(initial);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (open) setDesignation(initial);
  }, [open, initial]);

  const save = async () => {
    setSaving(true);
    try {
      const value = designation === 'none' ? null : designation;
      const department = designation === 'store_incharge' ? 'store_operations' : designation === 'production_incharge' ? 'production' : null;
      await teamApi.updateEmployeeDesignation(person.employeeId, value, department);
      const roleText = designation === 'store_incharge' ? 'Store incharge' : designation === 'production_incharge' ? 'Production incharge' : 'regular staff';
      toast.success(`${person.name} is now ${roleText}`);
      onOpenChange(false);
      await onDone();
    } catch (error) {
      console.error('Error updating designation:', error);
      toast.error(`Couldn't change the designation: ${errorText(error, String(error))}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Make incharge"
      description={subtitle(person)}
      footer={
        <Button size="lg" className="flex-1" loading={saving} onClick={save}>
          Save designation
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <DetailList
          rows={[
            { label: 'Now', value: person.designation ? DESIGNATION_LABELS[person.designation] || person.designation : 'Regular staff' },
            { label: 'Department', value: person.department === 'store_operations' ? 'Store operations' : 'Production', hidden: !person.department },
          ]}
        />
        <Field label="Designation">
          <NativeSelect value={designation} onChange={(e) => setDesignation(e.target.value as typeof designation)}>
            <option value="none">Regular staff (no designation)</option>
            <option value="store_incharge">Store incharge · store operations</option>
            <option value="production_incharge">Production incharge · production</option>
          </NativeSelect>
        </Field>
        {designation === 'store_incharge' && (
          <Callout tone="info" title="Store incharge">Runs the counter and the store's day: cashier, kitchen helper and store staff report to them. Reports to the operations manager.</Callout>
        )}
        {designation === 'production_incharge' && (
          <Callout tone="info" title="Production incharge">Food preparation, quality and production planning: momo makers and the kitchen team report to them. Reports to the operations manager.</Callout>
        )}
      </div>
    </ResponsiveModal>
  );
}

// ---- Store migration result (owner tool) ---------------------------------------------------------

type MigrationRow = { employeeId: string; name: string; role: string; assignedStoreId?: string; reason?: string };
export type MigrationResult = {
  summary: { total: number; updated: number; skipped: number; needsManualAssignment?: number; errors: number };
  updates?: MigrationRow[];
  manualAssignmentNeeded?: MigrationRow[];
  errorDetails?: MigrationRow[];
};

export function MigrationResultSheet({ result, open, onOpenChange }: { result: MigrationResult | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!result) return null;
  const s = result.summary;
  const group = (title: string, rows: MigrationRow[] | undefined, line: (r: MigrationRow) => string) =>
    rows && rows.length > 0 ? (
      <ListGroup overline={`${title} (${rows.length})`}>
        {rows.map((r, i) => (
          <ListRow key={`${r.employeeId}-${i}`} density="compact" title={`${r.name} · ${r.employeeId}`} subtitle={line(r)} />
        ))}
      </ListGroup>
    ) : null;
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Store migration done" size="detail" footer={<Button size="lg" className="flex-1" onClick={() => onOpenChange(false)}>Done</Button>}>
      <div className="flex flex-col gap-4">
        <StatGrid columns={4}>
          <StatTile label="People" value={s.total} />
          <StatTile label="Updated" value={s.updated} />
          <StatTile label="Skipped" value={s.skipped} />
          <StatTile label="Need a store" value={s.needsManualAssignment || 0} tone={(s.needsManualAssignment || 0) > 0 ? 'danger' : 'default'} />
        </StatGrid>
        {s.errors > 0 && <Callout tone="danger" title={`${s.errors} could not be updated`}>See the list below.</Callout>}
        {group('Updated', result.updates, (r) => `${r.role} · store ${r.assignedStoreId}`)}
        {group('Need a store set by hand', result.manualAssignmentNeeded, (r) => `${r.role} · ${r.reason}`)}
        {result.manualAssignmentNeeded && result.manualAssignmentNeeded.length > 0 && (
          <Callout tone="warning" title="What to do">Give these managers a store in Setup, or give these staff a manager.</Callout>
        )}
        {group('Errors', result.errorDetails, (r) => `${r.role} · ${r.reason}`)}
      </div>
    </ResponsiveModal>
  );
}
