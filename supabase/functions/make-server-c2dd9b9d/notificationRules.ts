// How each kind of notification behaves (owner, 28 Oct 2026: notifications brought up to date).
// A copy lives at src/utils/notificationRules.ts for the inbox - keep the two the same.
//
// category:
//   urgent   - something is wrong now (garbage, a machine down, a complaint, cash off). Always
//              pushed, even in quiet hours; escalated to the owner if nobody opens it in 30 min.
//   action   - someone must do something (approve, confirm, check, explain).
//   reminder - a nudge at a set time (photos due, store cover, timesheets).
//   update   - for information (approved, sent, logged). Can wait for the evening digest.
// bundle: a new one of the same kind within BUNDLE_MINUTES, still unread, folds into it
// ("Inventory logged +3 more") instead of adding another row and another buzz.
export type NotificationCategory = 'urgent' | 'action' | 'reminder' | 'update';
export const BUNDLE_MINUTES = 30;

const URGENT = new Set([
  'repair_alert', 'workplace_alarm', 'complaint_explain', 'backup_failed', 'pos_sync_stock_failed', 'eod_data_alert',
  'production_cash_discrepancy', 'stock_out', 'low_stock_alert', 'stock_request_delayed', 'shipped_delivery_check', 'escalation',
  'delivery_confirmation_reminder', // orders sent and not received or confirmed (owner, 29 Oct 2026: high priority)
  'stock_request_reminder', // tomorrow's stock request not sent, due by midnight (owner, 29 Oct 2026: critical)
  'stock_count_reminder', // the month-end momo count not entered yet (owner, 29 Oct 2026: urgent, up to 5 times)
  'compliance_overdue', // a licence, safety check or certificate past its due date (compliance.ts)
  'cctv_intruder', // a camera saw someone after working hours, nobody checked in there (cctv.ts)
]);
const ACTION = new Set([
  'expense_flag', 'production_flag', 'workplace_flag', 'workplace_missed', 'complaint_answered', 'complaint_read', 'expense_approval', 'expense_rejected', 'opening_late', 'opening_pick', 'audit_assigned', 'audit_report', 'supply_low', 'shopping_list', 'shopping_done', 'shift_checkin', 'delivery_incoming',
  'stock_request_new', 'stock_request_missed', 'event_momo_return', 'rider_fare_proposed', 'rider_called', 'calendar_suggestions', 'stock_recalibration',
  'compliance_due',
  'payslip_ready', 'performance_report', 'performance_due', // payslips and monthly performance notes (performance.ts)
  'cctv_ppe', // a camera saw someone without cap, gloves or apron (cctv.ts)
  'asset_missing', 'equipment_check_due', // lost equipment, and the 3-monthly equipment check (assets.ts)
]);
const REMINDER = new Set(['workplace_due', 'workplace_checked', 'opening_due', 'store_cover', 'password_expiring', 'paytm_recalibration_reminder']);
// Each needs its own row: approve / reject buttons act on one record.
const NEVER_BUNDLE = new Set(['expense_approval', 'leave_pending', 'timesheet_pending', 'production_pending', 'sales_pending', 'cash_topup_request', 'loan_requested', 'discrepancy_request', 'production_cash_discrepancy_request']);

export function notificationCategory(type: string): NotificationCategory {
  if (URGENT.has(type)) return 'urgent';
  if (ACTION.has(type) || type.endsWith('_pending') || type.endsWith('_request') || type.endsWith('_requested')) return 'action';
  if (REMINDER.has(type) || type.endsWith('_reminder')) return 'reminder';
  return 'update';
}

export function bundles(type: string): boolean {
  const cat = notificationCategory(type);
  if (NEVER_BUNDLE.has(type) || cat === 'urgent') return false;
  return cat === 'update' || type === 'expense_flag' || type === 'production_flag' || type === 'workplace_flag' || type === 'stock_request_new';
}

// Quiet hours, as HH:MM in IST; the window may run past midnight (23:00-07:00).
export function inQuietHours(prefs: { quietOn?: boolean; quietFrom?: string; quietTo?: string } | null, nowMs = Date.now()): boolean {
  if (!prefs?.quietOn) return false;
  const toMin = (s?: string) => { const m = /^(\d{2}):(\d{2})$/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const from = toMin(prefs.quietFrom), to = toMin(prefs.quietTo);
  if (from === null || to === null || from === to) return false;
  const d = new Date(nowMs + 330 * 60000);
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  return from < to ? now >= from && now < to : now >= from || now < to;
}

// Bengali after the English title for staff (not the owner or managers).
export const BENGALI_TITLE: Record<string, string> = {
  leave_approved: 'ছুটি মঞ্জুর', leave_rejected: 'ছুটি নামঞ্জুর', timesheet_approved: 'টাইমশিট মঞ্জুর', timesheet_rejected: 'টাইমশিট ফেরত',
  store_cover: 'আজ দোকানে ডিউটি', complaint_explain: 'অভিযোগের উত্তর দিন', complaint_decided: 'অভিযোগের সিদ্ধান্ত',
  shift_checkin: 'চেক-ইন নিশ্চিত করুন', attendance_reminder: 'হাজিরা মনে রাখুন', repair_alert: 'মেশিন খারাপ', production_flag: 'প্রোডাকশন যাচাই করুন',
  expense_flag: 'খরচ যাচাই করুন', workplace_alarm: 'নোংরা / আবর্জনা', salary_credited: 'বেতন জমা হয়েছে', kpi_ready: 'আপনার মাসের স্কোর',
  stock_request_new: 'নতুন স্টকের চাহিদা', delivery_incoming: 'মাল আসছে', data_entry_reminder: 'হিসাব লিখতে ভুলবেন না',
  workplace_due: 'ছবি তোলার সময়', workplace_checked: 'ছবি দেখা হয়েছে',
  payslip_ready: 'বেতনের স্লিপ তৈরি', performance_report: 'কাজের মূল্যায়ন', performance_due: 'মূল্যায়ন লিখুন',
  cctv_ppe: 'টুপি / গ্লাভস / অ্যাপ্রন নেই', cctv_intruder: 'কাজের সময়ের বাইরে কেউ ঢুকেছে',
  asset_missing: 'যন্ত্রপাতি হারিয়েছে', equipment_check_due: 'যন্ত্রপাতি মিলিয়ে দেখুন', equipment_check_done: 'যন্ত্রপাতি মেলানো হয়েছে',
  opening_due: 'দোকান খোলার চেকলিস্ট', opening_late: 'চেকলিস্ট বাকি আছে',
  supply_low: 'জিনিস কম আছে', supply_sorted: 'জিনিসের খবর', shopping_list: 'কেনাকাটার তালিকা',
};

export const DEFAULT_PREFS = { quietOn: true, quietFrom: '23:00', quietTo: '07:00', muted: {} as Partial<Record<NotificationCategory, boolean>>, digest: false };
