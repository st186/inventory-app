// Service Worker for Push Notifications
// This runs in the background and handles push events

self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let notificationData = {
    title: 'Bhandar-IMS',
    body: 'You have a new notification',
    icon: '/icon-192x192.png', // You can add your app icon here
    badge: '/badge-72x72.png',
    tag: 'bhandar-notification',
    requireInteraction: false,
  };

  if (event.data) {
    try {
      const data = event.data.json();
      // The server sends { title, message, tag, data: { type, relatedId, notificationId, ... } }.
      // Flatten the inner data onto the payload so the click handler finds data.type.
      const inner = data.data && typeof data.data === 'object' ? data.data : {};
      const flat = { ...data, ...inner };
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.message || data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        // One tag per notification: the server's tag is just the type, so a second push of
        // the same type silently replaced the first one still waiting in the tray.
        tag: flat.type && flat.notificationId ? `${flat.type}-${flat.notificationId}` : (data.tag || notificationData.tag),
        data: flat, // Store full data for click handling
        // Urgent stays on screen until dealt with; updates arrive without a sound; a bundle that
        // grew buzzes again (notificationRules.ts).
        requireInteraction: flat.category === 'urgent',
        // A photo (a dirty area, a complaint) where the browser can show one.
        ...(flat.imageUrl ? { image: flat.imageUrl } : {}),
        silent: flat.category === 'update',
        renotify: flat.category !== 'update',
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
    })
  );
});

// Build the deep-link target for a notification based on its type/relatedId.
// Keep this in sync with the "type" values used in the backend's notifyUser() calls.
// "view" values are the old screen names; the app maps each one to where that screen lives
// now (src/components/shell/router.ts LEGACY_ALIASES - scripts/router-test.mjs checks every
// entry here resolves). "tab" (where present) is passed on to the screen's own tabs
// (e.g. AttendancePortal.tsx's activeTab values).
const NOTIFICATION_VIEW_MAP = {
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
  // Event stalls: relatedId is the event id (opens that event); a momo return goes to the
  // production queue, where production confirms it.
  event_assigned: { view: 'events' },
  event_day_closed: { view: 'events', tab: 'sales' },
  event_momo_return: { view: 'stock-requests' },
  event_momo_return_received: { view: 'events', tab: 'stock' },
  paytm_recalibration_reminder: { view: 'sales' },
  pos_sync_stock_failed: { view: 'sales' },
  low_stock_alert: { view: 'analytics', tab: 'production-requests' },
  loan_requested: { view: 'sales' },
  loan_approved: { view: 'sales' },
  loan_rejected: { view: 'sales' },
  production_pending: { view: 'production', tab: 'approvals' },
  production_approved: { view: 'production' },
  production_log_reminder: { view: 'production' },
  delivery_incoming: { view: 'receive-stock' },
  stock_out: { view: 'stock-outs' },
  // Attendance: the recipient of "*_pending" is the approver, so they land on
  // the approval tab; the recipient of "*_approved/rejected" is the employee
  // who submitted it, so they land on their own timesheet/leave tab.
  timesheet_pending: { view: 'attendance', tab: 'approve-timesheet' },
  timesheet_approved: { view: 'attendance', tab: 'timesheet' },
  timesheet_rejected: { view: 'attendance', tab: 'timesheet' },
  leave_pending: { view: 'attendance', tab: 'approve-leave' },
  leave_approved: { view: 'attendance', tab: 'leave' },
  leave_rejected: { view: 'attendance', tab: 'leave' },
  attendance_reminder: { view: 'attendance', tab: 'timesheet' },
  stock_request_new: { view: 'analytics', tab: 'production-requests' },
  stock_request_fulfilled: { view: 'analytics', tab: 'production-requests' },
  stock_request_partial: { view: 'analytics', tab: 'production-requests' },
  stock_request_cancelled: { view: 'analytics', tab: 'production-requests' },
  stock_request_reminder: { view: 'analytics', tab: 'production-requests' },
  stock_count_reminder: { view: 'analytics', tab: 'production-requests' },
  compliance_due: { view: 'compliance' },
  compliance_overdue: { view: 'compliance' },
  stock_request_missed: { view: 'analytics', tab: 'production-requests' },
  stock_request_delayed: { view: 'analytics' }, // tracks production requests, not stock requests, despite the name
  stock_recalibration: { view: 'analytics' },
  calendar_suggestions: { view: 'analytics', tab: 'trends' }, // weekly AI festival-day draft
  fulfillment_reminder: { view: 'analytics', tab: 'production-requests' }, // covers both stock + production requests; lands on the fulfillment screen
  data_entry_reminder: { view: 'inventory' },
  expense_flag: { view: 'inventory' },
  expense_approval: { view: 'inventory' },
  expense_rejected: { view: 'inventory' },
  production_flag: { view: 'production' },
  repair_alert: { view: 'production' },
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
  rider_receipt: { view: 'riders' }, // covers both inventory + sales reminders
  password_expiring: { view: 'analytics' }, // home, where the expiry banner is (plain employees/riders are moved on to their own first screen)
  // Workplace checks: staff land on their own list; "review" falls back to it for non-reviewers.
  workplace_due: { view: 'workplace', tab: 'mine' },
  opening_due: { view: 'home' },
  opening_late: { view: 'home' },
  opening_pick: { view: 'home' },
  audit_assigned: { view: 'audits' },
  audit_report: { view: 'audits' },
  audit_paid: { view: 'audits' },
  supply_low: { view: 'home' },
  supply_sorted: { view: 'home' },
  shopping_list: { view: 'home' },
  shopping_done: { view: 'home' },
  workplace_checked: { view: 'workplace', tab: 'mine' },
  complaint_read: { view: 'complaints' },
  complaint_answered: { view: 'complaints' },
  workplace_missed: { view: 'workplace', tab: 'review' },
  workplace_flag: { view: 'workplace', tab: 'review' },
  workplace_alarm: { view: 'workplace', tab: 'review' },
  kpi_ready: { view: 'my-kpis' }, // owner approved the month's review
  shift_checkin: { view: 'my-kpis' }, // phone saw an arrival / exit - the check-in card is on top there
  // Server reminders that had no screen to open (WP0b): stock requests waiting for the production
  // house, deliveries to confirm, the end-of-day data alert, production cash gaps, salary and backup.
  acceptance_reminder: { view: 'analytics', tab: 'production-requests' },
  morning_request_reminder: { view: 'analytics', tab: 'production-requests' },
  delivery_confirmation_reminder: { view: 'home' }, // the deliveries card on Home
  shipped_delivery_check: { view: 'analytics', tab: 'production-requests' },
  eod_data_alert: { view: 'sales' },
  production_cash_discrepancy: { view: 'sales' },
  production_cash_discrepancy_request: { view: 'sales' },
  production_cash_discrepancy_approved: { view: 'sales' },
  production_cash_discrepancy_rejected: { view: 'sales' },
  salary_credited: { view: 'payroll' },
  backup_failed: { view: 'backup' },
};

function getNavigationTarget(payload) {
  // Notifications shown before the push handler flattened the payload keep type under .data.
  const data = payload && payload.data && typeof payload.data === 'object' ? { ...payload, ...payload.data } : payload;
  if (!data || !data.type) return null;

  // Production requests always carry a specific request to highlight/scroll to
  if ((data.type.startsWith('production_request_') || data.type === 'delivery_variance') && data.relatedId) {
    return { view: 'analytics', highlightRequestId: data.relatedId };
  }
  if (data.type === 'stock_request_new' && data.relatedId) {
    return { view: 'analytics', tab: 'production-requests', highlightRequestId: data.relatedId };
  }

  const mapped = NOTIFICATION_VIEW_MAP[data.type];
  if (mapped) {
    return { view: mapped.view, tab: mapped.tab, highlightRequestId: data.relatedId || undefined };
  }
  return null;
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked. data =', event.notification.data);

  const target = getNavigationTarget(event.notification.data);
  console.log('Computed navigation target:', target);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      console.log('Found', clientList.length, 'open client(s), scope =', self.registration.scope);
      // If app is already open in some tab, focus it and tell it where to navigate
      for (const client of clientList) {
        console.log('Checking client url:', client.url);
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          if (target && 'postMessage' in client) {
            console.log('Posting navigation target to existing client:', target);
            client.postMessage({ type: 'notification-navigate', target });
          } else {
            console.log('No target to post, or client has no postMessage (target=', target, ')');
          }
          return client.focus();
        }
      }
      console.log('No matching open client found, will open a new window');
      // Otherwise open a new window, passing the target as query params
      if (clients.openWindow) {
        if (target) {
          const params = new URLSearchParams({ view: target.view });
          if (target.tab) {
            params.set('tab', target.tab);
          }
          if (target.highlightRequestId) {
            params.set('highlightRequestId', target.highlightRequestId);
          }
          return clients.openWindow(`/?${params.toString()}`);
        }
        return clients.openWindow('/');
      }
    })
  );
});
