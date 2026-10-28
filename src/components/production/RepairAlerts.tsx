// Machines down (owner, 28 Oct 2026): a breakdown given as the reason for leftover stuffing raises
// a repair alarm. It sits on the incharge's and the owner's Home until someone marks the machine
// repaired, with what it cost and what was done (server repairs.ts).
import * as React from 'react';
import { CheckCircle2, Wrench } from 'lucide-react';
import * as api from '../../utils/api';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { MoneyInput } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';

export function useRepairAlerts(enabled: boolean, accessToken?: string) {
  const [alerts, setAlerts] = React.useState<api.RepairAlert[]>([]);
  const reload = React.useCallback(() => {
    if (!enabled) return;
    api.getRepairAlerts(accessToken).then(setAlerts).catch(() => undefined);
  }, [enabled, accessToken]);
  React.useEffect(() => { reload(); }, [reload]);
  return { alerts, reload };
}

const fmt12 = (hhmm?: string | null) => {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const repairLine = (a: api.RepairAlert) => [
  a.locationName || (a.locationKind === 'store' ? 'Store' : 'Production'),
  new Date(`${a.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  a.downFrom ? (a.stillDown || !a.downTo ? `down since ${fmt12(a.downFrom)}` : `down ${fmt12(a.downFrom)}–${fmt12(a.downTo)}`) : '',
].filter(Boolean).join(' · ');

function AlertCard({ alert, onDone }: { alert: api.RepairAlert; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [cost, setCost] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.markRepairFixed(alert.id, note.trim() || undefined, cost);
      toast.success('Marked repaired');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-body-md font-semibold text-text">{alert.machine}</span>
        <StatusChip tone="danger" icon={Wrench}>{alert.stillDown ? 'Down' : 'Needs repair'}</StatusChip>
      </div>
      <p className="num text-label text-text-3">{repairLine(alert)} · by {alert.reportedBy}</p>
      {alert.alternative && <p className="text-body-sm text-text-2"><span className="font-medium text-text">Used instead:</span> {alert.alternative}</p>}
      {open ? (
        <div className="flex flex-col gap-3 pt-1">
          <Field label="What was done" optional>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. new heating coil, fixed by the technician" />
          </Field>
          <Field label="Repair cost" optional helper="Log the bill in Expenses too.">
            <MoneyInput value={cost} onValueChange={setCost} decimals={0} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" leadingIcon={<CheckCircle2 />} loading={busy} onClick={save}>Save, it's repaired</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="pt-1">
          <Button size="sm" variant="secondary" leadingIcon={<CheckCircle2 />} onClick={() => setOpen(true)}>Mark repaired</Button>
        </div>
      )}
    </div>
  );
}

export function RepairAlertsSheet({ open, onOpenChange, alerts, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerts: api.RepairAlert[];
  onChanged: () => void;
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Machines to repair" description="Raised when a breakdown is given as the reason for leftover stuffing." size="detail">
      {alerts.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title="Nothing down" body="Every reported machine is repaired." />
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a) => <AlertCard key={a.id} alert={a} onDone={onChanged} />)}
        </div>
      )}
    </ResponsiveModal>
  );
}
