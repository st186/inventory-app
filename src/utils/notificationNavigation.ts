// Shared notification -> in-app navigation mapping.
// Keep this in sync with public/sw.js's NOTIFICATION_VIEW_MAP / getNavigationTarget,
// which duplicates this logic for the web push service worker context (plain JS, no imports).

export interface NotificationNavigationTarget {
  view: string;
  tab?: string;
  highlightRequestId?: string;
}

const NOTIFICATION_VIEW_MAP: Record<string, { view: string; tab?: string }> = {
  inventory_logged: { view: 'inventory' },
  sales_logged: { view: 'sales' },
  sales_pending: { view: 'sales' },
  sales_approved: { view: 'sales' },
  sales_rejected: { view: 'sales' },
  discrepancy_request: { view: 'sales' },
  discrepancy_approved: { view: 'sales' },
  discrepancy_rejected: { view: 'sales' },
  cash_topup_request: { view: 'sales' },
  cash_topup_approved: { view: 'sales' },
  production_cash_store_bill: { view: 'sales' },
  cash_topup_rejected: { view: 'sales' },
  paytm_recalibration_reminder: { view: 'sales' },
  pos_sync_stock_failed: { view: 'sales' },
  low_stock_alert: { view: 'stock-requests' },
  loan_requested: { view: 'sales' },
  loan_approved: { view: 'sales' },
  loan_rejected: { view: 'sales' },
  production_pending: { view: 'production', tab: 'approvals' },
  production_approved: { view: 'production' },
  production_log_reminder: { view: 'production' },
  delivery_incoming: { view: 'receive-stock' },
  stock_out: { view: 'stock-outs' },
  timesheet_pending: { view: 'attendance', tab: 'approve-timesheet' },
  timesheet_approved: { view: 'attendance', tab: 'timesheet' },
  timesheet_rejected: { view: 'attendance', tab: 'timesheet' },
  leave_pending: { view: 'attendance', tab: 'approve-leave' },
  leave_approved: { view: 'attendance', tab: 'leave' },
  leave_rejected: { view: 'attendance', tab: 'leave' },
  attendance_reminder: { view: 'attendance', tab: 'timesheet' },
  stock_request_new: { view: 'stock-requests', tab: 'pending-fulfillment' },
  stock_request_fulfilled: { view: 'stock-requests' },
  stock_request_partial: { view: 'stock-requests' },
  stock_request_cancelled: { view: 'stock-requests' },
  stock_request_reminder: { view: 'stock-requests' },
  stock_request_delayed: { view: 'analytics' },
  stock_recalibration: { view: 'analytics' },
  calendar_suggestions: { view: 'analytics', tab: 'trends' },
  fulfillment_reminder: { view: 'stock-requests', tab: 'pending-fulfillment' },
  data_entry_reminder: { view: 'inventory' },
  rider_called: { view: 'riders' },
  rider_ready: { view: 'riders' },
  rider_on_the_way: { view: 'riders' },
  rider_arrived: { view: 'riders' },
  rider_picked_up: { view: 'riders' },
  rider_delivered: { view: 'riders' },
  rider_cancelled: { view: 'riders' },
  rider_running_late: { view: 'riders' },
  rider_fare_proposed: { view: 'riders' },
  rider_fare_decided: { view: 'riders' },
  rider_receipt: { view: 'riders' },
  // Home: the expiry banner with "Change now" is there. Plain employees and riders are moved on to
  // their own first screen by App.tsx, which shows the same banner.
  password_expiring: { view: 'analytics' },
  // Workplace checks: staff land on their own list; "review" falls back to it for non-reviewers.
  workplace_due: { view: 'workplace', tab: 'mine' },
  workplace_missed: { view: 'workplace', tab: 'review' },
  workplace_flag: { view: 'workplace', tab: 'review' },
  kpi_ready: { view: 'my-kpis' }, // owner approved the month's review
  shift_checkin: { view: 'my-kpis' }, // phone saw an arrival / exit - the check-in card is on top there
};

export function getNavigationTarget(data: any): NotificationNavigationTarget | null {
  if (!data || !data.type) return null;

  if (typeof data.type === 'string' && (data.type.startsWith('production_request_') || data.type === 'delivery_variance') && data.relatedId) {
    return { view: 'analytics', highlightRequestId: data.relatedId };
  }
  if (data.type === 'stock_request_new' && data.relatedId) {
    return { view: 'stock-requests', tab: 'pending-fulfillment', highlightRequestId: data.relatedId };
  }

  const mapped = NOTIFICATION_VIEW_MAP[data.type];
  if (mapped) {
    return { view: mapped.view, tab: mapped.tab, highlightRequestId: data.relatedId || undefined };
  }
  return null;
}
