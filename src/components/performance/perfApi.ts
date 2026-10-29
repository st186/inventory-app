// Payslips and monthly performance notes (server performance.ts).
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type WriterKind = 'manager' | 'owner';
export type ChecklistItem = { key: string; label: string; labelBn: string };
export type Report = {
  month: string; employeeId: string; kind: WriterKind; writerName: string;
  items: (ChecklistItem & { score: number })[]; note: string; sentAt: string; updatedAt: string; average: number; read?: boolean;
};
export type Line = { key: string; label: string; amount: number };
export type Payslip = {
  number: string; month: string;
  employee: { employeeId: string; name: string; designation: string; place: string; joiningDate: string | null };
  earnings: Line[]; deductions: Line[]; totalEarnings: number; totalDeductions: number; net: number; inWords: string;
  payments: { date: string; amount: number; paidFrom?: string; ref?: string }[];
  kpi: { score: number; max: number } | null; leaveDays: number; advanceLeft: number; paid: boolean; ready: boolean;
};
export type InboxItem = { month: string; payslipReady: boolean; downloaded: boolean; reports: Report[] };
export type WritePerson = {
  employeeId: string; name: string; designation: string; kind: WriterKind; managerName: string | null;
  mine: Report | null; manager: Report | null;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await currentAccessToken()}`, ...regionHeaders(), ...(init?.headers || {}) },
    });
  } catch {
    throw new Error('No connection - try again');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export const getPayslip = (month: string, employeeId?: string) =>
  call<{ payslip: Payslip }>(`/payslip?month=${month}${employeeId ? `&employeeId=${encodeURIComponent(employeeId)}` : ''}`).then((r) => r.payslip);
export const getPayslipMonths = () => call<{ months: { month: string; paid: number; ready: boolean }[] }>('/payslip/months').then((r) => r.months);
export const getInbox = () => call<{ items: InboxItem[] }>('/payslip/inbox').then((r) => r.items);
export const markSeen = (month: string, b: { downloaded?: boolean; read?: WriterKind[] }) =>
  call<{ state: unknown }>(`/payslip/${month}/seen`, { method: 'POST', body: JSON.stringify(b) });
export const getChecklist = () => call<{ items: ChecklistItem[] }>('/performance/checklist').then((r) => r.items);
export const saveChecklist = (items: { label: string; labelBn: string }[]) =>
  call<{ items: ChecklistItem[] }>('/performance/checklist', { method: 'PUT', body: JSON.stringify({ items }) }).then((r) => r.items);
export const getToWrite = (month?: string) =>
  call<{ month: string; items: ChecklistItem[]; people: WritePerson[] }>(`/performance/write${month ? `?month=${month}` : ''}`);
export const writeReport = (month: string, employeeId: string, b: { items: { key: string; score: number }[]; note: string }) =>
  call<{ report: Report }>(`/performance/${month}/${encodeURIComponent(employeeId)}`, { method: 'PUT', body: JSON.stringify(b) }).then((r) => r.report);
export const getMyReports = () => call<{ months: { month: string; reports: Report[] }[] }>('/performance/mine').then((r) => r.months);
