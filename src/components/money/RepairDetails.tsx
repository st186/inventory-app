// The extra fields on Add expense for repairs, labour and equipment (owner, 28 Oct 2026, the
// expenses plan): which machine, what was wrong or what job, who did it (the technician list, with
// their number to call), and the bill photo - required above ₹500 (server expensePaperwork.ts).
import { useEffect, useRef, useState } from 'react';
import { Camera, Phone, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { NativeSelect } from '../ui/select';
import { listAssets, compressPhoto, type AssetRow } from '../assets/assetsApi';
import { addTechnician, listTechnicians, type RepairInfo, type Technician } from './paperworkApi';

const OTHER = '__other';
const OWN_STAFF = '__staff';
const NEW_TECH = '__new';
export const OWN_STAFF_NAME = 'Our own staff';
export const emptyRepair = (): RepairInfo => ({ assetId: null, machine: '', fault: '', technicianId: null, technicianName: '' });

// What still needs filling in before saving, or null when it's complete.
export function repairMissing(kind: 'repair' | 'labour', r: RepairInfo): string | null {
  if (kind === 'repair' && !r.assetId && !r.machine.trim()) return 'Pick the machine that was repaired';
  if (!r.fault.trim()) return kind === 'repair' ? 'Write what was wrong with it' : 'Write what job was done';
  if (!r.technicianName.trim()) return 'Pick who did the work';
  return null;
}

export function RepairFields({ kind, place, value, onChange }: {
  kind: 'repair' | 'labour';
  place: { kind: 'store' | 'production_house'; id: string } | null;
  value: RepairInfo;
  onChange: (next: RepairInfo) => void;
}) {
  const [machines, setMachines] = useState<AssetRow[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[] | null>(null);
  const [otherMachine, setOtherMachine] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAssets().then((r) => {
      if (cancelled) return;
      setMachines(r.assets.filter((a) => place && a.locationKind === place.kind && a.locationId === place.id && a.condition !== 'disposed' && !a.disposedAt));
    }).catch(() => { if (!cancelled) setMachines([]); });
    listTechnicians().then((list) => { if (!cancelled) setTechnicians(list); }).catch(() => { if (!cancelled) setTechnicians([]); });
    return () => { cancelled = true; };
  }, [place?.kind, place?.id]);

  const machineValue = value.assetId || (otherMachine || value.machine ? OTHER : '');
  const pickMachine = (v: string) => {
    if (v === OTHER) { setOtherMachine(true); onChange({ ...value, assetId: null, machine: '' }); return; }
    setOtherMachine(false);
    const a = machines?.find((m) => m.id === v);
    onChange({ ...value, assetId: a?.id || null, machine: a?.name || '' });
  };
  const techValue = value.technicianId || (value.technicianName === OWN_STAFF_NAME ? OWN_STAFF : adding ? NEW_TECH : '');
  const pickTech = (v: string) => {
    if (v === NEW_TECH) { setAdding(true); onChange({ ...value, technicianId: null, technicianName: '' }); return; }
    setAdding(false);
    if (v === OWN_STAFF) { onChange({ ...value, technicianId: null, technicianName: OWN_STAFF_NAME }); return; }
    const t = technicians?.find((x) => x.id === v);
    onChange({ ...value, technicianId: t?.id || null, technicianName: t?.name || '' });
  };
  const saveTech = async () => {
    setSaving(true);
    try {
      // What they do comes from this job (owner, 1 Nov 2026: "how many times do i have to enter what
      // was done"): the job for labour, the machine for a repair.
      const trade = (kind === 'repair' ? value.machine || value.fault : value.fault).trim().slice(0, 60);
      const t = await addTechnician({ name: draft.name.trim(), phone: draft.phone.trim(), trade });
      setTechnicians((list) => [...(list || []).filter((x) => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name)));
      setAdding(false);
      setDraft({ name: '', phone: '' });
      onChange({ ...value, technicianId: t.id, technicianName: t.name });
    } catch (e) {
      toast.error((e as Error).message || 'Could not save the technician');
    } finally {
      setSaving(false);
    }
  };
  const picked = technicians?.find((x) => x.id === value.technicianId);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/50 p-3">
      <p className="text-body-sm font-semibold text-text">{kind === 'repair' ? 'Repair details' : 'Job details'}</p>
      <Field label={kind === 'repair' ? 'Which machine' : 'Which machine or place (if any)'} required={kind === 'repair'} optional={kind !== 'repair'}>
        <NativeSelect value={machineValue} onChange={(e) => pickMachine(e.target.value)}>
          <option value="">{machines === null ? 'Loading…' : 'Pick one'}</option>
          {(machines || []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.quantity > 1 ? ` (×${m.quantity})` : ''}</option>)}
          <option value={OTHER}>Something not in the list</option>
        </NativeSelect>
      </Field>
      {machineValue === OTHER && (
        <Field label="Name it" required={kind === 'repair'}>
          <Input value={value.machine} onChange={(e) => onChange({ ...value, assetId: null, machine: e.target.value })} placeholder="e.g. Deep freezer" maxLength={60} />
        </Field>
      )}
      <Field label={kind === 'repair' ? 'What was wrong' : 'What job was done'} required>
        <Input value={value.fault} onChange={(e) => onChange({ ...value, fault: e.target.value })} placeholder={kind === 'repair' ? 'e.g. not cooling, gas refilled' : 'e.g. fitted new exhaust fan'} maxLength={120} />
      </Field>
      <Field label="Who did it" required>
        <div className="flex gap-2">
          <NativeSelect className="min-w-0 flex-1" value={techValue} onChange={(e) => pickTech(e.target.value)}>
            <option value="">{technicians === null ? 'Loading…' : 'Pick one'}</option>
            {(technicians || []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.trade ? ` · ${t.trade}` : ''}</option>)}
            <option value={OWN_STAFF}>{OWN_STAFF_NAME}</option>
            <option value={NEW_TECH}>+ Add a new technician</option>
          </NativeSelect>
          {picked && <IconButton variant="secondary" icon={<Phone />} label={`Call ${picked.name}`} href={`tel:${picked.phone}`} />}
        </div>
      </Field>
      {adding && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" required><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} /></Field>
            <Field label="Phone" required><Input type="tel" inputMode="tel" className="num" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} maxLength={16} /></Field>
          </div>
          <Button size="sm" className="self-start" leadingIcon={<Plus />} loading={saving} onClick={saveTech}>Save technician</Button>
        </div>
      )}
    </div>
  );
}

// The bill photo: taken with the camera, shown small, retaken or removed before saving.
export function BillPhotoField({ value, onChange, required }: { value: string | null; onChange: (dataUrl: string | null) => void; required: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const take = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { onChange(await compressPhoto(file)); } catch (err) { toast.error((err as Error).message || 'Could not read that photo'); } finally { setBusy(false); }
  };
  return (
    <Field label="Bill photo" required={required} optional={!required} helper={required ? 'Repairs, labour and equipment above ₹500 need a photo of the bill. Bunny reads it and checks it against the entry.' : 'Bunny reads the bill and checks the amount, date and items against the entry.'}>
      <div className="flex items-center gap-3">
        {value ? (
          <>
            <img src={value} alt="Bill" className="size-16 shrink-0 rounded-md border border-border object-cover" />
            <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} loading={busy} onClick={() => input.current?.click()}>Retake</Button>
            <IconButton variant="ghost" icon={<Trash2 />} label="Remove the bill photo" onClick={() => onChange(null)} />
          </>
        ) : (
          <Button variant="secondary" leadingIcon={<Camera />} loading={busy} onClick={() => input.current?.click()}>Take bill photo</Button>
        )}
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={take} />
      </div>
    </Field>
  );
}
