// Owner's "Role and designation" editor for one person (Team → People → a person → Role and
// designation; also opened from Setup → Org structure). Role is the permission level
// (staff / manager / owner); designation is the job title. Same saves as before: the role goes
// through its own owner-only route, the rest through the profile update.
import { useEffect, useState } from 'react';
import * as api from '../utils/api';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ResponsiveModal } from './ui/responsive-modal';
import { NativeSelect } from './ui/select';
import { toast } from './ui/sonner';
import { teamApi } from './team/teamApi';
import { DetailList } from './team/shared';

type Employee = api.Employee;

interface EmployeeDetailsModalProps {
  employee: Employee;
  onClose: () => void;
  onSave: () => void;
  clusterHeadId?: string; // kept for callers that pass it; not used
}

export function EmployeeDetailsModal({ employee, onClose, onSave }: EmployeeDetailsModalProps) {
  const [open, setOpen] = useState(true);
  const [formData, setFormData] = useState({
    role: employee.role,
    designation: employee.designation || null,
    department: employee.department || null,
    clusterHeadId: employee.clusterHeadId || '',
    storeId: employee.storeId || '',
  });
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<api.Store[]>([]);

  useEffect(() => {
    teamApi
      .getStores()
      .then(setStores)
      .catch((error: unknown) => console.error('Error loading stores:', error));
  }, []);

  const dirty =
    formData.role !== employee.role ||
    formData.designation !== (employee.designation || null) ||
    formData.department !== (employee.department || null) ||
    formData.clusterHeadId !== (employee.clusterHeadId || '') ||
    formData.storeId !== (employee.storeId || '');

  const close = () => setOpen(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      if (formData.role !== employee.role) {
        await teamApi.updateEmployeeRole(employee.employeeId, formData.role);
      }
      const updates: Record<string, unknown> = {
        designation: formData.designation,
        department: formData.department,
        storeId: formData.storeId || null,
      };
      // Managers may report to another manager instead, so clusterHeadId can be cleared.
      if (formData.role === 'manager') updates.clusterHeadId = formData.clusterHeadId || null;
      await teamApi.updateUnifiedEmployee(employee.employeeId, updates);
      toast.success('Role and designation saved');
      onSave();
      close();
    } catch (error) {
      console.error('Error updating employee:', error);
      toast.error("Couldn't save the role and designation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      onClosed={onClose}
      dirty={dirty}
      title="Role and designation"
      description={`${employee.name} · ${employee.employeeId}`}
      footer={
        <Button size="lg" className="flex-1" loading={saving} onClick={handleSave}>
          Save changes
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <DetailList rows={[{ label: 'Name', value: employee.name }, { label: 'Email', value: employee.email }]} />

        <Field label="Role" helper="What they can do in the app: who manages whom.">
          <NativeSelect value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as Employee['role'] })}>
            <option value="employee">Staff</option>
            <option value="manager">Manager</option>
            <option value="cluster_head">Owner</option>
          </NativeSelect>
        </Field>

        {formData.role === 'manager' && (
          <Field label="Owner's employee ID" optional helper="Only for top-level managers. Leave empty if they report to another manager (set in Org structure).">
            <Input value={formData.clusterHeadId} placeholder="e.g. BM005" onChange={(e) => setFormData({ ...formData, clusterHeadId: e.target.value })} />
          </Field>
        )}

        <Field label="Designation" helper="Their job title, as shown in the org chart.">
          <NativeSelect
            value={formData.designation || ''}
            onChange={(e) => setFormData({ ...formData, designation: (e.target.value || null) as NonNullable<Employee['designation']> | null })}
          >
            <option value="">No designation</option>
            <option value="operations_incharge">Operations incharge</option>
            <option value="store_incharge">Store incharge</option>
            <option value="production_incharge">Production incharge</option>
            <option value="store_ops">Store operations</option>
            <option value="production_ops">Production operations</option>
            <option value="rider">Rider (logistics)</option>
          </NativeSelect>
        </Field>

        {(formData.designation === 'store_incharge' || formData.designation === 'store_ops') && (
          <Field label="Store" helper="The store they work at.">
            <NativeSelect value={formData.storeId || ''} onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}>
              <option value="">No store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

        <Field label="Department" helper="Which operations they can manage.">
          <NativeSelect
            value={formData.department || ''}
            onChange={(e) => setFormData({ ...formData, department: (e.target.value || null) as NonNullable<Employee['department']> | null })}
          >
            <option value="">No department</option>
            <option value="store_operations">Store operations</option>
            <option value="production">Production</option>
          </NativeSelect>
        </Field>

        <Callout tone="neutral" title="Role or designation?">
          Role is what they can do in the app (staff, manager, owner). Designation is their job title. A manager can carry the title Store incharge, so they manage staff and keep that title.
        </Callout>
      </div>
    </ResponsiveModal>
  );
}
