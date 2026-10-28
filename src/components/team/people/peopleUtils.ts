// Labels and grouping for Team → People (manager screens, English).
import type * as api from '../../../utils/api';

export type Employee = api.Employee & { dailyRate?: number; monthlySalary?: number };

export const DESIGNATION_LABELS: Record<string, string> = {
  operations_incharge: 'Operations incharge',
  store_incharge: 'Store incharge',
  production_incharge: 'Production incharge',
  operations_manager: 'Operations manager',
  store_ops: 'Store crew',
  production_ops: 'Kitchen crew',
  rider: 'Rider',
};

export const ROLE_LABELS: Record<string, string> = {
  cluster_head: 'Owner',
  manager: 'Manager',
  employee: 'Staff',
};

export function roleLine(emp: Pick<Employee, 'designation' | 'role'>): string {
  if (emp.designation && DESIGNATION_LABELS[emp.designation]) return DESIGNATION_LABELS[emp.designation];
  if (emp.role === 'manager') return 'Operations manager';
  return ROLE_LABELS[emp.role] || emp.role || 'Staff';
}

export const typeLabel = (emp: Pick<Employee, 'employmentType'>) => (emp.employmentType === 'contract' ? 'Contract' : 'Permanent');

export type Workplace = 'store' | 'production' | 'other';

/** Where someone works: production for production designations / department / a production house id. */
export function workplaceOf(emp: Employee, stores: api.Store[], productionHouses: api.ProductionHouse[]): Workplace {
  if (emp.designation === 'production_incharge' || emp.designation === 'production_ops' || emp.department === 'production') return 'production';
  if (emp.storeId && productionHouses.some((ph) => ph.id === emp.storeId)) return 'production';
  if (emp.designation === 'store_incharge' || emp.designation === 'store_ops' || emp.department === 'store_operations') return 'store';
  if (emp.storeId && stores.some((s) => s.id === emp.storeId)) return 'store';
  return 'other';
}

export function placeName(emp: Employee, stores: api.Store[], productionHouses: api.ProductionHouse[]): string | null {
  if (!emp.storeId) return null;
  return stores.find((s) => s.id === emp.storeId)?.name || productionHouses.find((p) => p.id === emp.storeId)?.name || null;
}

export type PeopleFilter = 'all' | 'store' | 'production' | 'contract' | 'inactive';

export function matchesFilter(emp: Employee, filter: PeopleFilter, stores: api.Store[], productionHouses: api.ProductionHouse[]): boolean {
  switch (filter) {
    case 'store':
      return workplaceOf(emp, stores, productionHouses) === 'store';
    case 'production':
      return workplaceOf(emp, stores, productionHouses) === 'production';
    case 'contract':
      return emp.employmentType === 'contract';
    case 'inactive':
      return emp.status !== 'active';
    default:
      return true;
  }
}

/** Same search as before: employee ID, name or email. */
export function matchesSearch(emp: Employee, term: string): boolean {
  if (!term) return true;
  const q = term.toLowerCase();
  return emp.employeeId.toLowerCase().includes(q) || emp.name.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q);
}

export function summaryLine(list: Employee[], isOwner: boolean): string {
  const total = list.length;
  const permanent = list.filter((e) => e.employmentType === 'fulltime').length;
  const contract = list.filter((e) => e.employmentType === 'contract').length;
  const managers = list.filter((e) => e.role === 'manager').length;
  const inactive = list.filter((e) => e.status !== 'active').length;
  const parts = [`${total} ${total === 1 ? 'person' : 'people'}`, `${permanent} permanent`, `${contract} contract`];
  if (isOwner && managers) parts.push(`${managers} ${managers === 1 ? 'manager' : 'managers'}`);
  if (inactive) parts.push(`${inactive} inactive`);
  return parts.join(' · ');
}

/** "Incharge" / "Manager" / "Owner" stand out (brand chip); everyone else shows their type. */
export function chipFor(emp: Employee): { label: string; tone: 'brand' | 'neutral' } {
  if (emp.role === 'cluster_head') return { label: 'Owner', tone: 'brand' };
  if (emp.designation === 'store_incharge' || emp.designation === 'production_incharge' || emp.designation === 'operations_incharge') return { label: 'Incharge', tone: 'brand' };
  if (emp.role === 'manager') return { label: 'Manager', tone: 'brand' };
  return { label: typeLabel(emp), tone: 'neutral' };
}

export function formatJoin(iso?: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2y 3m 4d" between joining and release (Past people). */
export function durationText(joined: string | undefined, released: string | undefined): string {
  const start = new Date(joined || '');
  const end = new Date(released || '');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const durationDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const years = Math.floor(durationDays / 365);
  const months = Math.floor((durationDays % 365) / 30);
  const days = durationDays % 30;
  let out = '';
  if (years > 0) out += `${years}y `;
  if (months > 0) out += `${months}m `;
  if (days > 0 || out === '') out += `${days}d`;
  return out.trim();
}

export type SortKey = 'name' | 'employeeId' | 'role' | 'store' | 'type' | 'joiningDate' | 'status';
