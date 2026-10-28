// Add person (stepped: Basics → Pay → Documents) and Edit person, plus the salary-structure and
// Aadhaar pieces both use. Sheets on phones, dialogs from 768 px.
import * as React from 'react';
import { Check, Copy, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Callout } from '../../ui/callout';
import { Field } from '../../ui/field';
import { IconButton } from '../../ui/icon-button';
import { Input } from '../../ui/input';
import { MoneyInput, formatINR } from '../../ui/money';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { SegmentedControl } from '../../ui/segmented-control';
import { NativeSelect } from '../../ui/select';
import { toast } from '../../ui/sonner';
import { DatePicker } from '../../DatePicker';
import { getTodayIST } from '../../../utils/timezone';
import type * as api from '../../../utils/api';
import { teamApi } from '../teamApi';
import { DetailList, errorText } from '../shared';
import type { Employee } from './peopleUtils';

type Part = { label: string; amount: number; fromMonth?: string };

/** Fixed monthly salary parts (Basic, HRA, ...): they drive the payslip's breakdown. */
export function SalaryStructureEditor({ value, onChange, help }: { value: Part[]; onChange: (next: Part[]) => void; help?: string }) {
  const total = value.reduce((sum, c) => sum + (c.amount || 0), 0);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm font-medium text-text">Fixed salary parts <span className="font-normal text-text-3">· Optional</span></span>
        <Button variant="link" size="sm" leadingIcon={<Plus />} onClick={() => onChange([...value, { label: '', amount: 0 }])}>
          Add a part
        </Button>
      </div>
      {value.map((part, idx) => (
        <div key={idx} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            aria-label={`Part ${idx + 1} name`}
            value={part.label}
            placeholder="Basic, HRA, Conveyance"
            onChange={(e) => onChange(value.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)))}
            className="min-w-0"
          />
          <MoneyInput
            aria-label={`Part ${idx + 1} amount`}
            value={part.amount || null}
            onValueChange={(n) => onChange(value.map((p, i) => (i === idx ? { ...p, amount: n ?? 0 } : p)))}
            wrapperClassName="w-32 shrink-0"
            decimals={0}
          />
          <IconButton label={`Remove part ${idx + 1}`} icon={<Trash2 />} variant="danger-ghost" onClick={() => onChange(value.filter((_, i) => i !== idx))} />
        </div>
        {part.fromMonth && <p className="text-caption text-text-3">From {new Date(`${part.fromMonth}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>}
        </div>
      ))}
      {value.length > 0 && <p className="num text-body-sm font-medium text-text">Fixed total {formatINR(total)} a month</p>}
      <p className="text-caption text-text-3">{help ?? 'These show on the payslip every month. Variable pay is entered with each payout.'}</p>
    </div>
  );
}

function readImage(file: File | undefined, onDone: (dataUrl: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.onloadend = () => onDone(reader.result as string);
  reader.readAsDataURL(file);
}

/** Aadhaar front / back picker with a preview of what was picked. */
export function AadhaarPicker({ front, back, onFront, onBack }: { front: string; back: string; onFront: (v: string) => void; onBack: (v: string) => void }) {
  const tile = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex min-h-11 cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-border-strong bg-surface p-3 outline-none focus-within:ring-2 focus-within:ring-ring">
      <span className="text-body-sm font-medium text-text">{label}</span>
      {value ? (
        <img src={value} alt={`${label}, picked`} className="h-28 w-full rounded-md object-cover" />
      ) : (
        <span className="flex h-28 items-center justify-center rounded-md bg-surface-2 text-text-2">
          <ImagePlus className="size-6" aria-hidden="true" />
        </span>
      )}
      <span className="text-label font-medium text-primary">{value ? 'Change photo' : 'Add photo'}</span>
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => readImage(e.target.files?.[0], set)} />
    </label>
  );
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
      {tile('Aadhaar front', front, onFront)}
      {tile('Aadhaar back', back, onBack)}
    </div>
  );
}

// ---- Add person -------------------------------------------------------------------------------

type NewPerson = {
  name: string;
  email: string;
  password: string;
  role: 'manager' | 'employee' | 'cluster_head';
  employmentType: 'fulltime' | 'contract';
  joiningDate: string;
  dob: string;
  phone: string;
  storeId: string;
  salaryStructure: Part[];
};

const blankPerson = (storeId: string): NewPerson => ({
  name: '',
  email: '',
  password: '',
  role: 'employee',
  employmentType: 'fulltime',
  joiningDate: getTodayIST(),
  dob: '',
  phone: '',
  storeId,
  salaryStructure: [],
});

const STEPS = ['Basics', 'Pay', 'Documents'] as const;

export function AddPersonForm({
  open,
  onOpenChange,
  isClusterHead,
  isManager,
  stores,
  user,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isClusterHead: boolean;
  isManager: boolean;
  stores: api.Store[];
  user: { email: string; employeeId?: string; storeId?: string | null };
  onCreated: () => Promise<void> | void;
}) {
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<NewPerson>(() => blankPerson(user.storeId || ''));
  const [front, setFront] = React.useState('');
  const [back, setBack] = React.useState('');
  const [errors, setErrors] = React.useState<Partial<Record<'name' | 'email' | 'password', string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [created, setCreated] = React.useState<{ employeeId: string; name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Owners are always permanent.
  React.useEffect(() => {
    if (form.role === 'cluster_head' && form.employmentType !== 'fulltime') setForm((f) => ({ ...f, employmentType: 'fulltime' }));
  }, [form.role, form.employmentType]);

  const reset = () => {
    setStep(0);
    setForm(blankPerson(user.storeId || ''));
    setFront('');
    setBack('');
    setErrors({});
    setCreated(null);
    setCopied(false);
  };

  const dirty = !created && (form.name !== '' || form.email !== '' || form.password !== '' || form.phone !== '' || !!front || !!back || form.salaryStructure.length > 0);
  const set = <K extends keyof NewPerson>(key: K, value: NewPerson[K]) => setForm((f) => ({ ...f, [key]: value }));

  const checkBasics = () => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Enter their name';
    if (!form.email.trim()) next.email = 'Enter an email they will sign in with';
    if (!form.password) next.password = 'Choose a password for them';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const create = async () => {
    if (!checkBasics()) {
      setStep(0);
      return;
    }
    if (isManager && form.role === 'manager') {
      toast.error('Only the owner can add managers');
      return;
    }
    setSaving(true);
    try {
      // No employee id here: the server issues it, counting archived staff too, so a new hire can
      // never be handed a former employee's id (and their history).
      const employeeData: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        employmentType: form.employmentType,
        joiningDate: form.joiningDate,
        dob: form.dob,
        phone: form.phone,
        status: 'active',
        createdBy: user.email,
        createdAt: new Date().toISOString(),
      };
      if (form.salaryStructure.length > 0) employeeData.salaryStructure = form.salaryStructure.filter((c) => c.label.trim());
      if (form.role === 'employee') {
        employeeData.managerId = user.employeeId; // reports to the person adding them
        if (isManager && user.storeId) employeeData.storeId = user.storeId; // a manager's staff join their store
      } else if (form.role === 'manager') {
        employeeData.clusterHeadId = user.employeeId;
        if (form.storeId) employeeData.storeId = form.storeId;
      }
      if (front) employeeData.aadharFront = front;
      if (back) employeeData.aadharBack = back;

      const result = await teamApi.createUnifiedEmployee(employeeData);
      setCreated({ employeeId: result?.employee?.employeeId || '(see the list)', name: form.name, email: form.email, password: form.password });
      await onCreated();
    } catch (error) {
      console.error('Error creating employee:', error);
      toast.error("Couldn't add them. The email might already be in use.");
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`${created.email} / ${created.password}`);
      setCopied(true);
    } catch {
      toast.info('Copying is blocked here. Note the details down.');
    }
  };

  if (created) {
    return (
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        onClosed={reset}
        title="Person added"
        footer={<Button size="lg" className="flex-1" onClick={() => onOpenChange(false)}>Done</Button>}
      >
        <div className="flex flex-col gap-4">
          <Callout tone="warning" title="Save these details now">They sign in with this email and password. The password isn't shown again.</Callout>
          <DetailList
            rows={[
              { label: 'Employee ID', value: <span className="num">{created.employeeId}</span> },
              { label: 'Name', value: created.name },
              { label: 'Email', value: created.email },
              { label: 'Password', value: <span className="num">{created.password}</span> },
            ]}
          />
          <Button variant="secondary" leadingIcon={copied ? <Check /> : <Copy />} onClick={copyPassword}>
            {copied ? 'Copied' : 'Copy email and password'}
          </Button>
        </div>
      </ResponsiveModal>
    );
  }

  const last = step === STEPS.length - 1;
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      onClosed={reset}
      dirty={dirty}
      title={isClusterHead ? 'Add a person' : 'Add staff'}
      description={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      footer={
        <>
          {step > 0 && (
            <Button variant="secondary" size="lg" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1"
            loading={saving}
            onClick={() => {
              if (last) create();
              else if (step === 0 ? checkBasics() : true) setStep((s) => s + 1);
            }}
          >
            {last ? 'Add person' : 'Next'}
          </Button>
        </>
      }
    >
      <ol className="mb-4 flex gap-1.5" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className="flex flex-1 flex-col gap-1">
            <span className={`h-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-surface-3'}`} aria-hidden="true" />
            <span className={`text-caption ${i === step ? 'font-semibold text-text' : 'text-text-3'}`}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          {isClusterHead && (
            <Field label="Role">
              <SegmentedControl
                aria-label="Role"
                value={form.role}
                onValueChange={(v) => set('role', v)}
                options={[
                  { value: 'employee', label: 'Staff' },
                  { value: 'manager', label: 'Manager' },
                  { value: 'cluster_head', label: 'Owner' },
                ]}
              />
            </Field>
          )}
          <Field label="Employment" helper={form.role === 'cluster_head' ? 'Owners are always permanent.' : undefined}>
            <SegmentedControl
              aria-label="Employment"
              value={form.employmentType}
              onValueChange={(v) => set('employmentType', v)}
              options={[
                { value: 'fulltime', label: 'Permanent' },
                { value: 'contract', label: 'Contract', disabled: form.role === 'cluster_head' },
              ]}
            />
          </Field>
          <Field label="Full name" required error={errors.name}>
            <Input value={form.name} autoComplete="off" onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Email" required error={errors.email} helper="They sign in with this.">
            <Input type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Password" required error={errors.password}>
            <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
          <Field label="Phone" optional>
            <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <DatePicker label="Date of birth" value={form.dob} onChange={(d) => set('dob', d)} className="w-full" />
          <DatePicker label="Joining date" value={form.joiningDate} onChange={(d) => set('joiningDate', d)} className="w-full" />
          {isClusterHead && form.role === 'manager' && (
            <Field label="Store" helper="The manager works from this store.">
              <NativeSelect value={form.storeId} onChange={(e) => set('storeId', e.target.value)}>
                <option value="">Choose a store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.location ? ` · ${s.location}` : ''}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {isManager && <Callout tone="info" title="They join your store">New staff are added to your store and report to you.</Callout>}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          {form.employmentType === 'fulltime' ? (
            <SalaryStructureEditor value={form.salaryStructure} onChange={(v) => set('salaryStructure', v)} />
          ) : (
            <Callout tone="neutral" title="Paid by the day">Contract staff are paid for the days they work. Set their daily rate in Team → Pay when you record a payout.</Callout>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          {form.role === 'employee' ? (
            <>
              <AadhaarPicker front={front} back={back} onFront={setFront} onBack={setBack} />
              <p className="text-caption text-text-3">Only the owner and the person themself can see these photos.</p>
            </>
          ) : (
            <Callout tone="neutral" title="No documents needed">Aadhaar photos are kept for staff only.</Callout>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}

// ---- Edit person ------------------------------------------------------------------------------

export function EditPersonForm({ person, open, onOpenChange, onSaved }: { person: Employee | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> | void }) {
  const [draft, setDraft] = React.useState<Employee | null>(person);
  const [front, setFront] = React.useState('');
  const [back, setBack] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // A new upload starts empty - nothing left over from another person's form.
  React.useEffect(() => {
    if (open) {
      setDraft(person);
      setFront('');
      setBack('');
    }
  }, [open, person]);

  if (!draft) return null;
  const set = <K extends keyof Employee>(key: K, value: Employee[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const dirty = JSON.stringify(draft) !== JSON.stringify(person) || !!front || !!back;

  const save = async () => {
    setSaving(true);
    try {
      // No role here - roles change only through the owner's Role and designation control
      // (PUT /employee/:id/role), never as a side effect of a profile edit.
      const updateData: Record<string, unknown> = {
        name: draft.name,
        email: draft.email,
        employmentType: draft.employmentType,
        joiningDate: draft.joiningDate,
        dob: draft.dob,
        phone: draft.phone,
        status: draft.status,
        salaryStructure: draft.salaryStructure,
      };
      if (front) updateData.aadharFront = front;
      if (back) updateData.aadharBack = back;
      await teamApi.updateUnifiedEmployee(draft.employeeId, updateData);
      toast.success('Saved');
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      console.error('Error updating employee:', error);
      toast.error(`Couldn't save: ${errorText(error, 'unknown error')}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      dirty={dirty}
      title="Edit details"
      description={`${draft.name} · ${draft.employeeId}`}
      footer={
        <Button size="lg" className="flex-1" loading={saving} onClick={save}>
          Save changes
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Employment">
          <SegmentedControl
            aria-label="Employment"
            value={draft.employmentType === 'contract' ? 'contract' : 'fulltime'}
            onValueChange={(v) => set('employmentType', v)}
            options={[
              { value: 'fulltime', label: 'Permanent' },
              { value: 'contract', label: 'Contract' },
            ]}
          />
        </Field>
        <Field label="Full name" required>
          <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Email" required>
          <Input type="email" inputMode="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone" optional>
          <Input type="tel" inputMode="tel" value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <DatePicker label="Date of birth" value={draft.dob || ''} onChange={(d) => set('dob', d)} className="w-full" />
        <DatePicker label="Joining date" value={draft.joiningDate || ''} onChange={(d) => set('joiningDate', d)} className="w-full" />
        {draft.employmentType === 'fulltime' && (
          <SalaryStructureEditor value={draft.salaryStructure || []} onChange={(v) => set('salaryStructure', v)} />
        )}
        {draft.role === 'employee' && (
          <Field label="Aadhaar card" optional helper="Pick new photos only to replace the ones on file.">
            <AadhaarPicker front={front} back={back} onFront={setFront} onBack={setBack} />
          </Field>
        )}
      </div>
    </ResponsiveModal>
  );
}
